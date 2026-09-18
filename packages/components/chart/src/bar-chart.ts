import { property } from 'lit/decorators.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import type { Options } from 'uplot'
import { UplotChartBase, type UplotSeriesStyle } from './uplot-chart-base.js'
import { barPaths } from './engines/uplot-paths.js'
import type { ChartEventMap } from './chart-base.js'
import type { ChartBuildContext } from './chart-adapter.js'
import type { ChartSeriesConfig } from './chart-types.js'
import './chart-series.js'

export interface BarChart {
  addEventListener: TypedAddEventListener<BarChart, ChartEventMap>
  removeEventListener: TypedRemoveEventListener<BarChart, ChartEventMap>
}

/**
 * A bar chart drawn by uPlot's bars path builder, for categorical or time-bucketed values. Several series
 * are drawn side by side within each band.
 *
 * ```html
 * <c2-bar-chart label-field="team" legend="bottom" data='[{ "team": "Core", "shipped": 18 }]'>
 *   <c2-chart-series field="shipped" label="Shipped"></c2-chart-series>
 * </c2-bar-chart>
 * ```
 *
 * @tag c2-bar-chart
 *
 * @slotcomponent c2-chart-series
 */
@customElement('c2-bar-chart')
export class BarChart extends UplotChartBase {
  /** Share of each band a bar group occupies, from 0 to 1. */
  @property({ type: Number, attribute: 'bar-width' }) barWidth = 0.6

  /** Share of the group taken by the gaps between grouped bars, from 0 to 1. */
  @property({ type: Number, attribute: 'bar-gap' }) barGap = 0.1

  protected override seriesStyle(series: ChartSeriesConfig, index: number, context: ChartBuildContext): UplotSeriesStyle {
    const color = this.colorOf(series, index, context.theme)
    return {
      stroke: color,
      fill: color,
      width: 0,
      // The builder places this series within the group, so it has to know how many there are.
      paths: barPaths(this.barWidth, this.barGap, index, context.series.length, context.theme.barRadius),
      // A bar already marks its value; a dot on top of it is uPlot's line default showing through.
      points: { show: false },
    }
  }

  /** A band chart reads its x as discrete slots, so the scale is padded by half a band at each end. */
  protected override decorateOptions(options: Options, _context: ChartBuildContext): Options {
    return {
      ...options,
      scales: { ...options.scales, x: { ...options.scales?.x, time: false, range: (_self, min, max) => [min - 0.5, max + 0.5] } },
      // A bar chart's cursor belongs on the band, not between two points.
      cursor: { ...options.cursor, x: true, y: false },
    }
  }

  /**
   * Bars sit on category labels when there are any, so the tick shows the label rather than the index.
   *
   * uPlot picks its own split values, and on a handful of bands those land on halves — which would round
   * to the same label twice and then off the end of the list. A band has no label between its slots, so
   * those ticks are blank.
   */
  protected override formatAxisX(value: number): string {
    const labels = this.frame?.labels
    if (!labels) return super.formatAxisX(value)
    return Number.isInteger(value) ? (labels[value] ?? '') : ''
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-bar-chart': BarChart
  }
}
