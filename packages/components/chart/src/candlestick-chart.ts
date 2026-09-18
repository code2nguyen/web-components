import { property } from 'lit/decorators.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { EchartsChartBase } from './echarts-chart-base.js'
import type { ChartEventMap, ChartLegendItem } from './chart-base.js'
import type { ChartBuildContext } from './chart-adapter.js'
import type { EchartsOptions } from './engines/echarts-adapter.js'
import type { EchartsFeature } from './engines/echarts-loader.js'
import { columnValue } from './chart-data.js'
import type { ChartFrame, ChartSeriesConfig } from './chart-types.js'
import './chart-series.js'

export interface CandlestickChart {
  addEventListener: TypedAddEventListener<CandlestickChart, ChartEventMap>
  removeEventListener: TypedRemoveEventListener<CandlestickChart, ChartEventMap>
}

/**
 * An OHLC candlestick chart drawn by ECharts. With no series children it reads the `open`, `close`, `low`
 * and `high` fields; the four `*-field` attributes rename that convention. Four explicit series children
 * can instead supply those columns in the same order.
 *
 * ```html
 * <c2-candlestick-chart label-field="date"
 *   data='[{ "date": "Mon", "open": 182, "close": 187, "low": 180, "high": 189 }]'>
 * </c2-candlestick-chart>
 * ```
 *
 * @tag c2-candlestick-chart
 *
 * @slotcomponent c2-chart-series
 */
@customElement('c2-candlestick-chart')
export class CandlestickChart extends EchartsChartBase {
  protected override readonly features: readonly EchartsFeature[] = ['candlestick', 'grid']

  /** Row field containing the opening value. */
  @property({ type: String, attribute: 'open-field' }) openField = 'open'

  /** Row field containing the closing value. */
  @property({ type: String, attribute: 'close-field' }) closeField = 'close'

  /** Row field containing the lowest value. */
  @property({ type: String, attribute: 'low-field' }) lowField = 'low'

  /** Row field containing the highest value. */
  @property({ type: String, attribute: 'high-field' }) highField = 'high'

  /** Name shown by an enabled legend for the complete OHLC series. */
  @property({ type: String }) name = 'Price'

  constructor() {
    super()
    this.xType = 'category'
    this.tooltip = 'axis'
    this.legend = 'none'
  }

  protected override inferredSeries(): ChartSeriesConfig[] {
    return [
      { field: this.openField, label: 'Open' },
      { field: this.closeField, label: 'Close' },
      { field: this.lowField, label: 'Low' },
      { field: this.highField, label: 'High' },
    ]
  }

  protected override coordinateSystem(context: ChartBuildContext): Record<string, unknown> {
    const axisLine = { lineStyle: { color: context.theme.gridColor } }
    const axisLabel = { color: context.theme.axisColor, fontSize: context.theme.fontSize }
    return {
      grid: { left: 48, right: 16, top: 16, bottom: 32, containLabel: false },
      xAxis: { type: 'category', data: this.xLabels(), boundaryGap: true, axisLine, axisLabel },
      yAxis: { type: 'value', scale: true, axisLine, axisLabel, splitLine: { lineStyle: { color: context.theme.gridColor } } },
    }
  }

  protected override projectData(frame: ChartFrame): unknown[] {
    const [open, close, low, high] = frame.columns
    const candles = Array.from({ length: frame.length }, (_item, index) => [
      open ? columnValue(open, index) : null,
      close ? columnValue(close, index) : null,
      low ? columnValue(low, index) : null,
      high ? columnValue(high, index) : null,
    ])
    return [candles]
  }

  protected override buildOptions(context: ChartBuildContext): EchartsOptions {
    const options = super.buildOptions(context) as EchartsOptions
    return { ...options, series: [{ name: this.name, ...this.seriesOption(0, context) }] }
  }

  protected override seriesOption(_index: number, context: ChartBuildContext): Record<string, unknown> {
    return {
      type: 'candlestick',
      itemStyle: {
        color: context.theme.positive,
        color0: context.theme.negative,
        borderColor: context.theme.positive,
        borderColor0: context.theme.negative,
      },
    }
  }

  protected override legendItems(): ChartLegendItem[] {
    const visible = !this.hiddenSeries.has(0)
    return [
      {
        label: this.name,
        color: this.themeController.theme.positive,
        visible,
        toggle: () => this.setSeriesVisible(0, !visible),
        series: { field: this.openField, label: this.name },
        index: 0,
      },
    ]
  }

  private xLabels(): string[] {
    const frame = this.frame
    if (!frame) return []
    return Array.from({ length: frame.length }, (_item, index) => frame.labels?.[index] ?? this.formatX(columnValue(frame.x, index) ?? index))
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-candlestick-chart': CandlestickChart
  }
}
