import { unsafeCSS, type CSSResultGroup, type PropertyValues } from 'lit'
import { state } from 'lit/decorators.js'
import { property, jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { getFieldValue } from '@c2n/core/data-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import type uPlot from 'uplot'
import type { Options } from 'uplot'
import histogramStyles from './histogram-chart.scss?inline'
import { ChartBase, type ChartEventMap, type ChartLegendItem } from './chart-base.js'
import { BarChart } from './bar-chart.js'
import type { UplotSeriesStyle } from './uplot-chart-base.js'
import { binHistogram, collectSamples, histogramPercentile, type HistogramBin, type HistogramModel } from './histogram-bins.js'
import { histogramMessages } from './histogram-messages.js'
import type { ChartBuildContext } from './chart-adapter.js'
import type { ChartFrame, ChartInput, ChartPointEventDetail, ChartSeriesConfig, ChartTooltipContext } from './chart-types.js'
import type * as Overlay from './histogram-overlay.js'
import './chart-series.js'

export { binHistogram, histogramPercentile } from './histogram-bins.js'
export type { HistogramBin, HistogramBinOptions, HistogramModel } from './histogram-bins.js'

/** The line drawn over the bars, per series. */
export type HistogramOverlay = 'none' | 'density' | 'cumulative'

/** What `renderTooltip`, the `tooltip-change` event and a linked `c2-chart-tooltip` receive. */
export interface HistogramTooltipContext extends ChartTooltipContext {
  bin?: HistogramBin
}

export interface HistogramChart {
  addEventListener: TypedAddEventListener<HistogramChart, ChartEventMap>
  removeEventListener: TypedRemoveEventListener<HistogramChart, ChartEventMap>
}

const CUMULATIVE_SCALE = 'cumulative'

/** Whole-number steps for the count axis. */
const COUNT_INCREMENTS = Array.from({ length: 30 }, (_step, index) => [1, 2, 5][index % 3] * 10 ** Math.floor(index / 3))

/** The overlay module, shared by every histogram once one has asked for it. */
let overlayModule: Promise<typeof Overlay> | undefined

interface CachedModel {
  data: unknown
  revision: number
  key: string
  model: HistogramModel
  /** Each bin's position by its centre, the x of its bar. */
  index: Map<number, number>
  frame: ChartFrame | undefined
}

/**
 * A histogram: raw numeric samples cut into bins in the browser and drawn as touching bars by the bar chart's uPlot
 * engine, for latency, order values, durations or scores.
 *
 * `data` is the samples: a number array (one series), or rows whose `c2-chart-series` field holds a sample or an array
 * of them. Several series share one set of bins, side by side or stacked with `stack`. The bins follow Sturges' rule on
 * a nice width unless `bin-count`, `bin-width`, `bin-start` or `bin-end` say otherwise. `overlay` draws a density curve
 * or the cumulative share (on a 0–100% axis at the right) over the bars, and `percentiles` marks percentiles with
 * dashed rules. The tooltip, the events and the hidden table name each bin by its range.
 *
 * ```html
 * <c2-histogram-chart bin-width="50" overlay="density" percentiles="[50, 90]" data="[182, 240, 310, 420, 266, 198]">
 *   <c2-chart-series field="value" label="Latency (ms)"></c2-chart-series>
 * </c2-histogram-chart>
 * ```
 *
 * A `dataSource` window supplies the samples, and each point it pushes adds one sample per series.
 *
 * @tag c2-histogram-chart
 *
 * @slotcomponent c2-chart-series
 *
 * @cssproperty {pixel} [--c2-chart__bin--gap=1px] - Gap between neighbouring bins, in the surface colour. `0` joins them.
 * @cssproperty {color} [--c2-chart__overlay--color=#18181b] - Colour of the overlay line of a single series; with several, each takes its series colour.
 * @cssproperty {pixel} [--c2-chart__overlay--width=2px] - Width of the overlay line.
 * @cssproperty {color} [--c2-chart__percentile--color=#18181b] - Colour of the percentile markers of a single series; with several, each takes its series colour.
 * @cssproperty {pixel} [--c2-chart__percentile--width=1px] - Width of a percentile marker.
 */
@customElement('c2-histogram-chart')
export class HistogramChart extends BarChart {
  static override styles: CSSResultGroup = [ChartBase.styles, unsafeCSS(histogramStyles)]

  /** Roughly how many bins, rounded to a nice width. `0` follows Sturges' rule. Ignored when `bin-width` is set. */
  @property({ type: Number, attribute: 'bin-count' }) binCount = 0

  /** The width of every bin, in sample units. `0` derives it from `bin-count`. */
  @property({ type: Number, attribute: 'bin-width' }) binWidth = 0

  /** Where the first bin starts; samples below it are left out. Defaults to the smallest sample, rounded down. */
  @property({ type: Number, attribute: 'bin-start' }) binStart?: number

  /** Where the last bin ends, rounded up to a whole bin; samples above it are left out. Defaults to the largest sample, rounded up. */
  @property({ type: Number, attribute: 'bin-end' }) binEnd?: number

  /**
   * A line over the bars, per series: `density`, a kernel density estimate in counts (not drawn on stacked bars), or
   * `cumulative`, the share of samples up to each bin edge on a 0–100% axis.
   */
  @property({ type: String }) overlay: HistogramOverlay = 'none'

  /** Percentiles to mark, 0 to 100, such as `[50, 90, 99]`: a dashed rule at each, per series, labelled `p50`. */
  @property({ converter: jsonPropertyConverter }) percentiles?: number[]

  /** Bumped by {@link appendPoint}, so pushed samples re-bin through the data path. */
  @state() private sampleRevision = 0

  private readonly msg = new LocalizeController(this, histogramMessages, () => this.locale)

  /** Samples pushed by {@link appendPoint}, per series, and the `data` they sit on top of. */
  #pushed: number[][] = []
  #pushedOn: unknown
  #model?: CachedModel
  #overlay?: typeof Overlay

  constructor() {
    super()
    // Neighbouring bins touch; the gap between them is a stroke.
    this.barWidth = 1
  }

  /** Every bin as drawn: its edges and one count per series. */
  get bins(): HistogramBin[] {
    return this.#computeModel().model.bins.map((bin) => ({ ...bin, counts: [...bin.counts] }))
  }

  /** Assigns `data`; the samples are re-binned on the next update. */
  override updateData(next: ChartInput): void {
    this.data = next
  }

  /**
   * Adds `values[i]` as one sample of series `i` (`null` adds nothing) and re-bins; `x` is not read. With
   * `max-points`, only that many pushed samples are kept per series. Replacing `data` drops them.
   */
  override appendPoint(_x: number, values: readonly (number | null)[]): void {
    this.#syncPushed()
    values.forEach((value, index) => {
      if (value === null || !Number.isFinite(value)) return
      const samples = (this.#pushed[index] ??= [])
      samples.push(value)
      if (this.maxPoints > 0 && samples.length > this.maxPoints) samples.splice(0, samples.length - this.maxPoints)
    })
    this.sampleRevision += 1
  }

  protected override isDataKey(key: string): boolean {
    return super.isDataKey(key) || key === 'sampleRevision'
  }

  protected override reshapesFrame(changed: PropertyValues): boolean {
    return super.reshapesFrame(changed) || ['sampleRevision', 'binCount', 'binWidth', 'binStart', 'binEnd'].some((key) => changed.has(key))
  }

  protected override willUpdate(changed: PropertyValues): void {
    super.willUpdate(changed)
    if (!this.#overlay && (this.overlay === 'density' || this.overlay === 'cumulative' || this.#marks().length)) {
      overlayModule ??= import('./histogram-overlay.js')
      overlayModule.then(
        (module) => {
          this.#overlay = module
          this.adapter?.redraw?.()
        },
        (error: unknown) => {
          // A chunk that failed to load is asked for again by the next update, not cached as a failure.
          overlayModule = undefined
          this.dispatchEvent(new CustomEvent('chart-error', { detail: { error } }))
        },
      )
    }
  }

  protected override buildFrame(): ChartFrame | undefined {
    return this.#computeModel().frame
  }

  protected override get accessibleRowHeading(): string {
    return this.msg.t('bin')
  }

  protected override accessibleSummary(resolved: ChartSeriesConfig[] = this.resolvedSeries): string {
    const authored = this.getAttribute('aria-label')?.trim()
    if (authored) return authored
    const { model } = this.#computeModel()
    const name = (item: ChartSeriesConfig) => item.label || item.field
    let summary = this.msg.t('summary', resolved.map(name).join(', '), this.formatValue(model.bins.length))
    if (this.overlay === 'density' || this.overlay === 'cumulative')
      summary = this.msg.t(this.overlay === 'density' ? 'withDensity' : 'withCumulative', summary)
    resolved.forEach((item, index) => {
      const values = this.#marks()
        .map((p) => [p, histogramPercentile(model, index, p)])
        .filter(([, value]) => Number.isFinite(value))
        .map(([p, value]) => this.msg.t('percentileValue', this.msg.t('percentile', this.formatValue(p)), this.#formatEdge(value)))
      if (values.length) summary = this.msg.t('summaryPercentiles', summary, name(item), values.join(', '))
    })
    return summary
  }

  /** One series needs no legend, unless a `legend` slot fills it. */
  protected override legendItems(): ChartLegendItem[] {
    return this.resolvedSeries.length < 2 && !this.querySelector(':scope > [slot="legend"]') ? [] : super.legendItems()
  }

  /** A bar's x is its bin's centre, named by the bin's range. */
  protected override formatX(value: number): string {
    const { model, index } = this.#computeModel()
    const bin = model.bins[index.get(value) ?? -1]
    return bin ? this.msg.t('range', this.#formatEdge(bin.from), this.#formatEdge(bin.to)) : super.formatX(value)
  }

  protected override tooltipContextAt(detail: { index: number; seriesIndex: number; px: number; py: number }): HistogramTooltipContext {
    const bin = this.#computeModel().model.bins[detail.index]
    return { ...super.tooltipContextAt(detail), ...(bin ? { bin: { ...bin, counts: [...bin.counts] } } : {}) }
  }

  protected override pointAt(index: number, seriesIndex: number): ChartPointEventDetail | undefined {
    const point = super.pointAt(index, seriesIndex)
    return point && { ...point, label: this.formatX(point.x) }
  }

  /** The gap between bins is a stroke in the surface colour, one pixel however many bins there are. */
  protected override seriesStyle(series: ChartSeriesConfig, index: number, context: ChartBuildContext): UplotSeriesStyle {
    const style = super.seriesStyle(series, index, context)
    const width = this.#pixels('--c2-chart__bin--gap', 1)
    return width > 0 ? { ...style, stroke: context.theme.surface, width } : style
  }

  /** The highlighted series keeps its gap: a heavier stroke would be a wider gap, thinning its bars. */
  protected override highlightStyle(style: UplotSeriesStyle, index: number, context: ChartBuildContext): UplotSeriesStyle {
    return index === context.highlighted ? {} : super.highlightStyle(style, index, context)
  }

  protected override decorateOptions(options: Options, context: ChartBuildContext): Options {
    const decorated = super.decorateOptions(options, context)
    const horizontal = this.orientation === 'horizontal'
    const scales = { ...decorated.scales }
    const axes = [...(decorated.axes ?? [])]

    // Read when ranged, so new samples need no option rebuild. Horizontal bins run up from the bottom.
    scales.x = {
      ...scales.x,
      range: (_self, min, max) => {
        const { edges } = this.#computeModel().model
        return edges.length > 1 ? [edges[0], edges[edges.length - 1]] : [min ?? 0, max ?? 1]
      },
      ...(horizontal ? { dir: 1 as const } : {}),
    }
    if (axes[0]) {
      axes[0] = {
        ...axes[0],
        splits: (self: uPlot) => this.#edgeSplits(self, context),
        values: (_self: uPlot, splits: number[]) => splits.map((value) => this.#formatEdge(value)),
      }
    }
    if (axes[1] && this.stack !== 'percent') axes[1] = { ...axes[1], incrs: COUNT_INCREMENTS }
    if (this.overlay === 'cumulative' && axes[1]) {
      scales[CUMULATIVE_SCALE] = { range: () => [0, 100], ...(horizontal ? { ori: 0 as const } : {}) }
      axes.push({
        ...axes[1],
        scale: CUMULATIVE_SCALE,
        side: horizontal ? 0 : 1,
        grid: { show: false },
        incrs: undefined,
        splits: () => [0, 25, 50, 75, 100],
        values: (_self: uPlot, splits: number[]) => splits.map((value) => `${this.formatValue(value)}%`),
      })
    }

    const request = this.#overlayRequest(context)
    return {
      ...decorated,
      scales,
      axes,
      hooks: {
        ...decorated.hooks,
        draw: [...(decorated.hooks?.draw ?? []), (self: uPlot) => this.#overlay?.drawHistogramOverlay(self, { ...request, model: this.#computeModel().model })],
      },
    }
  }

  #syncPushed(): void {
    if (this.#pushedOn === this.data) return
    this.#pushed = []
    this.#pushedOn = this.data
  }

  #computeModel(): CachedModel {
    this.#syncPushed()
    const series = this.resolvedSeries
    // `revision` too: data mutated in place and announced by bumping it is the same array.
    const key = JSON.stringify([series.map((item) => item.field), this.binCount, this.binWidth, this.binStart, this.binEnd, this.revision])
    const cached = this.#model
    if (cached && cached.data === this.data && cached.revision === this.sampleRevision && cached.key === key) return cached

    const data = this.data
    const samples = series.map((_item, index) => [...(this.#pushed[index] ?? [])])
    for (const row of Array.isArray(data) ? (data as unknown[]) : []) {
      if (typeof row === 'number' || typeof row === 'string') {
        if (samples[0]) collectSamples(row, samples[0])
      } else if (row && typeof row === 'object' && !Array.isArray(row)) {
        series.forEach((item, index) => collectSamples(getFieldValue(row as Record<string, unknown>, item.field), samples[index]))
      }
    }
    const model = binHistogram(samples, { count: this.binCount, width: this.binWidth, start: this.binStart, end: this.binEnd })
    const centres = model.bins.map((bin) => (bin.from + bin.to) / 2)
    const length = centres.length
    const frame =
      data === undefined && !this.#pushed.length
        ? undefined
        : {
            x: Float64Array.from(centres),
            columns: series.map((_item, index) => Float64Array.from(model.bins, (bin) => bin.counts[index] ?? 0)),
            length,
            capacity: length,
            revision: this.sampleRevision,
          }
    this.#model = { data, revision: this.sampleRevision, key, model, index: new Map(centres.map((centre, at) => [centre, at])), frame }
    return this.#model
  }

  /** A bin edge or a percentile, with as many decimals as the bin width needs (an edge at 0.025 is not "0.03"). */
  #formatEdge(value: number): string {
    const step = this.#computeModel().model.step
    const digits = step > 0 ? Math.min(20, Math.max(2, Math.ceil(-Math.log10(step)) + 1)) : 2
    return new Intl.NumberFormat(this.locale, { maximumFractionDigits: digits }).format(value)
  }

  #marks(): number[] {
    return (Array.isArray(this.percentiles) ? this.percentiles : []).map(Number).filter((p) => p >= 0 && p <= 100)
  }

  #pixels(name: string, fallback: number): number {
    const value = parseFloat(getComputedStyle(this).getPropertyValue(name))
    return Number.isFinite(value) ? value : fallback
  }

  #font(context: ChartBuildContext, size: number): string {
    const family = context.theme.fontFamily === 'inherit' ? 'system-ui, sans-serif' : context.theme.fontFamily
    return `${size * devicePixelRatio}px ${family}`
  }

  /** The overlay's look, read once per option build; colours go through the theme probe so `light-dark()` resolves. */
  #overlayRequest(context: ChartBuildContext): Omit<Overlay.HistogramOverlayRequest, 'model'> {
    const { theme, series } = context
    const several = series.length > 1
    return {
      density: this.overlay === 'density' && this.stack === 'none',
      cumulative: this.overlay === 'cumulative',
      marks: this.#marks(),
      horizontal: this.orientation === 'horizontal',
      colors: series.map((item, index) => (several ? this.colorOf(item, index, theme) : undefined)),
      scales: series.map((item) => (item.axis === 'right' ? 'y2' : 'y')),
      cumulativeScale: CUMULATIVE_SCALE,
      alphas: series.map((_item, index) => (context.highlighted >= 0 && context.highlighted !== index ? theme.dimmedOpacity : 1)),
      overlayColor: this.themeController.resolveColor('var(--c2-chart__overlay--color, #18181b)', theme.color),
      overlayWidth: this.#pixels('--c2-chart__overlay--width', 2),
      percentileColor: this.themeController.resolveColor('var(--c2-chart__percentile--color, #18181b)', theme.color),
      percentileWidth: this.#pixels('--c2-chart__percentile--width', 1),
      font: this.#font(context, theme.fontSize),
      lineHeight: (theme.fontSize + 4) * devicePixelRatio,
      label: (p) => this.msg.t('percentile', this.formatValue(p)),
    }
  }

  /** The bin edges as ticks, every n-th one when the labels would collide. */
  #edgeSplits(self: uPlot, context: ChartBuildContext): number[] {
    const { edges } = this.#computeModel().model
    if (edges.length < 2) return edges
    const spacing = Math.abs(self.valToPos(edges[1], 'x') - self.valToPos(edges[0], 'x'))
    let need = context.theme.axisFontSize * 1.6
    if (this.orientation !== 'horizontal') {
      const ctx = self.ctx
      ctx.save()
      ctx.font = this.#font(context, context.theme.axisFontSize)
      need = Math.max(...edges.map((edge) => ctx.measureText(this.#formatEdge(edge)).width / devicePixelRatio)) + 8
      ctx.restore()
    }
    const every = spacing > 0 ? Math.ceil(need / spacing) : 1
    return edges.filter((_edge, index) => index % every === 0)
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-histogram-chart': HistogramChart
  }
}
