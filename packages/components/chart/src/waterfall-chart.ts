import { html, nothing, render, unsafeCSS, type CSSResultGroup, type PropertyValues, type TemplateResult } from 'lit'
import { state } from 'lit/decorators.js'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { getFieldValue } from '@c2n/core/data-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import waterfallStyles from './waterfall-chart.scss?inline'
import { ChartBase, type ChartEventMap, type ChartLegendItem } from './chart-base.js'
import { EchartsChartBase } from './echarts-chart-base.js'
import { columnValue } from './chart-data.js'
import { measureText } from './chart-measure.js'
import { waterfallMessages } from './messages.js'
import type { ChartAdapter, ChartBuildContext } from './chart-adapter.js'
import type { EchartsFeature } from './engines/echarts-loader.js'
import type { ChartFrame, ChartPointEventDetail, ChartSeriesConfig, ChartTooltipContext } from './chart-types.js'
import './chart-series.js'

/** What a waterfall bar shows: a step up, a step down, or the running total at that point. */
export type WaterfallStepKind = 'increase' | 'decrease' | 'total'

/** One bar of the waterfall, as the tooltip, the events and `steps` describe it. */
export interface WaterfallStep {
  /** The row's label (`label-field`), or the `total-label` of the appended total. */
  label: string
  kind: WaterfallStepKind
  /** The change the row makes; on a total, the total itself. */
  value: number
  /** Where the bar starts: the running total before the row, or `0` for a total. */
  start: number
  /** Where the bar ends: the running total after the row. */
  end: number
  /** The row's position in `data`, or `-1` for the total `total-label` appends. */
  row: number
}

/** What `renderTooltip`, the `tooltip-change` event and a linked `c2-chart-tooltip` receive. */
export interface WaterfallTooltipContext extends ChartTooltipContext {
  step?: WaterfallStep
}

export interface WaterfallChart {
  addEventListener: TypedAddEventListener<WaterfallChart, ChartEventMap>
  removeEventListener: TypedRemoveEventListener<WaterfallChart, ChartEventMap>
}

/** The input of {@link buildWaterfallSteps}: each row's label, value and whether it is a total row. */
export interface WaterfallRowInput {
  label: string
  value: number | null
  total: boolean
}

/**
 * Turns rows into bars. A row is a step from the running total, up or down by its value; a total row draws the running
 * total from zero, or, when it carries a value, sets the running total to it first (an opening balance). A row with no
 * value changes nothing and draws no bar. `totalLabel` appends one last total.
 */
export function buildWaterfallSteps(rows: readonly WaterfallRowInput[], totalLabel = ''): WaterfallStep[] {
  const steps: WaterfallStep[] = []
  let running = 0
  rows.forEach((row, index) => {
    if (row.total) {
      if (row.value !== null && Number.isFinite(row.value)) running = row.value
      steps.push({ label: row.label, kind: 'total', value: running, start: 0, end: running, row: index })
      return
    }
    if (row.value === null || !Number.isFinite(row.value)) return
    const start = running
    running += row.value
    steps.push({ label: row.label, kind: row.value < 0 ? 'decrease' : 'increase', value: row.value, start, end: running, row: index })
  })
  if (totalLabel && steps.length > 0) steps.push({ label: totalLabel, kind: 'total', value: running, start: 0, end: running, row: -1 })
  return steps
}

/** Share of a category's band a bar takes. */
const BAR_SHARE = 0.6

/** The plot's left and right margins, in pixels: room for the value axis, and for the last bar. */
const GRID_LEFT = 56
const GRID_RIGHT = 16

/** Most lines a category label wraps onto before it is cut. */
const MAX_LABEL_LINES = 3

/** How a slanted category label is turned, in degrees, and how long it may run before it is cut. */
const SLANT = 35
const SLANTED_MAX_WIDTH = 110

/** How many lines `text` takes when wrapped at its spaces within `width`. Every word fits a line on its own. */
function wrappedLines(text: string, width: number, font: string, size: number): number {
  let lines = 1
  let line = 0
  const space = measureText(' ', font, size)
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const length = measureText(word, font, size)
    if (line > 0 && line + space + length > width) {
      lines += 1
      line = length
    } else line += (line > 0 ? space : 0) + length
  }
  return lines
}

/** Space between a bar's end and its value label, in pixels. */
const LABEL_OFFSET = 4

const KINDS: readonly WaterfallStepKind[] = ['increase', 'decrease', 'total']

/** What ECharts hands a custom series' `renderItem`, as far as this chart uses it. */
interface RenderParams {
  dataIndex: number
}
interface RenderApi {
  coord(value: [number, number]): [number, number]
  size(value: [number, number]): [number, number]
}

/**
 * A waterfall chart: a running total bridged by the steps that move it, drawn by ECharts. One row is one step:
 * `label-field` names it and the single series gives the change, so each bar floats from the total before the row to
 * the total after it, rising bars in `--c2-chart__positive--color` and falling ones in `--c2-chart__negative--color`.
 * A connector joins the end of each bar to the start of the next.
 *
 * A row whose `total-field` is true is a subtotal: a bar from zero to the running total, in the series colour. A total
 * row that carries a value sets the running total to it first, which is how an opening balance starts the bridge.
 * `total-label` appends the closing total.
 *
 * ```html
 * <c2-waterfall-chart label-field="item" total-field="total" total-label="Net income"
 *   data='[{ "item": "Revenue", "amount": 420, "total": true }, { "item": "Cost of sales", "amount": -180 }, { "item": "Opex", "amount": -95 }]'>
 *   <c2-chart-series field="amount" label="Amount"></c2-chart-series>
 * </c2-waterfall-chart>
 * ```
 *
 * The legend lists the three kinds of bar. A hidden table lists every step with its change and running total for
 * assistive technology, and the plot is named by it.
 *
 * @tag c2-waterfall-chart
 *
 * @slotcomponent c2-chart-series
 *
 * @cssproperty {number} [--c2-chart__bar--border-radius=0] - Roundedness of a bar's corners, from 0 (square) to 0.5 (fully rounded).
 * @cssproperty {color} [--c2-chart__connector--color=#a1a1aa] - Colour of the line joining one bar to the next.
 * @cssproperty {pixel} [--c2-chart__connector--width=1px] - Width of the connectors. `0` leaves them out.
 * @cssproperty {opacity} [--c2-chart__series__dimmed--opacity=0.25] - Opacity the other kinds of bar keep while one is highlighted.
 */
@customElement('c2-waterfall-chart')
export class WaterfallChart extends EchartsChartBase {
  static override styles: CSSResultGroup = [ChartBase.styles, unsafeCSS(waterfallStyles)]

  protected override readonly features: readonly EchartsFeature[] = ['custom', 'grid']

  /** Row field that marks a row as a total; may be a dotted path. A row whose field is `true` is drawn as a total. */
  @property({ type: String, attribute: 'total-field' }) totalField = ''

  /** Appends a closing total with this label. Empty (the default) appends none. */
  @property({ type: String, attribute: 'total-label' }) totalLabel = ''

  /** Prints each bar's value over it: the signed change on a step, the total on a total. */
  @property({ type: Boolean, attribute: 'value-labels' }) valueLabels = false

  /** Kinds of bar the reader has switched off from the legend. The running total still counts them. */
  @state() private hiddenKinds = new Set<WaterfallStepKind>()

  /** Bumped on every data change, so the options (the category axis rides on them) are rebuilt with the data. */
  @state() private dataRevision = 0

  private readonly msg = new LocalizeController(this, waterfallMessages, () => this.locale)

  #steps?: { frame: ChartFrame; revision: number; length: number; data: unknown; key: string; steps: WaterfallStep[] }

  constructor() {
    super()
    this.xType = 'category'
    this.tooltip = 'item'
  }

  /** The bars, in order, with where each starts and ends. For a table view or an export. */
  get steps(): WaterfallStep[] {
    return this.#computeSteps().map((step) => ({ ...step }))
  }

  /** Shows or hides one kind of bar, as the legend does. The running total still counts the hidden steps. */
  setKindVisible(kind: WaterfallStepKind, visible: boolean): void {
    const next = new Set(this.hiddenKinds)
    if (visible) next.delete(kind)
    else next.add(kind)
    this.hiddenKinds = next
    this.notifyLegendChange()
  }

  // ------------------------------------------------------ chart overrides ---

  /** The base fast path sends the data alone; the category axis and the appended total ride on the options too. */
  protected override shouldUpdate(changed: PropertyValues): boolean {
    if (changed.has('data') || changed.has('revision')) return true
    return super.shouldUpdate(changed)
  }

  protected override willUpdate(changed: PropertyValues): void {
    if (changed.has('data') || changed.has('revision')) this.dataRevision += 1
    super.willUpdate(changed)
  }

  protected override get legendDependsOnData(): boolean {
    return true
  }

  /** One kind of bar per legend entry: the series is one, and its steps are what the reader tells apart. */
  protected override legendItems(): ChartLegendItem[] {
    const steps = this.#computeSteps()
    const series = this.resolvedSeries[0] ?? { field: '' }
    return KINDS.filter((kind) => steps.some((step) => step.kind === kind)).map((kind, index) => {
      const visible = !this.hiddenKinds.has(kind)
      return {
        label: this.msg.t(kind),
        color: this.#colorOf(kind),
        visible,
        ...this.legendEntryState(kind, visible, (next) => this.setKindVisible(kind, next)),
        series,
        index,
      }
    })
  }

  protected override coordinateSystem(context: ChartBuildContext): Record<string, unknown> {
    const base = super.coordinateSystem(context) as { grid: Record<string, unknown>; xAxis: Record<string, unknown>; yAxis: Record<string, unknown> }
    const top = this.valueLabels ? 16 + context.theme.fontSize : 16
    const labels = this.#categoryLabels(context)
    return {
      grid: { ...base.grid, top, left: GRID_LEFT, bottom: labels.bottom },
      xAxis: {
        ...base.xAxis,
        type: 'category',
        data: this.#computeSteps().map((step) => step.label),
        axisTick: { alignWithLabel: true },
        axisLabel: { ...(base.xAxis.axisLabel as object), ...labels.axisLabel },
      },
      yAxis: { ...base.yAxis, axisLabel: { ...(base.yAxis.axisLabel as object), formatter: (value: number) => this.#format(value) } },
    }
  }

  /** The category labels are pixel-fitted to their bands; a resize does not rebuild the options, so they are pushed here. */
  protected override async createAdapter(): Promise<ChartAdapter> {
    const adapter = await super.createAdapter()
    return {
      ...adapter,
      resize: (width, height) => {
        adapter.resize(width, height)
        if (width <= 0 || height <= 0) return
        const labels = this.#categoryLabels({ ...this.buildContext(), width, height })
        adapter.setOptions({ grid: { bottom: labels.bottom }, xAxis: { axisLabel: labels.axisLabel } }, 'merge')
      },
    }
  }

  protected override seriesOption(_index: number, context: ChartBuildContext): Record<string, unknown> {
    const steps = this.#computeSteps()
    const { theme } = context
    const connector = this.#connector()
    const highlighted = KINDS.find((kind) => kind === this.highlighted)
    const font = `${theme.fontSize}px ${theme.fontFamily === 'inherit' ? 'system-ui, sans-serif' : theme.fontFamily}`
    return {
      type: 'custom',
      // The start and end are both values: the axis has to reach every bar's far end, and zero.
      encode: { x: 0, y: [1, 2] },
      animationDurationUpdate: 0,
      renderItem: (params: RenderParams, api: RenderApi) => {
        const step = steps[params.dataIndex]
        if (!step) return null
        const index = params.dataIndex
        const [x, startY] = api.coord([index, step.start])
        const [, endY] = api.coord([index, step.end])
        const width = api.size([1, 0])[0] * BAR_SHARE
        const children: Record<string, unknown>[] = []
        const hidden = this.hiddenKinds.has(step.kind)
        const opacity = highlighted && highlighted !== step.kind ? theme.dimmedOpacity : 1
        const top = Math.min(startY, endY)
        // A bar of no change still gets a hairline, so the step reads as there and flat rather than missing.
        const height = Math.max(1, Math.abs(endY - startY))
        if (!hidden) {
          children.push({
            type: 'rect',
            shape: { x: x - width / 2, y: top, width, height, r: theme.barRadius * width },
            style: { fill: this.#colorOf(step.kind), opacity },
          })
          if (this.valueLabels) {
            const above = step.end >= step.start
            children.push({
              type: 'text',
              silent: true,
              style: {
                text: step.kind === 'total' ? this.#format(step.value) : this.#signed(step.value),
                x,
                y: above ? top - LABEL_OFFSET : top + height + LABEL_OFFSET,
                fill: theme.color,
                font,
                align: 'center',
                verticalAlign: above ? 'bottom' : 'top',
                opacity,
              },
            })
          }
        }
        const next = steps[params.dataIndex + 1]
        // The connector carries the running total across to the next bar, so it is drawn only where the next bar starts
        // at that level: not into an opening balance that resets the total.
        if (next && connector.width > 0 && (next.kind === 'total' ? next.end : next.start) === step.end) {
          const [nextX] = api.coord([index + 1, step.end])
          children.push({
            type: 'line',
            silent: true,
            shape: { x1: x + width / 2, y1: endY, x2: nextX - width / 2, y2: endY },
            style: { stroke: connector.color || theme.crosshairColor, lineWidth: connector.width },
          })
        }
        return { type: 'group', children }
      },
    }
  }

  protected override projectData(_frame: ChartFrame, _context: ChartBuildContext): unknown {
    this.#renderAccessibleSummary()
    return [this.#computeSteps().map((step, index) => [index, step.start, step.end])]
  }

  /** A click names one bar; the single series has nothing to set apart. */
  protected override highlightKeyAt(): string | undefined {
    return undefined
  }

  protected override pointAt(index: number, seriesIndex: number): ChartPointEventDetail | undefined {
    const step = this.#computeSteps()[index]
    const series = this.resolvedSeries[seriesIndex] ?? this.resolvedSeries[0]
    if (!step || !series) return undefined
    return { index, seriesIndex: 0, series, x: index, y: step.value, label: step.label }
  }

  protected override tooltipContextAt(detail: { index: number; seriesIndex: number; px: number; py: number }): WaterfallTooltipContext {
    const step = this.#computeSteps()[detail.index]
    const base = { index: detail.index, x: detail.index, px: detail.px, py: detail.py }
    if (!step) return { ...base, formattedX: '', entries: [] }
    const series = this.resolvedSeries[0] ?? { field: '' }
    const entry = (field: string, label: string, value: number, formatted: string, color: string) => ({
      seriesIndex: 0,
      series: { ...series, field, label },
      value,
      formatted,
      color,
    })
    const color = this.#colorOf(step.kind)
    const entries =
      step.kind === 'total'
        ? [entry('total', this.msg.t('total'), step.value, this.#format(step.value), color)]
        : [
            entry('change', series.label ?? this.msg.t('change'), step.value, this.#signed(step.value), color),
            entry('running-total', this.msg.t('runningTotal'), step.end, this.#format(step.end), this.#colorOf('total')),
          ]
    return { ...base, formattedX: step.label, label: step.label, entries, step: { ...step } }
  }

  // ------------------------------------------------------------ lifecycle ---

  protected override firstUpdated(): void {
    super.firstUpdated()
    this.plotElement?.setAttribute('role', 'img')
  }

  protected override updated(changed: PropertyValues): void {
    super.updated(changed)
    this.#renderAccessibleSummary()
    const plot = this.plotElement
    const label = this.#summary()
    if (plot && plot.getAttribute('aria-label') !== label) plot.setAttribute('aria-label', label)
  }

  /**
   * The step table is rendered into a static container after each update rather than in this template, for the reason
   * the legend is: a server cannot see the chart's `c2-chart-series` children, and hydration would keep what it rendered.
   */
  protected override render(): TemplateResult {
    return html`${super.render()}
      <div class="waterfall-a11y-root"></div>`
  }

  // ------------------------------------------------------------ internals ---

  /**
   * Every step is named, so every category label is drawn (ECharts would skip some as they crowd). A label wraps at its
   * spaces onto up to three lines within its band; when one word is wider than a band, every label is slanted instead,
   * since breaking a word reads as two. The plot gives up as much room below as the labels take.
   */
  #categoryLabels(context: ChartBuildContext): { bottom: number; axisLabel: Record<string, unknown> } {
    const { theme } = context
    const steps = this.#computeSteps()
    const size = theme.axisFontSize
    const lineHeight = Math.round(size * 1.25)
    const band = steps.length > 0 ? (context.width - GRID_LEFT - GRID_RIGHT) / steps.length : 0
    const width = Math.max(24, band - 4)
    const font = `${size}px ${theme.fontFamily === 'inherit' ? 'system-ui, sans-serif' : theme.fontFamily}`
    const words = steps.flatMap((step) => step.label.split(/\s+/).filter(Boolean))
    if (words.some((word) => measureText(word, font, size) > width)) {
      const longest = Math.min(SLANTED_MAX_WIDTH, Math.max(...steps.map((step) => measureText(step.label, font, size))))
      const angle = (SLANT * Math.PI) / 180
      return {
        bottom: Math.ceil(12 + longest * Math.sin(angle) + size * Math.cos(angle)),
        axisLabel: { interval: 0, rotate: SLANT, width: SLANTED_MAX_WIDTH, overflow: 'truncate' },
      }
    }
    let lines = 1
    for (const step of steps) lines = Math.max(lines, wrappedLines(step.label, width, font, size))
    lines = Math.min(MAX_LABEL_LINES, lines)
    return {
      bottom: 12 + lines * lineHeight,
      axisLabel: { interval: 0, rotate: 0, width, overflow: 'break', lineHeight, height: lines * lineHeight, lineOverflow: 'truncate' },
    }
  }

  #summary(): string {
    const series = this.resolvedSeries[0]
    return this.msg.t('summary', series?.label ?? series?.field ?? '', String(this.#computeSteps().length))
  }

  #renderAccessibleSummary(): void {
    const root = this.renderRoot?.querySelector<HTMLElement>('.waterfall-a11y-root')
    if (!root) return
    const steps = this.#computeSteps()
    render(
      steps.length > 0
        ? html`
            <table class="waterfall-a11y">
              <caption>
                ${this.#summary()}
              </caption>
              <thead>
                <tr>
                  <th scope="col">${this.msg.t('step')}</th>
                  <th scope="col">${this.msg.t('change')}</th>
                  <th scope="col">${this.msg.t('runningTotal')}</th>
                </tr>
              </thead>
              <tbody>
                ${steps.map(
                  (step) => html`
                    <tr>
                      <th scope="row">${step.label}</th>
                      <td>${step.kind === 'total' ? this.msg.t('total') : this.#signed(step.value)}</td>
                      <td>${this.#format(step.end)}</td>
                    </tr>
                  `,
                )}
              </tbody>
            </table>
          `
        : nothing,
      root,
      { host: this },
    )
  }

  #computeSteps(): WaterfallStep[] {
    const frame = this.frame
    if (!frame) return []
    const key = `${this.totalField}|${this.totalLabel}`
    const cached = this.#steps
    if (
      cached &&
      cached.frame === frame &&
      cached.revision === frame.revision &&
      cached.length === frame.length &&
      cached.data === this.data &&
      cached.key === key
    )
      return cached.steps
    const rows = Array.isArray(this.data) ? (this.data as unknown[]) : []
    const column = frame.columns[0]
    const input: WaterfallRowInput[] = []
    for (let index = 0; index < frame.length; index += 1) {
      const row = rows[index]
      const flag = this.totalField && row && typeof row === 'object' ? getFieldValue(row as Record<string, unknown>, this.totalField) : undefined
      input.push({
        label: frame.labels?.[index] ?? String(index + 1),
        value: column ? columnValue(column, index) : null,
        total: flag === true || flag === 'true' || flag === 1,
      })
    }
    const steps = buildWaterfallSteps(input, this.totalLabel)
    this.#steps = { frame, revision: frame.revision, length: frame.length, data: this.data, key, steps }
    return steps
  }

  #colorOf(kind: WaterfallStepKind): string {
    const theme = this.themeController.theme
    if (kind === 'increase') return theme.positive
    if (kind === 'decrease') return theme.negative
    const series = this.resolvedSeries[0]
    return series ? this.colorOf(series, 0, theme) : theme.palette[0]
  }

  #connector(): { color: string; width: number } {
    const style = getComputedStyle(this)
    const width = parseFloat(style.getPropertyValue('--c2-chart__connector--width'))
    return { color: style.getPropertyValue('--c2-chart__connector--color').trim(), width: Number.isFinite(width) ? width : 1 }
  }

  #format(value: number): string {
    const series = this.resolvedSeries[0] as ChartSeriesConfig | undefined
    return series?.format?.(value) ?? this.formatValue(value)
  }

  /** A step's change with its sign, so a rise reads as one without its colour. */
  #signed(value: number): string {
    const text = this.#format(Math.abs(value))
    return value < 0 ? `−${text}` : `+${text}`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-waterfall-chart': WaterfallChart
  }
}
