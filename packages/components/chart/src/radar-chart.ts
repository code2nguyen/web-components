import { property } from 'lit/decorators.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { EchartsChartBase } from './echarts-chart-base.js'
import { columnValue } from './chart-data.js'
import type { ChartEventMap } from './chart-base.js'
import type { ChartBuildContext } from './chart-adapter.js'
import type { EchartsFeature } from './engines/echarts-loader.js'
import type { ChartFrame } from './chart-types.js'
import './chart-series.js'

export interface RadarChart {
  addEventListener: TypedAddEventListener<RadarChart, ChartEventMap>
  removeEventListener: TypedRemoveEventListener<RadarChart, ChartEventMap>
}

/**
 * A radar chart drawn by ECharts. Each data row is an indicator named by `label-field`; each
 * `c2-chart-series` is one comparable profile drawn across those indicators.
 *
 * ```html
 * <c2-radar-chart label-field="metric" max="100"
 *   data='[{"metric":"Quality","current":82,"target":90},{"metric":"Speed","current":74,"target":85}]'>
 *   <c2-chart-series field="current" label="Current"></c2-chart-series>
 *   <c2-chart-series field="target" label="Target"></c2-chart-series>
 * </c2-radar-chart>
 * ```
 *
 * @tag c2-radar-chart
 *
 * @slotcomponent c2-chart-series
 */
@customElement('c2-radar-chart')
export class RadarChart extends EchartsChartBase {
  protected override readonly features: readonly EchartsFeature[] = ['radar']

  /** Lowest value shared by every indicator. */
  @property({ type: Number }) min = 0

  /** Highest value shared by every indicator. Auto-ranged per indicator when unset. */
  @property({ type: Number }) max?: number

  /** Shape of the indicator grid. */
  @property({ type: String }) shape: 'polygon' | 'circle' = 'polygon'

  /** Angle of the first indicator, in degrees counter-clockwise from three o'clock. */
  @property({ type: Number, attribute: 'start-angle' }) startAngle = 90

  /** Number of concentric divisions in the indicator grid. */
  @property({ type: Number, attribute: 'split-number' }) splitNumber = 5

  /** Whether to draw point markers at the indicator values. */
  @property({ type: String }) points: 'show' | 'none' = 'show'

  /** Opacity of each profile's fill. Falls back to `--c2-chart__area--opacity`. */
  @property({ type: Number, attribute: 'fill-opacity' }) fillOpacity?: number

  constructor() {
    super()
    this.xType = 'category'
    this.tooltip = 'item'
  }

  protected override coordinateSystem(context: ChartBuildContext): Record<string, unknown> {
    const { theme } = context
    return {
      radar: {
        indicator: this.indicators(),
        shape: this.shape,
        startAngle: this.startAngle,
        splitNumber: Math.max(1, Math.trunc(this.splitNumber)),
        radius: '68%',
        axisName: { color: theme.axisColor, fontSize: theme.fontSize },
        axisLine: { lineStyle: { color: theme.gridColor } },
        splitLine: { lineStyle: { color: theme.gridColor } },
        splitArea: { show: false },
      },
    }
  }

  protected override seriesOption(index: number, context: ChartBuildContext): Record<string, unknown> {
    const series = context.series[index] ?? { field: '' }
    const color = this.colorOf(series, index, context.theme)
    return {
      type: 'radar',
      symbol: this.points === 'show' ? 'circle' : 'none',
      symbolSize: context.theme.pointRadius * 2,
      lineStyle: { color, width: series.lineWidth ?? context.theme.lineWidth },
      itemStyle: { color },
      areaStyle: { color, opacity: this.fillOpacity ?? this.areaOpacity() },
    }
  }

  protected override projectData(frame: ChartFrame, context: ChartBuildContext): unknown {
    return context.series.map((series, seriesIndex) => {
      const column = frame.columns[seriesIndex]
      const values = new Array<number | null>(frame.length)
      for (let index = 0; index < frame.length; index += 1) values[index] = column ? columnValue(column, index) : null
      return [{ name: series.label ?? series.field, value: values }]
    })
  }

  private indicators(): { name: string; min: number; max: number }[] {
    const frame = this.frame
    if (!frame) return []
    return Array.from({ length: frame.length }, (_, indicatorIndex) => ({
      name: frame.labels?.[indicatorIndex] ?? String(indicatorIndex + 1),
      min: this.min,
      max: this.max ?? this.indicatorMax(frame, indicatorIndex),
    }))
  }

  private indicatorMax(frame: ChartFrame, indicatorIndex: number): number {
    let largest = this.min
    for (const column of frame.columns) {
      const value = columnValue(column, indicatorIndex)
      if (value !== null) largest = Math.max(largest, value)
    }
    if (largest <= this.min) return this.min + 1
    const padded = largest + (largest - this.min) * 0.1
    const magnitude = 10 ** Math.floor(Math.log10(Math.abs(padded)))
    return Math.ceil(padded / magnitude) * magnitude
  }

  private areaOpacity(): number {
    const raw = parseFloat(getComputedStyle(this).getPropertyValue('--c2-chart__area--opacity'))
    return Number.isFinite(raw) ? raw : 0.15
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-radar-chart': RadarChart
  }
}
