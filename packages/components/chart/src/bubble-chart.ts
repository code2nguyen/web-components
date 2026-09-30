import { html, nothing, svg, unsafeCSS, type CSSResultGroup, type PropertyValues, type TemplateResult } from 'lit'
import { state } from 'lit/decorators.js'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { getFieldValue } from '@c2n/core/data-helper.js'
import bubbleStyles from './bubble-chart.scss?inline'
import { ChartBase, type ChartEventMap } from './chart-base.js'
import { EchartsChartBase } from './echarts-chart-base.js'
import type { ChartBuildContext } from './chart-adapter.js'
import type { EchartsFeature } from './engines/echarts-loader.js'
import { columnValue, type NormalizeContext } from './chart-data.js'
import type { ChartFrame, ChartPointEventDetail, ChartSeriesConfig, ChartTooltipContext } from './chart-types.js'
import './chart-series.js'

export interface BubbleChart {
  addEventListener: TypedAddEventListener<BubbleChart, ChartEventMap>
  removeEventListener: TypedRemoveEventListener<BubbleChart, ChartEventMap>
}

/** One projected point: `[x, y, size, row, diameter]`. `row` indexes the frame; `diameter` is in CSS pixels. */
type BubblePoint = [number, number, number | null, number, number]

/** Values read from the host's `--c2-chart__bubble…` custom properties for each option build. */
interface BubbleStyle {
  opacity: number
  hoverOpacity: number
  borderWidth: number
  minSize: number
  maxSize: number
  labelColor: string
  labelFontSize: number
}

const STYLE_FALLBACK: BubbleStyle = { opacity: 0.5, hoverOpacity: 0.85, borderWidth: 1, minSize: 8, maxSize: 64, labelColor: '#18181b', labelFontSize: 11 }

/** Average glyph width as a share of the font size, for deciding whether a label fits inside its bubble. */
const GLYPH_WIDTH = 0.58

/** `unit_price` -> `Unit price`: a readable label for a field the author did not name. */
function humanize(field: string): string {
  const last = field.split('.').pop() ?? field
  const spaced = last.replace(/[_-]+/g, ' ').replace(/([a-z\d])([A-Z])/g, '$1 $2')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

/**
 * `color` at `alpha`, for a fill that must stay translucent while its outline stays opaque. Handles the computed
 * `rgb()` the theme hands over and hex literals; anything else returns `undefined` and the caller falls back to
 * the item's `opacity`, which fades the outline too.
 */
function withAlpha(color: string, alpha: number): string | undefined {
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(color)
  if (rgb) return `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, ${alpha})`
  const hex = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(color)
  if (!hex) return undefined
  const digits = hex[1].length === 3 ? [...hex[1]].map((digit) => digit + digit).join('') : hex[1]
  const value = parseInt(digits, 16)
  return `rgba(${value >> 16}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`
}

/** Rounds to two significant digits, so the size key reads 1.4B and 350M rather than 1,429 and 357.25. */
function roundNicely(value: number): number {
  if (value <= 0) return 0
  const magnitude = 10 ** (Math.floor(Math.log10(value)) - 1)
  return Math.round(value / magnitude) * magnitude
}

/**
 * A bubble chart drawn by ECharts: a scatter plot whose third measure is the area of each point. `x-field` and
 * `y-field` place a bubble and `size-field` sizes it; `label-field` names it in the tooltip and on the bubble.
 *
 * Rows come in either of two shapes:
 *
 * - **One row per point, grouped** (`series-field`): each row names its series, and `y-field` holds the value.
 *   The series are the distinct values of that field, in the order they first appear; a `c2-chart-series` whose
 *   `field` is one of those values relabels or recolours it, and declaring them limits the chart to them.
 * - **One column per series**: each `c2-chart-series` reads its own `field` as the y value, as on
 *   `c2-scatter-chart`, and a row may carry only one series' field.
 *
 * ```html
 * <c2-bubble-chart x-field="gdp" y-field="life" size-field="pop" label-field="country" series-field="region"
 *   x-scale="log" data='[{ "country": "Brazil", "region": "Americas", "gdp": 10040, "life": 75.8, "pop": 216 }]'>
 * </c2-bubble-chart>
 * ```
 *
 * Size maps to area — the diameter grows with the square root of the value — between `--c2-chart__bubble--min-size`
 * and `--c2-chart__bubble--max-size`, so a value twice as large looks twice as large. Larger bubbles are drawn first
 * within each series so the small ones stay on top and hoverable. `size-legend` ends the built-in legend with a key
 * to the sizes.
 *
 * @tag c2-bubble-chart
 *
 * @slotcomponent c2-chart-series
 *
 * @csspart size-legend - The size key at the end of the built-in legend.
 *
 * @cssproperty {opacity} [--c2-chart__bubble--opacity=0.5] - Fill opacity of a bubble, so overlapping bubbles stay readable. The outline stays opaque.
 * @cssproperty {opacity} [--c2-chart__bubble__hover--opacity=0.85] - Fill opacity of the hovered bubble.
 * @cssproperty {pixel} [--c2-chart__bubble--border-width=1px] - Width of a bubble's outline, drawn in its series colour.
 * @cssproperty {pixel} [--c2-chart__bubble--min-size=8px] - Diameter of the smallest bubble, and of a row with no size.
 * @cssproperty {pixel} [--c2-chart__bubble--max-size=64px] - Diameter of the bubble holding the largest size.
 * @cssproperty {color} [--c2-chart__bubble-label--color=#18181b] - Colour of the labels drawn inside bubbles. Falls back to `--c2-chart--color`, so it follows the theme.
 * @cssproperty {font-size} [--c2-chart__bubble-label--font-size=11px] - Font size of the labels drawn inside bubbles.
 * @cssproperty {color} [--c2-chart__size-legend--color=#71717a] - Colour of the size key's circles and text.
 */
@customElement('c2-bubble-chart')
export class BubbleChart extends EchartsChartBase {
  static override styles: CSSResultGroup = [ChartBase.styles, unsafeCSS(bubbleStyles)]

  protected override readonly features: readonly EchartsFeature[] = ['scatter', 'grid']

  /** Row field holding the y value. Required with `series-field`; otherwise the shortcut for a single series. */
  @property({ type: String, attribute: 'y-field' }) yField = ''

  /** Row field encoded as bubble area. Without it every bubble has the minimum size. */
  @property({ type: String, attribute: 'size-field' }) sizeField = ''

  /** Row field whose value names the series a row belongs to, for one-row-per-point data. */
  @property({ type: String, attribute: 'series-field' }) seriesField = ''

  /** Scale of the x axis. `log` suits a measure spanning orders of magnitude; rows at or below zero are skipped. */
  @property({ type: String, attribute: 'x-scale' }) xScale: 'linear' | 'log' = 'linear'

  /** Scale of the y axis. `log` skips rows at or below zero. */
  @property({ type: String, attribute: 'y-scale' }) yScale: 'linear' | 'log' = 'linear'

  /** The size drawn at the maximum diameter. Defaults to the largest size in the data; pin it to compare charts. */
  @property({ type: Number, attribute: 'size-max' }) sizeMax?: number

  /** Which bubbles carry their label: `auto` labels the ones whose text fits inside. Needs `label-field`. */
  @property({ type: String, attribute: 'bubble-labels' }) bubbleLabels: 'none' | 'auto' | 'all' = 'auto'

  /** Ends the built-in legend with a key to the bubble sizes, titled by `size-label`. Off by default. */
  @property({ type: Boolean, attribute: 'size-legend' }) sizeLegend = false

  /** Names the size measure in the tooltip and the size key. Defaults to the humanized `size-field`. */
  @property({ type: String, attribute: 'size-label' }) sizeLabel = ''

  /** Title of the x axis, also used in the tooltip. */
  @property({ type: String, attribute: 'x-label' }) xLabel = ''

  /** Title of the y axis, also used in the tooltip. */
  @property({ type: String, attribute: 'y-label' }) yLabel = ''

  /** Formats a size for the tooltip and the size key. Property only. */
  @property({ attribute: false }) formatSize?: (value: number) => string

  /** The size mapped to the maximum diameter, derived from the data unless `size-max` pins it. */
  @state() private sizeDomain = 0

  /** Per series, the frame row of each drawn point, in draw order: the engine reports the draw index. */
  #rows: number[][] = []

  constructor() {
    super()
    this.tooltip = 'item'
  }

  // ------------------------------------------------------------------ data ---

  protected override normalizeContext(): NormalizeContext {
    const base = super.normalizeContext()
    return {
      ...base,
      seriesField: this.seriesField || undefined,
      valueField: this.yField || undefined,
      extraFields: this.sizeField ? [this.sizeField] : [],
      signature: `${base.signature}|${this.seriesField}|${this.yField}|${this.sizeField}`,
    }
  }

  protected override reshapesFrame(changed: PropertyValues): boolean {
    return super.reshapesFrame(changed) || changed.has('yField') || changed.has('sizeField') || changed.has('seriesField')
  }

  /**
   * With `series-field`, one series per distinct group value in the order it first appears; with only `y-field`,
   * that one field; otherwise the scatter rule, minus the size field.
   */
  protected override inferredSeries(): ChartSeriesConfig[] {
    const rows = this.data
    if (this.seriesField) {
      if (!Array.isArray(rows)) return []
      const seen = new Set<string>()
      for (const row of rows) {
        if (typeof row !== 'object' || row === null || Array.isArray(row) || ArrayBuffer.isView(row)) continue
        const group = getFieldValue(row as Record<string, unknown>, this.seriesField)
        if (group !== undefined && group !== null && group !== '') seen.add(String(group))
      }
      return [...seen].map((group) => ({ field: group, label: group }))
    }
    if (this.yField) return [{ field: this.yField, label: this.yLabel || humanize(this.yField) }]
    return super.inferredSeries().filter((series) => series.field !== this.sizeField)
  }

  protected override validationError(): string {
    return this.seriesField && !this.yField ? 'series-field needs a y-field to read the values from.' : ''
  }

  /** The size of one row, or `null` when the row has none. */
  protected sizeAt(row: number): number | null {
    const column = this.sizeField ? this.frame?.extras?.[this.sizeField] : undefined
    return column ? columnValue(column, row) : null
  }

  /** Diameter in CSS pixels: area-proportional to `size`, clamped between the minimum and maximum sizes. */
  protected diameterOf(size: number | null, style: BubbleStyle = this.bubbleStyle(), domain = this.sizeMax ?? this.sizeDomain): number {
    if (size === null || size <= 0 || !(domain > 0)) return style.minSize
    return Math.max(style.minSize, style.maxSize * Math.sqrt(Math.min(size, domain) / domain))
  }

  /**
   * One `[x, y, size, row, diameter]` list per series, largest first. Points a log axis cannot place, and rows
   * that are gaps for the series, are left out; `#rows` maps each draw index back to its frame row.
   */
  protected override projectData(frame: ChartFrame): BubblePoint[][] {
    const sizes = this.sizeField ? frame.extras?.[this.sizeField] : undefined
    let largest = 0
    if (sizes) {
      for (let row = 0; row < frame.length; row += 1) largest = Math.max(largest, columnValue(sizes, row) ?? 0)
    }
    // The size key is Lit's to draw, and a data-only update skips Lit entirely, so the domain moves through a
    // reactive key. Deferred: this can run inside `shouldUpdate`, where a property set would be discarded.
    if (largest !== this.sizeDomain) queueMicrotask(() => (this.sizeDomain = largest))
    const domain = this.sizeMax ?? largest

    const style = this.bubbleStyle()
    const logX = this.xScale === 'log'
    const logY = this.yScale === 'log'
    const projected = frame.columns.map((column) => {
      const points: BubblePoint[] = []
      for (let row = 0; row < frame.length; row += 1) {
        const x = columnValue(frame.x, row)
        const y = columnValue(column, row)
        if (x === null || y === null || (logX && x <= 0) || (logY && y <= 0)) continue
        const size = sizes ? columnValue(sizes, row) : null
        points.push([x, y, size, row, this.diameterOf(size, style, domain)])
      }
      return points.sort((a, b) => b[4] - a[4])
    })
    this.#rows = projected.map((points) => points.map((point) => point[3]))
    return projected
  }

  // ------------------------------------------------------------ options ---

  /** Reads the `--c2-chart__bubble…` properties through the probes the chart renders. */
  protected bubbleStyle(): BubbleStyle {
    const probe = this.renderRoot?.querySelector<HTMLElement>('.bubble-probe')
    const hover = this.renderRoot?.querySelector<HTMLElement>('.bubble-probe--hover')
    if (!probe || !hover || typeof getComputedStyle !== 'function') return STYLE_FALLBACK
    const style = getComputedStyle(probe)
    const number = (value: string, fallback: number) => {
      const parsed = parseFloat(value)
      return Number.isFinite(parsed) ? parsed : fallback
    }
    const minSize = number(style.width, STYLE_FALLBACK.minSize)
    return {
      opacity: number(style.opacity, STYLE_FALLBACK.opacity),
      hoverOpacity: number(getComputedStyle(hover).opacity, STYLE_FALLBACK.hoverOpacity),
      borderWidth: number(style.borderTopWidth, STYLE_FALLBACK.borderWidth),
      minSize,
      maxSize: Math.max(minSize, number(style.height, STYLE_FALLBACK.maxSize)),
      labelColor: style.color || STYLE_FALLBACK.labelColor,
      labelFontSize: number(style.fontSize, STYLE_FALLBACK.labelFontSize),
    }
  }

  protected override coordinateSystem(context: ChartBuildContext): Record<string, unknown> {
    const { theme } = context
    const system = super.coordinateSystem(context) as { grid: Record<string, number>; xAxis: Record<string, unknown>; yAxis: Record<string, unknown> }
    const title = (name: string, gap: number) =>
      name ? { name, nameLocation: 'middle', nameGap: gap, nameTextStyle: { color: theme.mutedColor, fontSize: theme.axisFontSize } } : {}
    // Row labels name bubbles here; they are never the x axis' categories.
    const xType = this.xScale === 'log' ? 'log' : this.xType === 'time' ? 'time' : 'value'
    return {
      grid: { ...system.grid, left: system.grid.left + (this.yLabel ? 20 : 0), bottom: system.grid.bottom + (this.xLabel ? 20 : 0) },
      xAxis: { ...system.xAxis, type: xType, data: undefined, scale: true, ...title(this.xLabel, 30) },
      yAxis: { ...system.yAxis, type: this.yScale === 'log' ? 'log' : 'value', scale: true, ...title(this.yLabel, 44) },
    }
  }

  protected override seriesOption(index: number, context: ChartBuildContext): Record<string, unknown> {
    const color = this.colorOf(context.series[index] ?? { field: '' }, index, context.theme)
    const style = this.bubbleStyle()
    const fill = withAlpha(color, style.opacity)
    const hoverFill = withAlpha(color, style.hoverOpacity)
    const label =
      this.bubbleLabels === 'none' || !this.labelField
        ? { show: false }
        : {
            show: true,
            position: 'inside',
            color: style.labelColor,
            fontSize: style.labelFontSize,
            formatter: (params: { value: BubblePoint }) => this.bubbleLabel(params.value, style),
          }
    return {
      type: 'scatter',
      symbol: 'circle',
      symbolSize: (value: BubblePoint) => value[4],
      itemStyle: { color: fill ?? color, opacity: fill ? 1 : style.opacity, borderColor: color, borderWidth: style.borderWidth },
      emphasis: {
        scale: false,
        itemStyle: { color: hoverFill ?? color, opacity: hoverFill ? 1 : style.hoverOpacity, borderColor: color, borderWidth: style.borderWidth + 1 },
      },
      label,
    }
  }

  /** The label drawn inside a bubble: the row's label, or nothing when `auto` finds it too wide for the bubble. */
  private bubbleLabel(point: BubblePoint, style: BubbleStyle): string {
    const text = this.frame?.labels?.[point[3]] ?? ''
    if (this.bubbleLabels === 'all') return text
    return text.length * style.labelFontSize * GLYPH_WIDTH <= point[4] - 4 ? text : ''
  }

  // ------------------------------------------------------- interaction ---

  /** The engine reports a point's index in draw order; everything else addresses it by frame row. */
  #toRow<T extends { index: number; seriesIndex: number }>(detail: T): T {
    const row = this.#rows[detail.seriesIndex]?.[detail.index]
    return row === undefined ? detail : { ...detail, index: row }
  }

  protected override handleEngineHover(detail: { index: number; seriesIndex: number; px: number; py: number } | null): void {
    super.handleEngineHover(detail ? this.#toRow(detail) : null)
  }

  protected override handleEngineClick(detail: { index: number; seriesIndex: number }): void {
    super.handleEngineClick(this.#toRow(detail))
  }

  protected override tooltipContextAt(detail: { index: number; seriesIndex: number; px: number; py: number }): ChartTooltipContext {
    const context = super.tooltipContextAt(detail)
    const size = this.sizeAt(detail.index)
    return {
      ...context,
      // A row's label names the bubble; the x value keeps its own row.
      formattedX: this.formatX(context.x),
      // One-row-per-point data is a gap in every other series at this row.
      entries: context.entries.filter((entry) => entry.value !== null),
      label: this.frame?.labels?.[detail.index],
      size,
      formattedSize: this.#formatSize(size),
    }
  }

  protected override pointAt(index: number, seriesIndex: number): ChartPointEventDetail | undefined {
    const point = super.pointAt(index, seriesIndex)
    return point ? { ...point, size: this.sizeAt(index) } : undefined
  }

  #formatSize(size: number | null): string {
    if (size === null) return '—'
    return this.formatSize?.(size) ?? this.formatValue(size)
  }

  // ------------------------------------------------------------- render ---

  protected override defaultTooltip(context: ChartTooltipContext): TemplateResult {
    const [entry] = context.entries
    const seriesName = entry ? (entry.series.label ?? entry.series.field) : ''
    const row = (label: string, value: string) => html`
      <div class="tooltip-row">
        <span class="tooltip-label">${label}</span>
        <span class="tooltip-value">${value}</span>
      </div>
    `
    return html`
      <div class="tooltip-row">
        ${entry ? html`<span class="tooltip-marker" style="background:${entry.color}"></span>` : nothing}
        <span class="tooltip-title tooltip-label">${context.label ?? seriesName}</span>
        ${context.label && seriesName ? html`<span class="tooltip-subtitle">${seriesName}</span>` : nothing}
      </div>
      ${row(this.xLabel || humanize(this.xField || 'x'), context.formattedX)}
      ${context.entries.map((item) => row(this.yLabel || humanize(this.yField || item.series.label || item.series.field), item.formatted))}
      ${this.sizeField ? row(this.#sizeName(), context.formattedSize ?? '—') : nothing}
    `
  }

  #sizeName(): string {
    return this.sizeLabel || humanize(this.sizeField)
  }

  /** Three nested circles at a full, a quarter and a sixteenth of the size domain: diameters of 1, ½ and ¼. */
  protected override renderLegendExtras(): unknown {
    const domain = this.sizeMax ?? this.sizeDomain
    if (!this.sizeLegend || !this.sizeField || !(domain > 0)) return nothing
    const style = this.bubbleStyle()
    const values = [domain, domain / 4, domain / 16].map(roundNicely).filter((value, index, all) => value > 0 && all.indexOf(value) === index)
    const circles = values
      .map((value) => ({ value, diameter: this.diameterOf(value, style) }))
      .filter((circle, index) => index === 0 || circle.diameter > style.minSize)
    const size = circles[0]?.diameter ?? style.maxSize
    const format = (value: number): string =>
      this.formatSize?.(value) ?? new Intl.NumberFormat(this.locale, { notation: 'compact', maximumFractionDigits: 1 }).format(value)
    const labelX = size + 10
    return html`
      <div class="size-legend" part="size-legend">
        <span>${this.#sizeName()}</span>
        <svg
          width=${labelX + 40}
          height=${size + 2}
          role="img"
          aria-label=${`${this.#sizeName()}: ${circles.map((circle) => format(circle.value)).join(', ')}`}
        >
          ${circles.map((circle) => {
            const radius = circle.diameter / 2
            const top = size + 1 - circle.diameter
            return svg`
              <circle cx=${size / 2 + 1} cy=${top + radius} r=${radius}></circle>
              <line x1=${size / 2 + 1} x2=${labelX - 2} y1=${top} y2=${top}></line>
              <text x=${labelX} y=${top} dominant-baseline="middle">${format(circle.value)}</text>
            `
          })}
        </svg>
      </div>
    `
  }

  protected override render(): TemplateResult {
    return html`${super.render()}<span class="bubble-probe" aria-hidden="true"></span><span class="bubble-probe bubble-probe--hover" aria-hidden="true"></span>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-bubble-chart': BubbleChart
  }
}
