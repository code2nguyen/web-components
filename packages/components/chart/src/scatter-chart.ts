import { property } from 'lit/decorators.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { EchartsChartBase } from './echarts-chart-base.js'
import type { ChartEventMap } from './chart-base.js'
import type { ChartBuildContext } from './chart-adapter.js'
import type { EchartsFeature } from './engines/echarts-loader.js'
import './chart-series.js'

export interface ScatterChart {
  addEventListener: TypedAddEventListener<ScatterChart, ChartEventMap>
  removeEventListener: TypedRemoveEventListener<ScatterChart, ChartEventMap>
}

/**
 * A scatter plot drawn by ECharts. `x-field` supplies the shared horizontal value and every series supplies
 * one vertical measure, so several populations can be compared on the same axes.
 *
 * ```html
 * <c2-scatter-chart x-field="risk" data='[{ "risk": 12, "return": 8.4 }]'>
 *   <c2-chart-series field="return" label="Portfolio"></c2-chart-series>
 * </c2-scatter-chart>
 * ```
 *
 * @tag c2-scatter-chart
 *
 * @slotcomponent c2-chart-series
 */
@customElement('c2-scatter-chart')
export class ScatterChart extends EchartsChartBase {
  protected override readonly features: readonly EchartsFeature[] = ['scatter', 'grid']

  /** Diameter of each point in CSS pixels. */
  @property({ type: Number, attribute: 'symbol-size' }) symbolSize = 10

  /** Shape used for points. */
  @property({ type: String }) symbol: 'circle' | 'rect' | 'roundRect' | 'triangle' | 'diamond' | 'pin' | 'arrow' = 'circle'

  /** Enables ECharts' large-point rendering path. */
  @property({ type: Boolean }) large = false

  /** Point count at which the large rendering path takes effect. */
  @property({ type: Number, attribute: 'large-threshold' }) largeThreshold = 2000

  constructor() {
    super()
    this.tooltip = 'item'
  }

  protected override seriesOption(index: number, context: ChartBuildContext): Record<string, unknown> {
    return {
      type: 'scatter',
      symbol: this.symbol,
      symbolSize: this.symbolSize,
      large: this.large,
      largeThreshold: this.largeThreshold,
      itemStyle: { color: this.colorOf(context.series[index] ?? { field: '' }, index, context.theme) },
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-scatter-chart': ScatterChart
  }
}
