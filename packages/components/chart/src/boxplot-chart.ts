import { html, nothing, render, unsafeCSS, type CSSResultGroup, type PropertyValues, type TemplateResult } from 'lit'
import { property, jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import boxplotStyles from './boxplot-chart.scss?inline'
import { ChartBase, type ChartEventMap, type ChartLegendItem } from './chart-base.js'
import { EchartsChartBase } from './echarts-chart-base.js'
import { buildBoxplotModel, type BoxplotBox, type BoxplotModel, type BoxplotWhiskers } from './boxplot-stats.js'
import { boxplotMessages } from './boxplot-messages.js'
import type { ChartBuildContext } from './chart-adapter.js'
import type { EchartsOptions } from './engines/echarts-adapter.js'
import type { EchartsFeature } from './engines/echarts-loader.js'
import type { ChartFrame, ChartPointEventDetail, ChartSeriesConfig, ChartTooltipContext, ChartTooltipEntry } from './chart-types.js'
import './chart-series.js'

export { buildBoxplotModel, quantile, readSummary, summarizeSamples } from './boxplot-stats.js'
export type { BoxSummary, BoxplotBox, BoxplotModel, BoxplotModelOptions, BoxplotWhiskers } from './boxplot-stats.js'

/** Which way the boxes stand: up from the category axis at the bottom, or rightwards from the categories down the left. */
export type BoxplotOrientation = 'vertical' | 'horizontal'

/** One rule across the plot at a value, such as an SLO. The tones are the annotations'. */
export interface BoxplotReferenceLine {
  value: number
  label?: string
  tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger'
}

/** What `renderTooltip`, the `tooltip-change` event and a linked `c2-chart-tooltip` receive. */
export interface BoxplotTooltipContext extends ChartTooltipContext {
  /** The hovered box, or the box the hovered outlier belongs to. */
  box?: BoxplotBox
  /** The hovered outlier's value, when an outlier rather than a box is hovered. */
  outlier?: number
}

export interface BoxplotChart {
  addEventListener: TypedAddEventListener<BoxplotChart, ChartEventMap>
  removeEventListener: TypedRemoveEventListener<BoxplotChart, ChartEventMap>
}

/** One datum of a series as the engine receives it: a box (one per category, in order) or one outlier. */
interface Item {
  box: BoxplotBox | null
  category: number
  outlier?: number
}

/** The look the CSS variables set, read once per option build. */
interface BoxStyle {
  /** The box's width: a share of the band, or pixels. */
  width: { share: number } | { pixels: number }
  fillOpacity: number
  borderWidth: number
  medianWidth: number
  outlierRadius: number
}

/** What ECharts hands a custom series' `renderItem`, as far as this chart uses it. */
interface RenderParams {
  dataIndex: number
  coordSys: { x: number; y: number; width: number; height: number }
}
interface RenderApi {
  coord(value: [number, number]): [number, number]
  size(value: [number, number]): [number, number]
}

/** Share of a category's band the boxes of all series take together. */
const GROUP_SHARE = 0.8
/** Share of its slot in the group a box takes at most, so neighbouring boxes keep a gap. */
const SLOT_SHARE = 0.75
const TONES = ['neutral', 'info', 'success', 'warning', 'danger'] as const

/** Channels of an `rgb()`/`rgba()` or six-digit hex colour, or `undefined`. */
function channels(color: string): number[] | undefined {
  const hex = /^#([0-9a-f]{6})$/i.exec(color.trim())
  if (hex) return [0, 2, 4].map((offset) => parseInt(hex[1].slice(offset, offset + 2), 16))
  const rgb = /^rgba?\(([^)]+)\)$/i.exec(color.trim())
  if (!rgb) return undefined
  const values = rgb[1]
    .split(/[\s,/]+/)
    .slice(0, 3)
    .map(Number)
  return values.length === 3 && values.every((value) => Number.isFinite(value)) ? values : undefined
}

/** `color` laid over `surface` at `amount`: the opaque tint the box is filled with. Canvas cannot read `color-mix()`. */
function tint(color: string, surface: string, amount: number): string {
  const top = channels(color)
  const bottom = channels(surface)
  if (!top || !bottom) return color
  return `rgb(${top.map((channel, index) => Math.round(bottom[index] + (channel - bottom[index]) * amount)).join(', ')})`
}

/** `stats.cpu` -> `Cpu`, `p50_latency` -> `P50 latency`: a readable label for an inferred field. */
function humanize(field: string): string {
  const last = field.split('.').pop() ?? field
  const spaced = last.replace(/[_-]+/g, ' ').replace(/([a-z\d])([A-Z])/g, '$1 $2')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

/**
 * A box plot: the distribution of each category as its median, quartiles, whiskers and outliers, drawn by ECharts.
 * It suits latency per service, test scores per class and A/B results.
 *
 * `label-field` names the category, and each `c2-chart-series` field holds, row by row, one of three shapes: **a
 * number**, one sample (rows with the same label pool their samples, so long-format data, one row per request, works
 * as it is); **an array of numbers**, the samples of the category; or **a summary object**
 * `{ min, q1, median, q3, max, outliers?, mean?, count? }`, already computed by a backend, drawn as given. From
 * samples the quartiles are interpolated linearly (R-7, the NumPy default); `summarizeSamples()` is exported for the
 * same figures outside the chart.
 *
 * `whiskers="tukey"` (the default) ends a whisker at the furthest sample within 1.5 × IQR of the box and draws the
 * samples past it as hollow outliers; `whiskers="range"` runs from the minimum to the maximum. `outliers="none"`
 * leaves the points out and `mean="show"` adds a diamond at the mean. Several series sit side by side in each
 * category, in the series colours, with the legend. `orientation="horizontal"` lays the categories down the left.
 * `reference-lines` draws dashed rules across the plot at a value, such as an SLO, in the annotation tones.
 *
 * ```html
 * <c2-boxplot-chart label-field="service" value-suffix=" ms" reference-lines='[{ "value": 500, "label": "SLO", "tone": "danger" }]'
 *   data='[{ "service": "checkout", "latency": [182, 240, 310, 420, 1320] }, { "service": "search", "latency": [96, 168, 214, 276] }]'>
 *   <c2-chart-series field="latency" label="Latency"></c2-chart-series>
 * </c2-boxplot-chart>
 * ```
 *
 * The plot is one tab stop: ← and → move between categories and ↑ and ↓ between the series of a category (the other
 * way round when horizontal), and each box is announced with its five numbers. A hidden table lists every box.
 *
 * @tag c2-boxplot-chart
 *
 * @slotcomponent c2-chart-series
 *
 * @cssproperty {length} [--c2-chart__box--width=40%] - Width of a box: a percentage of the category's band, or a length. Boxes narrow so several series fit side by side.
 * @cssproperty {opacity} [--c2-chart__box--fill-opacity=0.22] - How strongly a box is tinted with its series colour over the chart surface. Hovering doubles it.
 * @cssproperty {pixel} [--c2-chart__box--border-width=1.5px] - Width of a box's outline, its whiskers and the outlier rings.
 * @cssproperty {pixel} [--c2-chart__median--width=2.5px] - Width of the median rule across a box.
 * @cssproperty {pixel} [--c2-chart__outlier--radius=3px] - Radius of an outlier point.
 * @cssproperty {pixel} [--c2-chart__grid--width=1px] - Width of the grid lines.
 * @cssproperty {opacity} [--c2-chart__series__dimmed--opacity=0.25] - Opacity the other series keep while one is highlighted.
 * @cssproperty {border} [--c2-chart__plot__focus--outline=2px solid rgba(2, 101, 220, 0.4)] - Focus ring of the plot, the chart's tab stop.
 */
@customElement('c2-boxplot-chart')
export class BoxplotChart extends EchartsChartBase {
  static override styles: CSSResultGroup = [ChartBase.styles, unsafeCSS(boxplotStyles)]

  protected override readonly features: readonly EchartsFeature[] = ['custom', 'grid', 'markLine']

  // A click highlight rebuilds the options under the pointer; the redraw must land in one step. See `createEchartsAdapter`.
  protected override readonly lazyEngineUpdates = false

  /** Which way the boxes stand. `horizontal` puts the categories down the left edge, first at the top, and the values along the bottom. */
  @property({ type: String }) orientation: BoxplotOrientation = 'vertical'

  /** Where the whiskers end: `tukey`, at the furthest sample within 1.5 × IQR of the box, with the rest drawn as outliers; `range`, at the minimum and maximum. */
  @property({ type: String }) whiskers: BoxplotWhiskers = 'tukey'

  /** Whether the values past the whiskers are drawn, as hollow points. The tooltip and the table still count them. */
  @property({ type: String }) outliers: 'show' | 'none' = 'show'

  /** Whether a diamond marks each box's mean. */
  @property({ type: String }) mean: 'none' | 'show' = 'none'

  /** Dashed rules across the plot at a value, each `{ value, label?, tone? }`; the tones are the annotations'. */
  @property({ converter: jsonPropertyConverter, attribute: 'reference-lines' }) referenceLines?: BoxplotReferenceLine[]

  /** Text appended to values in the tooltip and the table, such as ` ms`. Trimmed, it also names the value axis. */
  @property({ type: String, attribute: 'value-suffix' }) valueSuffix = ''

  /** Maximum number of decimal places in the tooltip, the table and the ticks. */
  @property({ type: Number }) precision = 2

  /** The box the keyboard is on. Not reactive: moving it only emphasises a box through the engine and speaks it. */
  private focusedBox: { category: number; seriesIndex: number } | null = null

  private readonly msg = new LocalizeController(this, boxplotMessages, () => this.locale)

  #model?: { key: string; data: unknown; model: BoxplotModel; items: Item[][] }

  constructor() {
    super()
    this.xType = 'category'
    this.tooltip = 'item'
  }

  // ----------------------------------------------------------- public API ---

  /** Every box as drawn, category by category: its five numbers, outliers, mean and count. For a table view or an export. */
  get boxes(): BoxplotBox[] {
    return this.#computeModel().model.list.map((box) => ({ ...box, outliers: [...box.outliers] }))
  }

  // ------------------------------------------------------ chart overrides ---

  /**
   * No data-only fast path: the categories ride on the axis, and the boxes, the table and the names follow the rows,
   * so new data rebuilds the options.
   */
  protected override isDataKey(): boolean {
    return false
  }

  protected override get legendDependsOnData(): boolean {
    return true
  }

  /**
   * A field holding numbers, sample arrays or summary objects is a series: the shapes the box plot reads. Every row is
   * looked at, so a field whose first value is missing still counts; fields keep the order they first appear in.
   */
  protected override inferredSeries(): ChartSeriesConfig[] {
    const rows = this.data
    if (!Array.isArray(rows)) return []
    const fields = new Set<string>()
    for (const row of rows as unknown[]) {
      if (!row || typeof row !== 'object' || Array.isArray(row) || ArrayBuffer.isView(row)) continue
      for (const [key, value] of Object.entries(row as Record<string, unknown>)) {
        if (fields.has(key) || key === this.labelField || key === this.xField) continue
        if ((typeof value === 'number' && Number.isFinite(value)) || (value !== null && typeof value === 'object')) fields.add(key)
      }
    }
    return [...fields].map((key) => ({ field: key, label: humanize(key) }))
  }

  /** With no box to draw (no rows, or no value in any), the chart shows its empty state. */
  protected override buildFrame(): ChartFrame | undefined {
    if (this.#computeModel().model.list.length === 0) return this.frameBuilder.build([], this.normalizeContext())
    return super.buildFrame()
  }

  protected override reshapesFrame(changed: PropertyValues): boolean {
    return super.reshapesFrame(changed) || changed.has('whiskers')
  }

  /** The legend lists the series, and is left out when there is only one (unless a `legend` slot fills it). */
  protected override legendItems(): ChartLegendItem[] {
    if (this.resolvedSeries.length < 2 && !this.querySelector(':scope > [slot="legend"]')) return []
    return super.legendItems().map((item) => ({ ...item, color: this.#seriesColor(item.index) }))
  }

  protected override coordinateSystem(context: ChartBuildContext): Record<string, unknown> {
    const { theme } = context
    const horizontal = this.orientation === 'horizontal'
    const { categories } = this.#computeModel().model
    const name = this.valueSuffix.trim()
    const axisLabel = { color: theme.axisColor, fontSize: theme.axisFontSize }
    const category = {
      type: 'category',
      data: categories,
      boundaryGap: true,
      inverse: horizontal,
      axisLine: { show: !horizontal, lineStyle: { color: theme.gridColor } },
      axisTick: { show: false },
      axisLabel: { ...axisLabel, interval: 0, hideOverlap: true },
      splitLine: { show: false },
    }
    const value = {
      type: 'value',
      scale: true,
      axisLine: { show: false },
      axisTick: { show: false },
      // Wide ticks along a horizontal value axis would run into each other: ECharts drops the ones that would.
      axisLabel: { ...axisLabel, hideOverlap: true, formatter: (tick: number) => this.#formatNumber(tick) },
      splitLine: { lineStyle: { color: theme.gridColor, width: theme.gridWidth } },
      name: name || undefined,
      // Horizontal: the unit sits centred under the tick labels; at the axis start it ran into the first one.
      nameLocation: horizontal ? 'middle' : 'end',
      nameGap: horizontal ? theme.axisFontSize + 10 : 12,
      nameTextStyle: horizontal ? { ...axisLabel, align: 'center', verticalAlign: 'top' } : { ...axisLabel, align: 'right', padding: [0, 8, 0, 0] },
    }
    // The axis labels and the unit fit inside the plot: ECharts 6 grows the margins to contain them.
    const labelled = this.#referenceLines().some((line) => line.label)
    const top = 12 + (horizontal ? (labelled ? theme.fontSize + 8 : 0) : name ? theme.axisFontSize + 12 : 0)
    return {
      grid: { left: 8, right: horizontal ? 24 : 16, top, bottom: 8 },
      xAxis: horizontal ? value : category,
      yAxis: horizontal ? category : value,
    }
  }

  /** One custom series draws the boxes and outliers of one `c2-chart-series`. */
  protected override seriesOption(index: number, context: ChartBuildContext): Record<string, unknown> {
    const { theme } = context
    const horizontal = this.orientation === 'horizontal'
    const style = this.#readStyle()
    const count = Math.max(1, context.series.length)
    const color = this.#seriesColor(index, context)
    const fill = tint(color, theme.surface, style.fillOpacity)
    const strong = tint(color, theme.surface, Math.min(1, style.fillOpacity * 2))
    const showMean = this.mean === 'show'
    return {
      type: 'custom',
      encode: horizontal ? { y: 0, x: [1, 2, 3, 4, 5, 6] } : { x: 0, y: [1, 2, 3, 4, 5, 6] },
      clip: true,
      renderItem: (params: RenderParams, api: RenderApi) => {
        // Read when drawn, so the boxes and the axis always come from the same rows.
        const item = this.#computeModel().items[index]?.[params.dataIndex]
        if (!item?.box) return null
        const { box } = item
        const band = horizontal ? api.size([0, 1])[1] : api.size([1, 0])[0]
        const slot = (band * GROUP_SHARE) / count
        const wanted = 'share' in style.width ? style.width.share * band : style.width.pixels
        const width = Math.max(2, Math.min(wanted, slot * SLOT_SHARE))
        const half = width / 2
        const origin = horizontal ? api.coord([0, item.category])[1] : api.coord([item.category, 0])[0]
        const centre = origin - (band * GROUP_SHARE) / 2 + slot * (index + 0.5)
        const at = (value: number) => (horizontal ? api.coord([value, item.category])[0] : api.coord([item.category, value])[1])
        // A point `across` the category axis from the box's centre line, at `value`.
        const point = (across: number, value: number): [number, number] => (horizontal ? [at(value), centre + across] : [centre + across, at(value)])
        // The resolved index: a key naming no series dims nothing.
        const dimmed = context.highlighted >= 0 && context.highlighted !== index
        const opacity = dimmed ? theme.dimmedOpacity : 1
        const stroke = { stroke: color, lineWidth: style.borderWidth, opacity }
        const line = (from: [number, number], to: [number, number], lineStyle: Record<string, unknown> = stroke) => ({
          type: 'line',
          shape: { x1: from[0], y1: from[1], x2: to[0], y2: to[1] },
          style: lineStyle,
        })
        if (item.outlier !== undefined) {
          const [cx, cy] = point(0, item.outlier)
          return {
            type: 'circle',
            shape: { cx, cy, r: style.outlierRadius },
            style: { fill: theme.surface, ...stroke },
            emphasis: { style: { fill: strong } },
          }
        }
        const q1 = point(-half, box.q1)
        const q3 = point(half, box.q3)
        const median = at(box.median)
        const plot = params.coordSys
        // A hit area over the whole slot, so the box is easy to point at however short it is.
        const hit = horizontal
          ? { x: plot.x, y: centre - slot / 2, width: plot.width, height: slot }
          : { x: centre - slot / 2, y: plot.y, width: slot, height: plot.height }
        const children: Record<string, unknown>[] = [
          { type: 'rect', shape: hit, style: { fill: 'rgba(0, 0, 0, 0)' }, emphasis: { style: { fill: 'rgba(0, 0, 0, 0)' } } },
          line(point(0, box.min), point(0, box.q1)),
          line(point(0, box.q3), point(0, box.max)),
          line(point(-half / 2, box.min), point(half / 2, box.min)),
          line(point(-half / 2, box.max), point(half / 2, box.max)),
          {
            type: 'rect',
            shape: {
              x: Math.min(q1[0], q3[0]),
              y: Math.min(q1[1], q3[1]),
              width: Math.max(1, Math.abs(q3[0] - q1[0])),
              height: Math.max(1, Math.abs(q3[1] - q1[1])),
            },
            style: { fill, ...stroke },
            emphasis: { style: { fill: strong } },
          },
          line(point(-half, box.median), point(half, box.median), { ...stroke, lineWidth: style.medianWidth }),
        ]
        if (showMean && box.mean !== undefined) {
          const [mx, my] = point(0, box.mean)
          const size = Math.max(3, style.outlierRadius + 1)
          children.push({
            type: 'polygon',
            shape: {
              points: [
                [mx, my - size],
                [mx + size, my],
                [mx, my + size],
                [mx - size, my],
              ],
            },
            style: { fill: color, stroke: theme.surface, lineWidth: 1, opacity },
          })
        }
        // The box grows from its median on first draw; with animation off (reduced motion) it simply appears.
        return {
          type: 'group',
          children,
          originX: horizontal ? median : centre,
          originY: horizontal ? centre : median,
          // The resting scale is stated: an update that lands while the entry is still growing would otherwise keep
          // the box at the scale it had reached.
          scaleX: 1,
          scaleY: 1,
          enterFrom: horizontal ? { scaleX: 0 } : { scaleY: 0 },
        }
      },
    }
  }

  protected override buildOptions(context: ChartBuildContext): EchartsOptions {
    const options = super.buildOptions(context) as EchartsOptions
    const series = context.series.map((item, index) => ({ name: item.label ?? item.field, ...this.seriesOption(index, context) }))
    return { ...options, series: [...series, this.#referenceSeries(context)] }
  }

  /** One list of items per series, then the reference values, which only reach into the axis range. */
  protected override projectData(_frame: ChartFrame, context: ChartBuildContext): unknown {
    const { items } = this.#computeModel()
    const missing = ['-', '-', '-', '-', '-', '-']
    const data: unknown[] = context.series.map((_series, index) =>
      (items[index] ?? []).map((item) => {
        if (!item.box) return [item.category, ...missing]
        if (item.outlier !== undefined) return [item.category, ...Array(6).fill(item.outlier)]
        const { min, q1, median, q3, max, mean } = item.box
        return [item.category, min, q1, median, q3, max, this.mean === 'show' && mean !== undefined ? mean : median]
      }),
    )
    const horizontal = this.orientation === 'horizontal'
    data.push(this.#referenceLines().map((line) => (horizontal ? [line.value, 0] : [0, line.value])))
    // A data path that skips Lit's update still refreshes the table and the announcement.
    this.#renderAccessibleSummary()
    return data
  }

  protected override pointAt(index: number, seriesIndex: number): ChartPointEventDetail | undefined {
    const item = this.#computeModel().items[seriesIndex]?.[index]
    const series = this.resolvedSeries[seriesIndex]
    if (!item?.box || !series) return undefined
    return { index: item.category, seriesIndex, series, x: item.category, y: item.outlier ?? item.box.median, label: item.box.label }
  }

  protected override tooltipContextAt(detail: { index: number; seriesIndex: number; px: number; py: number }): BoxplotTooltipContext {
    const item = this.#computeModel().items[detail.seriesIndex]?.[detail.index]
    const series = this.resolvedSeries[detail.seriesIndex]
    const base = { index: detail.index, x: item?.category ?? detail.index, px: detail.px, py: detail.py }
    if (!item?.box || !series) return { ...base, formattedX: '', entries: [] }
    const { box } = item
    const color = this.#seriesColor(detail.seriesIndex)
    const entry = (field: string, label: string, value: number): ChartTooltipEntry => ({
      seriesIndex: detail.seriesIndex,
      series: { ...series, field, label },
      value,
      formatted: this.#format(value, series),
      color,
    })
    const name = this.#boxName(box)
    if (item.outlier !== undefined) {
      return {
        ...base,
        formattedX: name,
        label: box.label,
        entries: [entry('outlier', this.msg.t('outlier'), item.outlier)],
        box: { ...box },
        outlier: item.outlier,
      }
    }
    const entries = [
      entry('max', this.msg.t('max'), box.max),
      entry('q3', this.msg.t('q3'), box.q3),
      entry('median', this.msg.t('median'), box.median),
      entry('q1', this.msg.t('q1'), box.q1),
      entry('min', this.msg.t('min'), box.min),
    ]
    if (this.mean === 'show' && box.mean !== undefined) entries.push(entry('mean', this.msg.t('mean'), box.mean))
    return { ...base, formattedX: name, label: box.label, entries, box: { ...box } }
  }

  /** The five numbers, the series colour on the median, then the outliers and the sample count when known. */
  protected override defaultTooltip(context: BoxplotTooltipContext): TemplateResult {
    const row = (label: string, value: string, color?: string) => html`
      <div class="tooltip-row">
        ${color ? html`<span class="tooltip-marker" style="background:${color}"></span>` : nothing}
        <span class="tooltip-label">${label}</span>
        <span class="tooltip-value">${value}</span>
      </div>
    `
    const { box } = context
    if (!box) return super.defaultTooltip(context)
    const marked = context.outlier !== undefined ? 'outlier' : 'median'
    return html`
      <div class="tooltip-title">${context.formattedX}</div>
      ${context.entries.map((entry) => row(entry.series.label ?? entry.series.field, entry.formatted, entry.series.field === marked ? entry.color : undefined))}
      ${context.outlier === undefined && box.outliers.length > 0 ? row(this.msg.t('outliers'), this.#outlierSummary(box)) : nothing}
      ${context.outlier === undefined && box.count !== undefined ? row(this.msg.t('samples'), this.#formatCount(box.count)) : nothing}
    `
  }

  /** A box or outlier gets the category's backdrop; the reference lines are not data. */
  protected override handleEngineHover(detail: { index: number; seriesIndex: number; px: number; py: number; component?: string } | null): void {
    const item = detail && detail.component !== 'markLine' ? this.#computeModel().items[detail.seriesIndex]?.[detail.index] : undefined
    if (!detail || !item?.box) {
      this.#placeBackdrop(null)
      super.handleEngineHover(null)
      return
    }
    this.#placeBackdrop(item.category)
    super.handleEngineHover(detail)
  }

  // ------------------------------------------------------------ lifecycle ---

  protected override firstUpdated(): void {
    super.firstUpdated()
    const plot = this.plotElement
    if (!plot) return
    // The plot is the chart's one tab stop. It is inside the shadow root, so nothing is written on the host.
    plot.tabIndex = 0
    plot.setAttribute('role', 'group')
    plot.addEventListener('keydown', this.#handleKeydown)
    plot.addEventListener('blur', this.#handleBlur)
    // A legend slotted after the first render must bring the built-in legend's box back (see `legendItems`).
    this.renderRoot.addEventListener('slotchange', (event) => {
      if ((event.target as HTMLSlotElement | null)?.name === 'legend') this.requestUpdate()
    })
  }

  protected override updated(changed: PropertyValues): void {
    super.updated(changed)
    this.#renderAccessibleSummary()
    const plot = this.plotElement
    if (!plot) return
    const label = this.#summary()
    if (plot.getAttribute('aria-label') !== label) plot.setAttribute('aria-label', label)
    const roleDescription = this.msg.t('roleDescription')
    if (plot.getAttribute('aria-roledescription') !== roleDescription) plot.setAttribute('aria-roledescription', roleDescription)
  }

  /**
   * The box table and the live announcement are rendered into a static container after each update rather than in
   * this template, for the reason the legend is: a server cannot see the chart's `c2-chart-series` children, and
   * hydration would keep whatever it rendered.
   */
  protected override render(): TemplateResult {
    return html`${super.render()}
      <div class="boxplot-a11y-root"></div>`
  }

  /** The hovered or focused category's backdrop, behind the boxes. Placed by script from the engine's grid. */
  protected override renderOverlayExtras(): unknown {
    return html`<div class="boxplot-backdrop" hidden></div>
      <span class="boxplot-probe box-width"></span><span class="boxplot-probe border-width"></span><span class="boxplot-probe median-width"></span
      ><span class="boxplot-probe outlier-radius"></span>`
  }

  // ------------------------------------------------------------- keyboard ---

  #handleKeydown = (event: KeyboardEvent): void => {
    const { model } = this.#computeModel()
    const visible = (seriesIndex: number) => !this.hiddenSeries.has(seriesIndex)
    const has = (category: number, seriesIndex: number) => Boolean(model.boxes[category]?.[seriesIndex]) && visible(seriesIndex)
    const seriesIn = (category: number) => (model.boxes[category] ?? []).map((_box, index) => index).filter((index) => has(category, index))
    const categories = model.categories.map((_label, index) => index).filter((index) => seriesIn(index).length > 0)
    if (categories.length === 0) return
    const horizontal = this.orientation === 'horizontal'
    const current = this.focusedBox && has(this.focusedBox.category, this.focusedBox.seriesIndex) ? this.focusedBox : null
    const firstOf = (category: number, prefer?: number) => {
      const available = seriesIn(category)
      return { category, seriesIndex: prefer !== undefined && available.includes(prefer) ? prefer : available[0] }
    }
    const nextCategory = horizontal ? 'ArrowDown' : 'ArrowRight'
    const previousCategory = horizontal ? 'ArrowUp' : 'ArrowLeft'
    const nextSeries = horizontal ? 'ArrowRight' : 'ArrowDown'
    const previousSeries = horizontal ? 'ArrowLeft' : 'ArrowUp'
    let next: { category: number; seriesIndex: number } | undefined
    switch (event.key) {
      case nextCategory:
      case previousCategory: {
        if (!current) {
          next = firstOf(categories[0])
          break
        }
        const at = categories.indexOf(current.category)
        const step = event.key === nextCategory ? 1 : -1
        const target = categories[Math.min(categories.length - 1, Math.max(0, at + step))]
        next = firstOf(target, current.seriesIndex)
        break
      }
      case nextSeries:
      case previousSeries: {
        if (!current) {
          next = firstOf(categories[0])
          break
        }
        const available = seriesIn(current.category)
        const at = available.indexOf(current.seriesIndex)
        const step = event.key === nextSeries ? 1 : -1
        next = { category: current.category, seriesIndex: available[Math.min(available.length - 1, Math.max(0, at + step))] }
        break
      }
      case 'Home':
        next = firstOf(categories[0], current?.seriesIndex)
        break
      case 'End':
        next = firstOf(categories[categories.length - 1], current?.seriesIndex)
        break
      case 'Enter':
      case ' ':
        if (!current) return
        event.preventDefault()
        this.handleEngineClick({ index: current.category, seriesIndex: current.seriesIndex })
        return
      case 'Escape':
        if (!current && this.highlighted === null) return
        event.preventDefault()
        this.#focusBox(null)
        this.highlight(null)
        return
      default:
        return
    }
    event.preventDefault()
    this.#focusBox(next ?? null)
  }

  #handleBlur = (): void => this.#focusBox(null)

  /** Moves the keyboard focus to a box: the engine emphasises it, the tooltip and backdrop follow it, and it is spoken. */
  #focusBox(target: { category: number; seriesIndex: number } | null): void {
    this.focusedBox = target
    this.adapter?.dispatchAction?.({ type: 'downplay' })
    this.#renderAccessibleSummary()
    if (!target) {
      this.handleEngineHover(null)
      return
    }
    this.adapter?.dispatchAction?.({ type: 'highlight', seriesIndex: target.seriesIndex, dataIndex: target.category })
    const box = this.#computeModel().model.boxes[target.category]?.[target.seriesIndex]
    const pixel = box ? this.#pixelOf(target.category, box.q3) : null
    this.handleEngineHover({ index: target.category, seriesIndex: target.seriesIndex, px: pixel?.[0] ?? 0, py: pixel?.[1] ?? 0 })
  }

  /** Where a value of a category lands in the plot, in CSS pixels: the tooltip's anchor for a box reached by keyboard. */
  #pixelOf(category: number, value: number): [number, number] | null {
    const horizontal = this.orientation === 'horizontal'
    return this.adapter?.convertToPixel?.({ gridIndex: 0 }, horizontal ? [value, category] : [category, value]) ?? null
  }

  // ------------------------------------------------------------ internals ---

  /** Positions the backdrop over one category's band, from the engine's grid; `null` hides it. */
  #placeBackdrop(category: number | null): void {
    const backdrop = this.renderRoot?.querySelector<HTMLElement>('.boxplot-backdrop')
    if (!backdrop) return
    const count = this.#computeModel().model.categories.length
    const plot = category === null || count === 0 ? null : this.adapter?.xGeometry?.([])?.plot
    if (!plot || category === null) {
      backdrop.hidden = true
      return
    }
    backdrop.hidden = false
    if (this.orientation === 'horizontal') {
      const band = plot.height / count
      Object.assign(backdrop.style, { left: `${plot.left}px`, width: `${plot.width}px`, top: `${plot.top + band * category}px`, height: `${band}px` })
    } else {
      const band = plot.width / count
      Object.assign(backdrop.style, { left: `${plot.left + band * category}px`, width: `${band}px`, top: `${plot.top}px`, height: `${plot.height}px` })
    }
  }

  #referenceLines(): Required<BoxplotReferenceLine>[] {
    const lines = Array.isArray(this.referenceLines) ? this.referenceLines : []
    return lines.flatMap((line) => {
      const value = typeof line?.value === 'number' ? line.value : Number(line?.value)
      if (!Number.isFinite(value)) return []
      const tone = TONES.find((name) => name === line.tone) ?? 'neutral'
      return [{ value, label: typeof line.label === 'string' ? line.label : '', tone }]
    })
  }

  /** The reference lines, as a `markLine` on a series that draws nothing: its data only stretches the axis to reach them. */
  #referenceSeries(context: ChartBuildContext): Record<string, unknown> {
    const horizontal = this.orientation === 'horizontal'
    const lines = this.#referenceLines()
    const border = parseFloat(getComputedStyle(this).getPropertyValue('--c2-chart__annotation-line--border-width'))
    const dashed = getComputedStyle(this).getPropertyValue('--c2-chart__annotation-line--border-style').trim() || 'dashed'
    const toneColor = (tone: string) =>
      this.themeController.resolveColor(
        tone === 'neutral'
          ? 'var(--c2-chart__annotation--color, #71717a)'
          : `var(--c2-chart__annotation__${tone}--color, ${tone === 'info' ? '#0265dc' : tone === 'success' ? '#16a34a' : tone === 'warning' ? '#d97706' : '#dc2626'})`,
        context.theme.mutedColor,
      )
    return {
      type: 'custom',
      name: '\u0000reference',
      silent: true,
      encode: { x: 0, y: 1 },
      renderItem: () => null,
      markLine: {
        silent: true,
        symbol: ['none', 'none'],
        animation: false,
        data: lines.map((line) => {
          const color = toneColor(line.tone)
          return {
            name: line.label,
            [horizontal ? 'xAxis' : 'yAxis']: line.value,
            lineStyle: {
              color,
              width: Number.isFinite(border) && border > 0 ? border * 1.5 : 1.5,
              type: dashed === 'solid' ? 'solid' : dashed === 'dotted' ? 'dotted' : 'dashed',
            },
            label: {
              show: Boolean(line.label),
              formatter: line.label,
              // The categories run top to bottom when horizontal, so the rule starts at the top: its label goes above it.
              position: horizontal ? 'start' : 'insideEndTop',
              color,
              fontSize: context.theme.fontSize,
              fontWeight: 600,
            },
          }
        }),
      },
    }
  }

  #summary(): string {
    const series = this.resolvedSeries.map((item) => item.label ?? item.field).join(', ')
    return this.msg.t('summary', series, this.#formatCount(this.#computeModel().model.categories.length))
  }

  #boxName(box: BoxplotBox): string {
    if (this.resolvedSeries.length < 2) return box.label
    const series = this.resolvedSeries[box.seriesIndex]
    return this.msg.t('boxName', box.label, series?.label ?? series?.field ?? '')
  }

  #outlierSummary(box: BoxplotBox): string {
    const furthest = box.outliers.reduce((far, value) => (Math.abs(value - box.median) > Math.abs(far - box.median) ? value : far), box.outliers[0])
    return this.msg.t('outlierSummary', this.#formatCount(box.outliers.length), this.#format(furthest, this.resolvedSeries[box.seriesIndex]))
  }

  #announcement(): string {
    const focused = this.focusedBox
    const box = focused ? this.#computeModel().model.boxes[focused.category]?.[focused.seriesIndex] : null
    if (!box) return ''
    const series = this.resolvedSeries[box.seriesIndex]
    const format = (value: number) => this.#format(value, series)
    // The start of a range reads without the unit, which its end carries: "240 to 420 ms".
    const bare = (value: number) => (series?.format ? series.format(value) : this.#formatNumber(value))
    const text = this.msg.t('announcement', this.#boxName(box), format(box.median), bare(box.q1), format(box.q3), bare(box.min), format(box.max))
    const count = box.outliers.length
    if (count === 0) return text
    return `${text}, ${count === 1 ? this.msg.t('oneOutlier') : this.msg.t('outlierCount', this.#formatCount(count))}`
  }

  #renderAccessibleSummary(): void {
    const root = this.renderRoot?.querySelector<HTMLElement>('.boxplot-a11y-root')
    if (!root) return
    const { model } = this.#computeModel()
    const series = this.resolvedSeries
    const announcement = this.#announcement()
    render(
      html`
        ${
          model.list.length > 0
            ? html`
                <table class="boxplot-a11y">
                  <caption>
                    ${this.#summary()}
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">${this.msg.t('category')}</th>
                      <th scope="col">${this.msg.t('series')}</th>
                      <th scope="col">${this.msg.t('min')}</th>
                      <th scope="col">${this.msg.t('q1')}</th>
                      <th scope="col">${this.msg.t('median')}</th>
                      <th scope="col">${this.msg.t('q3')}</th>
                      <th scope="col">${this.msg.t('max')}</th>
                      <th scope="col">${this.msg.t('outliers')}</th>
                      <th scope="col">${this.msg.t('count')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${model.list.map((box) => {
                      const item = series[box.seriesIndex]
                      const format = (value: number) => this.#format(value, item)
                      return html`
                        <tr>
                          <th scope="row">${box.label}</th>
                          <td>${item?.label ?? item?.field ?? ''}</td>
                          <td>${format(box.min)}</td>
                          <td>${format(box.q1)}</td>
                          <td>${format(box.median)}</td>
                          <td>${format(box.q3)}</td>
                          <td>${format(box.max)}</td>
                          <td>${this.#formatCount(box.outliers.length)}</td>
                          <td>${box.count === undefined ? '—' : this.#formatCount(box.count)}</td>
                        </tr>
                      `
                    })}
                  </tbody>
                </table>
              `
            : nothing
        }
        <div class="boxplot-a11y" aria-live="polite">${announcement || nothing}</div>
      `,
      root,
      { host: this },
    )
  }

  #computeModel(): { model: BoxplotModel; items: Item[][] } {
    const fields = this.resolvedSeries.map((series) => series.field)
    const key = [this.revision, this.labelField, this.whiskers, this.outliers, fields.join('\u0000')].join('|')
    if (this.#model && this.#model.key === key && this.#model.data === this.data) return this.#model
    const rows = Array.isArray(this.data) ? (this.data as unknown[]) : []
    const model = buildBoxplotModel(rows, { labelField: this.labelField, fields, whiskers: this.whiskers === 'range' ? 'range' : 'tukey' })
    const items = fields.map((_field, seriesIndex) => {
      const list: Item[] = model.boxes.map((boxes, category) => ({ box: boxes[seriesIndex], category }))
      if (this.outliers !== 'none') {
        for (const boxes of model.boxes) {
          const box = boxes[seriesIndex]
          if (box) for (const outlier of box.outliers) list.push({ box, category: box.category, outlier })
        }
      }
      return list
    })
    this.#model = { key, data: this.data, model, items }
    return this.#model
  }

  /** A series' colour, resolved so a `var()` or `color-mix()` reaches the canvas as a colour it can draw. */
  #seriesColor(index: number, context?: ChartBuildContext): string {
    const theme = context?.theme ?? this.themeController.theme
    const series = (context?.series ?? this.resolvedSeries)[index]
    const fallback = theme.palette[index % theme.palette.length]
    return series?.color ? this.themeController.resolveColor(series.color, fallback) : fallback
  }

  #readStyle(): BoxStyle {
    const style = typeof getComputedStyle === 'function' ? getComputedStyle(this) : undefined
    const raw = (name: string) => style?.getPropertyValue(name).trim() ?? ''
    const opacity = parseFloat(raw('--_box-fill-opacity'))
    // A length variable may be written in any unit (`2rem`, `calc()`): a probe sized by it resolves it to pixels.
    const length = (name: string, fallback: number) => {
      const probe = this.renderRoot?.querySelector<HTMLElement>(`.boxplot-probe.${name}`)
      const value = probe?.isConnected ? probe.getBoundingClientRect().width : Number.NaN
      return Number.isFinite(value) && value >= 0 ? value : fallback
    }
    // A percentage is a share of the band, which only the engine knows: it is read from the declared value.
    const width = raw('--_box-width')
    const share = width.endsWith('%') ? parseFloat(width) / 100 : Number.NaN
    const pixels = Number.isFinite(share) ? Number.NaN : length('box-width', Number.NaN)
    return {
      width: Number.isFinite(share) && share > 0 ? { share } : Number.isFinite(pixels) && pixels > 0 ? { pixels } : { share: 0.4 },
      fillOpacity: Number.isFinite(opacity) && opacity >= 0 ? Math.min(1, opacity) : 0.22,
      borderWidth: length('border-width', 1.5),
      medianWidth: length('median-width', 2.5),
      outlierRadius: length('outlier-radius', 3),
    }
  }

  #formatNumber(value: number): string {
    const precision = Math.max(0, Math.min(20, Math.trunc(this.precision) || 0))
    return new Intl.NumberFormat(this.locale, { maximumFractionDigits: precision }).format(value)
  }

  #format(value: number, series?: ChartSeriesConfig): string {
    return series?.format?.(value) ?? `${this.#formatNumber(value)}${this.valueSuffix}`
  }

  #formatCount(value: number): string {
    return new Intl.NumberFormat(this.locale, { maximumFractionDigits: 0 }).format(value)
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-boxplot-chart': BoxplotChart
  }
}
