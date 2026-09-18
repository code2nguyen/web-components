import { property } from 'lit/decorators.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { LineChart } from './line-chart.js'
import type { UplotSeriesStyle } from './uplot-chart-base.js'
import type { ChartEventMap } from './chart-base.js'
import type { ChartBuildContext } from './chart-adapter.js'
import { withAlpha } from './engines/uplot-paths.js'
import type { ChartSeriesConfig } from './chart-types.js'

export interface AreaChart {
  addEventListener: TypedAddEventListener<AreaChart, ChartEventMap>
  removeEventListener: TypedRemoveEventListener<AreaChart, ChartEventMap>
}

/**
 * A line chart with the region under each line filled — an area chart *is* a line chart plus a fill, so it
 * extends `c2-line-chart` and every one of its attributes (`curve`, `points`, `zoom`, the axis bounds)
 * means the same thing here.
 *
 * ```html
 * <c2-area-chart x-type="time" x-field="t" fill-opacity="0.2" data="[]">
 *   <c2-chart-series field="sessions" label="Sessions"></c2-chart-series>
 * </c2-area-chart>
 * ```
 *
 * @tag c2-area-chart
 *
 * @slotcomponent c2-chart-series
 */
@customElement('c2-area-chart')
export class AreaChart extends LineChart {
  /** Opacity of the fill under each line. Falls back to `--c2-chart__area--opacity`. */
  @property({ type: Number, attribute: 'fill-opacity' }) fillOpacity?: number

  protected override seriesStyle(series: ChartSeriesConfig, index: number, context: ChartBuildContext): UplotSeriesStyle {
    const base = super.seriesStyle(series, index, context)
    const color = this.colorOf(series, index, context.theme)
    const opacity = this.fillOpacity ?? this.areaOpacity(context)
    return { ...base, fill: withAlpha(color, opacity) }
  }

  /** Reads `--c2-chart__area--opacity` off the host, falling back to uPlot-friendly 0.15. */
  private areaOpacity(_context: ChartBuildContext): number {
    const raw = parseFloat(getComputedStyle(this).getPropertyValue('--c2-chart__area--opacity'))
    return Number.isFinite(raw) ? raw : 0.15
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-area-chart': AreaChart
  }
}
