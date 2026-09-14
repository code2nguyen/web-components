import { property } from 'lit/decorators.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { UplotChartBase, type UplotSeriesStyle } from './uplot-chart-base.js'
import { linePaths } from './engines/uplot-paths.js'
import type { ChartEventMap } from './chart-base.js'
import type { ChartBuildContext } from './chart-adapter.js'
import type { ChartSeriesConfig } from './chart-types.js'
import './chart-series.js'

export interface LineChart {
  addEventListener: TypedAddEventListener<LineChart, ChartEventMap>
  removeEventListener: TypedRemoveEventListener<LineChart, ChartEventMap>
}

/**
 * A line chart over a time or numeric x axis, drawn on canvas by uPlot.
 *
 * Series are declared as `c2-chart-series` children — the same authoring shape as `c2-table`'s columns —
 * or through the `series` property. With neither, one line is drawn per numeric key of the first row.
 *
 * ```html
 * <c2-line-chart x-type="time" x-field="t" legend="bottom" data='[{ "t": 1704067200000, "cpu": 12 }]'>
 *   <c2-chart-series field="cpu" label="CPU"></c2-chart-series>
 * </c2-line-chart>
 * ```
 *
 * Realtime feeds should call `appendPoint()` rather than reassigning `data`: it writes into the frame's
 * spare capacity and redraws without a Lit update.
 *
 * @tag c2-line-chart
 */
@customElement('c2-line-chart')
export class LineChart extends UplotChartBase {
  /** Interpolation between points. */
  @property({ type: String }) curve: 'linear' | 'smooth' | 'step' = 'linear'

  /** When point markers are drawn. `auto` lets uPlot show them once points are far enough apart. */
  @property({ type: String }) points: 'auto' | 'always' | 'none' = 'auto'

  protected override seriesStyle(series: ChartSeriesConfig, index: number, context: ChartBuildContext): UplotSeriesStyle {
    const { theme } = context
    return {
      stroke: this.colorOf(series, index, theme),
      width: series.lineWidth ?? theme.lineWidth,
      paths: linePaths(this.curve),
      spanGaps: series.spanGaps ?? false,
      points: {
        show: this.points === 'none' ? false : this.points === 'always' ? true : undefined,
        size: theme.pointRadius * 2,
      },
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-line-chart': LineChart
  }
}
