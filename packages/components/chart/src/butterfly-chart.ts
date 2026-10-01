import { state } from 'lit/decorators.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { EchartsChartBase } from './echarts-chart-base.js'
import { columnValue } from './chart-data.js'
import { niceScale } from './chart-scale.js'
import type { ChartEventMap, ChartLegendItem } from './chart-base.js'
import type { ChartFrame } from './chart-types.js'
import type { ChartBuildContext } from './chart-adapter.js'
import type { EchartsFeature } from './engines/echarts-loader.js'
import './chart-series.js'

export interface ButterflyChart {
  addEventListener: TypedAddEventListener<ButterflyChart, ChartEventMap>
  removeEventListener: TypedRemoveEventListener<ButterflyChart, ChartEventMap>
}

/** Space around the two plots, in pixels: the value axes' labels sit in the bottom one. */
const INSET = { top: 8, side: 22, bottom: 24 }

/**
 * A butterfly chart: two series drawn back to back as horizontal bars on a shared category axis, the first
 * growing towards the start and the second towards the end, with the categories named in the gutter between
 * them. A population pyramid is the classic case (age bands, men against women); any two-sided comparison of
 * the same categories fits, such as before and after, or two products' scores.
 *
 * Both sides share one scale, so equal values draw equal lengths, and the start side's axis is mirrored rather
 * than negated: every value, tick and tooltip reads as the number it is.
 *
 * ```html
 * <c2-butterfly-chart label-field="age"
 *   data='[{ "age": "80+", "men": 520, "women": 890 }, { "age": "70–79", "men": 1210, "women": 1480 }]'>
 *   <c2-chart-series field="men" label="Men"></c2-chart-series>
 *   <c2-chart-series field="women" label="Women"></c2-chart-series>
 * </c2-butterfly-chart>
 * ```
 *
 * @tag c2-butterfly-chart
 *
 * @slotcomponent c2-chart-series
 *
 * @cssproperty {pixel} [--c2-chart__gutter--width=56px] - Width of the gutter between the two sides, where the category labels are drawn.
 * @cssproperty {number} [--c2-chart__bar--thickness=0.72] - Share of each category's row a bar fills, from 0 to 1.
 */
@customElement('c2-butterfly-chart')
export class ButterflyChart extends EchartsChartBase {
  protected override readonly features: readonly EchartsFeature[] = ['bar', 'grid']

  constructor() {
    super()
    this.xType = 'category'
  }

  /**
   * The two plots are laid out in pixels around a gutter of fixed width, which ECharts cannot express as a share
   * of the box, so a change of width rebuilds them.
   */
  @state() private layoutWidth = 0

  /**
   * Bumped when new data needs a different scale. A data-only update skips the option rebuild, and the axes'
   * maximum and step are options, so the chart asks for one.
   */
  @state() private scaleRevision = 0

  /** The maximum the current options were built with. */
  #builtMax = 0

  #resizeObserver?: ResizeObserver
  #warnedExtraSeries = false

  protected override firstUpdated(): void {
    super.firstUpdated()
    const plot = this.plotElement
    if (!plot || typeof ResizeObserver === 'undefined') return
    this.#resizeObserver = new ResizeObserver((entries) => {
      const width = Math.round(entries[entries.length - 1]?.contentRect.width ?? 0)
      if (width !== this.layoutWidth) this.layoutWidth = width
    })
    this.#resizeObserver.observe(plot)
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.#resizeObserver?.disconnect()
    this.#resizeObserver = undefined
  }

  protected override validationError(): string {
    return this.resolvedSeries.length < 2 ? 'A butterfly chart needs two series, one for each side.' : ''
  }

  /** Only the first two series have a side to grow on; any others are left out of the legend too. */
  protected override legendItems(): ChartLegendItem[] {
    return super.legendItems().slice(0, 2)
  }

  protected override dataShape(): 'values' {
    return 'values'
  }

  protected override projectData(frame: ChartFrame, context: ChartBuildContext): unknown {
    if (niceScale(largestValue(frame)).max !== this.#builtMax) this.scaleRevision += 1
    return super.projectData(frame, context)
  }

  protected override buildOptions(context: ChartBuildContext): unknown {
    if (context.series.length > 2 && !this.#warnedExtraSeries) {
      this.#warnedExtraSeries = true
      console.warn(`<c2-butterfly-chart> draws two series; ${context.series.length - 2} more were left out.`)
    }
    return super.buildOptions({ ...context, series: context.series.slice(0, 2) })
  }

  /** Two plots side by side around the gutter, the start one mirrored, both on the same category axis. */
  protected override coordinateSystem(context: ChartBuildContext): Record<string, unknown> {
    const { theme } = context
    const { gutter } = this.#readLayout()
    const width = context.width
    const half = Math.max(0, (width - gutter) / 2)
    const labels = context.labels ?? []
    const scale = niceScale(this.frame ? largestValue(this.frame) : 0)
    this.#builtMax = scale.max
    // Which plot is on the left: the start side, which is the right in a right-to-left page.
    const startIsLeft = !this.#rtl
    const grid = (left: boolean) => ({
      top: INSET.top,
      bottom: INSET.bottom,
      left: left ? INSET.side : half + gutter,
      right: left ? half + gutter : INSET.side,
      containLabel: false,
    })
    const valueAxis = (index: number, left: boolean) => ({
      type: 'value',
      gridIndex: index,
      // One scale for both sides, ending on a tick, so equal values draw equal lengths.
      min: 0,
      max: scale.max,
      interval: scale.step,
      // The left plot grows leftwards from the gutter: a mirrored axis keeps its values and ticks positive.
      inverse: left,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: theme.axisColor, fontSize: theme.axisFontSize, formatter: (value: number) => this.#format(index, value) },
      splitLine: { lineStyle: { color: theme.gridColor } },
    })
    const categoryAxis = (index: number, left: boolean) => ({
      type: 'category',
      gridIndex: index,
      data: labels,
      // The first row is drawn at the top, as it is read.
      inverse: true,
      axisLine: { show: false },
      axisTick: { show: false },
      // Only the left plot's axis names the categories, from its inner edge into the middle of the gutter.
      position: 'right',
      axisLabel: left ? { show: true, align: 'center', margin: gutter / 2, color: theme.mutedColor, fontSize: theme.axisFontSize } : { show: false },
    })
    const leftIndex = startIsLeft ? 0 : 1
    const sides = [0, 1].map((index) => index === leftIndex)
    return {
      grid: sides.map((left) => grid(left)),
      xAxis: sides.map((left, index) => valueAxis(index, left)),
      yAxis: sides.map((left, index) => categoryAxis(index, left)),
    }
  }

  protected override seriesOption(index: number, context: ChartBuildContext): Record<string, unknown> {
    const { theme } = context
    const series = context.series[index] ?? { field: '' }
    const { thickness } = this.#readLayout()
    const left = (index === 0) !== this.#rtl
    const rows = Math.max(1, context.labels?.length ?? 1)
    // The bar's value end is rounded: its far end from the gutter.
    const bar = ((context.height - INSET.top - INSET.bottom) / rows) * thickness
    const radius = Math.round(theme.barRadius * bar * 100) / 100
    return {
      type: 'bar',
      xAxisIndex: index,
      yAxisIndex: index,
      barWidth: `${thickness * 100}%`,
      itemStyle: { color: this.colorOf(series, index, theme), borderRadius: left ? [radius, 0, 0, radius] : [0, radius, radius, 0] },
      emphasis: { focus: 'none' },
    }
  }

  #format(index: number, value: number): string {
    const series = this.resolvedSeries[index]
    return series?.format?.(value) ?? this.formatValue(value)
  }

  get #rtl(): boolean {
    return typeof getComputedStyle === 'function' && getComputedStyle(this).direction === 'rtl'
  }

  /** The `--c2-chart__gutter--width` and `--c2-chart__bar--thickness` variables, read off the host. */
  #readLayout(): { gutter: number; thickness: number } {
    if (typeof getComputedStyle !== 'function') return { gutter: 56, thickness: 0.72 }
    const style = getComputedStyle(this)
    const gutter = parseFloat(style.getPropertyValue('--c2-chart__gutter--width'))
    const thickness = parseFloat(style.getPropertyValue('--c2-chart__bar--thickness'))
    return {
      gutter: Number.isFinite(gutter) ? Math.max(0, gutter) : 56,
      thickness: Number.isFinite(thickness) ? Math.min(1, Math.max(0.05, thickness)) : 0.72,
    }
  }
}

/** The largest value on either side: only the first two series are drawn. */
function largestValue(frame: ChartFrame): number {
  let max = 0
  for (const column of frame.columns.slice(0, 2)) {
    for (let row = 0; row < frame.length; row += 1) {
      const value = columnValue(column, row)
      if (value !== null && value > max) max = value
    }
  }
  return max
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-butterfly-chart': ButterflyChart
  }
}
