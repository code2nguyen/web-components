import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { EchartsChartBase } from './echarts-chart-base.js'
import type { ChartEventMap } from './chart-base.js'
import type { ChartBuildContext } from './chart-adapter.js'
import type { EchartsFeature } from './engines/echarts-loader.js'
import './chart-series.js'

export interface GaugeChart {
  addEventListener: TypedAddEventListener<GaugeChart, ChartEventMap>
  removeEventListener: TypedRemoveEventListener<GaugeChart, ChartEventMap>
}

/**
 * A radial gauge drawn by ECharts. Use one row and one series for a current value; `label-field` names it.
 *
 * ```html
 * <c2-gauge-chart label-field="metric" min="0" max="100" value-suffix="%" data='[{ "metric": "Target", "value": 78 }]'>
 *   <c2-chart-series field="value" label="Attainment"></c2-chart-series>
 * </c2-gauge-chart>
 * ```
 *
 * @tag c2-gauge-chart
 *
 * @slotcomponent c2-chart-series
 */
@customElement('c2-gauge-chart')
export class GaugeChart extends EchartsChartBase {
  protected override readonly features: readonly EchartsFeature[] = ['gauge']

  /** Lowest value on the gauge scale. */
  @property({ type: Number }) min = 0

  /** Highest value on the gauge scale. */
  @property({ type: Number }) max = 100

  /** Angle where the arc starts, in degrees counter-clockwise from three o'clock. */
  @property({ type: Number, attribute: 'start-angle' }) startAngle = 225

  /** Angle where the arc ends, in degrees counter-clockwise from three o'clock. */
  @property({ type: Number, attribute: 'end-angle' }) endAngle = -45

  /** Number of labelled divisions around the arc. */
  @property({ type: Number, attribute: 'split-number' }) splitNumber = 5

  /** Maximum number of decimal places shown in the current value. */
  @property({ type: Number }) precision = 0

  /** Text appended to the current value and scale labels, such as `%`. */
  @property({ type: String, attribute: 'value-suffix' }) valueSuffix = ''

  /** Whether to draw the filled progress arc up to the current value. */
  @property({ type: String }) progress: 'show' | 'none' = 'show'

  /** Whether to draw the radial pointer. */
  @property({ type: String }) pointer: 'show' | 'none' = 'show'

  /** Whether to draw the small axis ticks and division lines around the arc. */
  @property({ type: String }) marks: 'show' | 'none' = 'show'

  constructor() {
    super()
    this.tooltip = 'item'
    this.legend = 'none'
  }

  protected override coordinateSystem(): Record<string, unknown> {
    return {}
  }

  protected override dataShape(): 'named' {
    return 'named'
  }

  protected override seriesOption(index: number, context: ChartBuildContext): Record<string, unknown> {
    const color = this.colorOf(context.series[index] ?? { field: '' }, index, context.theme)
    const precision = Math.max(0, Math.min(20, Math.trunc(this.precision)))
    const number = new Intl.NumberFormat(this.locale, { maximumFractionDigits: precision, minimumFractionDigits: precision })
    const formatValue = (value: number) => `${number.format(value)}${this.valueSuffix}`
    return {
      type: 'gauge',
      min: this.min,
      max: this.max,
      startAngle: this.startAngle,
      endAngle: this.endAngle,
      splitNumber: this.splitNumber,
      progress: { show: this.progress === 'show', width: 12, roundCap: true, itemStyle: { color } },
      pointer: { show: this.pointer === 'show', itemStyle: { color } },
      axisLine: { lineStyle: { width: 12, color: [[1, context.theme.gridColor]] } },
      axisTick: { show: this.marks === 'show', lineStyle: { color: context.theme.axisColor } },
      splitLine: { show: this.marks === 'show', lineStyle: { color: context.theme.axisColor } },
      axisLabel: { color: context.theme.axisColor, fontSize: context.theme.fontSize, formatter: formatValue },
      // Keep the value and metric inside the quiet centre of the dial. The previous 43% / 67% offsets
      // pushed both into the lower arc, where they collided with the scale's min/max labels.
      title: { color: context.theme.mutedColor, fontSize: context.theme.fontSize, offsetCenter: [0, '25%'] },
      detail: {
        color: context.theme.color,
        fontSize: Math.max(20, context.theme.fontSize * 1.8),
        fontWeight: 650,
        offsetCenter: [0, '-3%'],
        formatter: formatValue,
      },
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-gauge-chart': GaugeChart
  }
}
