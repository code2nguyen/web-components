import { html, nothing, render, unsafeCSS, type CSSResultGroup, type PropertyValues, type TemplateResult } from 'lit'
import { property, jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { getFieldValue } from '@c2n/core/data-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import bulletStyles from './bullet-chart.scss?inline'
import { ChartBase, type ChartEventMap } from './chart-base.js'
import { EchartsChartBase } from './echarts-chart-base.js'
import { columnValue, type NormalizeContext } from './chart-data.js'
import { measureText } from './chart-measure.js'
import { mixColors, parseColor } from './map-scale.js'
import { bandNameKey, bulletMessages } from './bullet-messages.js'
import { bandBoundaries, buildBulletRows, bulletTicks, type BulletBetter, type BulletRow, type BulletRowInput } from './bullet-model.js'
import type { ChartBuildContext } from './chart-adapter.js'
import type { ChartTheme } from './chart-theme.js'
import type { EchartsFeature } from './engines/echarts-loader.js'
import type { ChartFrame, ChartPointEventDetail, ChartSeriesConfig, ChartTooltipContext, ChartTooltipEntry } from './chart-types.js'
import './chart-series.js'

export type { BulletBand, BulletBetter, BulletRow } from './bullet-model.js'

/** One line of the bullet tooltip. `kind` says what it is, whatever the measure's series field is called. */
export interface BulletTooltipEntry extends ChartTooltipEntry {
  kind: 'actual' | 'target' | 'band'
}

/** What `renderTooltip`, the `tooltip-change` event and a linked `c2-chart-tooltip` receive. */
export interface BulletTooltipContext extends ChartTooltipContext {
  entries: BulletTooltipEntry[]
  /** The hovered or focused bullet. */
  row?: BulletRow
}

export interface BulletChart {
  addEventListener: TypedAddEventListener<BulletChart, ChartEventMap>
  removeEventListener: TypedRemoveEventListener<BulletChart, ChartEventMap>
}

/** What ECharts hands a custom series' `renderItem`, as far as this chart uses it. */
interface RenderParams {
  dataIndex: number
}
interface RenderApi {
  getWidth(): number
  getHeight(): number
}

/** The chart's own variables, read through the probes in its shadow root. */
interface BulletStyle {
  bandStart: string
  bandEnd: string
  /** `--c2-chart__band-1--color` … `-5`, poorest first, or `undefined` where unset. */
  bandOverrides: (string | undefined)[]
  target: string
  targetWidth: number
  description: string
  labelWeight: string
  rowHeight: number
  rowGap: number
  fontFamily: string
}

/** Where one row sits in the plot, in pixels. */
interface RowBox {
  /** The row's whole box, which the hover backdrop fills. */
  box: { x: number; y: number; width: number; height: number }
  /** The band's edge across the scale (top when horizontal, left when vertical) and its thickness. */
  cross: number
  thickness: number
  /** The pixel of a scale value along the row. */
  at(value: number): number
  ticks: number[]
}

interface Layout {
  key: string
  horizontal: boolean
  rows: RowBox[]
  /** Horizontal: the right edge of the name column. Vertical: the top of the name lines. */
  labelEdge: number
  labelWidth: number
  /** Horizontal: the left edge of the value column. Vertical: the middle of the value line. */
  valueEdge: number
  nameSize: number
  lineHeight: number
}

/** Space between the name column, the bands and the value column, in pixels. */
const COLUMN_GAP = 12

/** Share of the band height the measure bar and the target tick take. */
const BAR_SHARE = 1 / 3
const TARGET_SHARE = 0.7

/** Length of a tick mark on a row's axis, and the space between it and its label, in pixels. */
const TICK = 4

/** Opacity of the backdrop under a hovered or focused row, over the text colour. */
const HOVER_OPACITY = 0.06

/** The emphasis of every mark but the backdrop: ECharts would otherwise lighten a hovered row's bands and bar. */
const STILL = { style: { fill: 'inherit' } }

/** `color` at `alpha`, for the hover backdrop. */
function withAlpha(color: string, alpha: number): string {
  const rgba = parseColor(color)
  return rgba ? `rgba(${Math.round(rgba[0])}, ${Math.round(rgba[1])}, ${Math.round(rgba[2])}, ${alpha})` : `rgba(0, 0, 0, ${alpha})`
}

/**
 * A bullet chart: one measure against a target and qualitative bands, as Stephen Few drew it for KPI scorecards. Each
 * row of `data` is one bullet, on its own scale; several stack, horizontal by default. Drawn by ECharts.
 *
 * `label-field` names a row and `description-field` adds a muted second line, for the unit. The one `c2-chart-series`
 * is the measure, drawn as a bar a third of the band height. `target-field` (or `target` for every row) is the target,
 * a tick across the bar, and `bands-field` (or `bands`) the band boundaries, ascending: `[150, 225, 300]` draws three
 * bands, 0–150, 150–225 and 225–300, from poor to good. A row's scale runs from `min` to the largest of its last band,
 * its value and its target, unless `max-field` or `max` sets the end; `scale="shared"` puts every row on one scale.
 * With `better="lower"` the band colours run the other way, so the good band sits near zero.
 *
 * ```html
 * <c2-bullet-chart label-field="kpi" description-field="unit" target-field="target" bands-field="bands"
 *   data='[{ "kpi": "Revenue", "unit": "US$, thousands", "actual": 270, "target": 250, "bands": [150, 225, 300] }]'>
 *   <c2-chart-series field="actual" label="Actual"></c2-chart-series>
 * </c2-bullet-chart>
 * ```
 *
 * The bands are a grey ramp from `--c2-chart__band-start--color` (poor) to `--c2-chart__band-end--color` (good), and
 * `--c2-chart__band-1--color` … `--c2-chart__band-5--color` replace one position, poorest first, for status tints.
 * The chart sizes itself: unless `--c2-chart--height` is set, it is as tall as its rows, `--c2-chart__row--height`
 * each. `orientation="vertical"` turns the rows into columns.
 *
 * Hovering a row shows the value, the target with the share reached, and the band the value falls in. The plot is one
 * tab stop: the arrow keys move between rows, Home and End go to the first and last, Enter highlights a row and
 * Escape clears it, and a live region reads the focused row. Clicking a row fires `point-click` and highlights it.
 *
 * @tag c2-bullet-chart
 *
 * @slotcomponent c2-chart-series
 *
 * @cssproperty {color} [--c2-chart__band-start--color=#d4d4d8] - The poorest band; the bands between mix evenly towards `--c2-chart__band-end--color`.
 * @cssproperty {color} [--c2-chart__band-end--color=#f4f4f5] - The best band.
 * @cssproperty {color} [--c2-chart__band-1--color] - Replaces the colour of the poorest band, for status tints. Unset, the band follows the ramp.
 * @cssproperty {color} [--c2-chart__band-2--color] - Replaces the colour of the second band from the poorest. Unset, it follows the ramp.
 * @cssproperty {color} [--c2-chart__band-3--color] - Replaces the colour of the third band from the poorest. Unset, it follows the ramp.
 * @cssproperty {color} [--c2-chart__band-4--color] - Replaces the colour of the fourth band from the poorest. Unset, it follows the ramp.
 * @cssproperty {color} [--c2-chart__band-5--color] - Replaces the colour of the fifth band from the poorest. Unset, it follows the ramp.
 * @cssproperty {color} [--c2-chart__target--color=#18181b] - The target tick. Falls back to `--c2-chart--color`.
 * @cssproperty {pixel} [--c2-chart__target--width=3px] - Width of the target tick.
 * @cssproperty {number} [--c2-chart__bar--border-radius=0] - Roundedness of the measure bar's corners, from 0 (square) to 0.5 (fully rounded).
 * @cssproperty {pixel} [--c2-chart__row--height=44px] - Height of a row, its tick axis included (24px with `axis="none"`). The chart is as tall as its rows unless `--c2-chart--height` is set; then the rows share that height.
 * @cssproperty {pixel} [--c2-chart__row--gap=12px] - Space between two rows (two columns when vertical).
 * @cssproperty {font-weight} [--c2-chart__label--font-weight=600] - Weight of a row's name and value.
 * @cssproperty {color} [--c2-chart__description--color=#71717a] - Colour of a row's description. Falls back to `--c2-chart__muted--color`.
 * @cssproperty {opacity} [--c2-chart__series__dimmed--opacity=0.25] - Opacity the other rows keep while one is highlighted.
 * @cssproperty {border} [--c2-chart__plot__focus--outline=2px solid rgba(2, 101, 220, 0.4)] - Focus ring of the plot, the chart's tab stop.
 */
@customElement('c2-bullet-chart')
export class BulletChart extends EchartsChartBase {
  static override styles: CSSResultGroup = [ChartBase.styles, unsafeCSS(bulletStyles)]

  protected override readonly features: readonly EchartsFeature[] = ['custom']

  // A click highlight rebuilds the options under the pointer; the redraw must land in one step. See `createEchartsAdapter`.
  protected override readonly lazyEngineUpdates = false

  /** Row field holding a muted second line under the name, for the unit; may be a dotted path. */
  @property({ type: String, attribute: 'description-field' }) descriptionField = ''

  /** Row field holding each row's target; may be a dotted path. */
  @property({ type: String, attribute: 'target-field' }) targetField = ''

  /** The target of every row without a `target-field`. */
  @property({ type: Number }) target?: number

  /** Row field holding each row's band boundaries, ascending, as an array; may be a dotted path. */
  @property({ type: String, attribute: 'bands-field' }) bandsField = ''

  /** The band boundaries of every row without a `bands-field`, ascending, as a JSON array: `[150, 225, 300]`. Two to five bands. */
  @property({ converter: jsonPropertyConverter }) bands?: number[]

  /**
   * The names of the bands, poorest first, as a comma list or a JSON array (for names holding a comma), for the
   * tooltip, the table and the announcement. The default follows the band count: "Poor, Satisfactory, Good" for three.
   */
  @property({ type: String, attribute: 'band-labels' }) bandLabels = ''

  /** Where every scale starts. */
  @property({ type: Number }) min = 0

  /** Where every scale ends, when there is no `max-field`. Unset, each row ends at the largest of its last band, value and target. */
  @property({ type: Number }) max?: number

  /** Row field holding each row's scale end; may be a dotted path. */
  @property({ type: String, attribute: 'max-field' }) maxField = ''

  /** `row` (the default) gives each row its own scale; `shared` puts every row on one, for measures in the same unit. */
  @property({ type: String }) scale: 'row' | 'shared' = 'row'

  /** Which end of the scale is good: `higher` (the default), or `lower`, which turns the band colours round so the good band sits near zero. */
  @property({ type: String }) better: BulletBetter = 'higher'

  /** Row field holding each row's bar colour. */
  @property({ type: String, attribute: 'color-field' }) colorField = ''

  /** `horizontal` (the default) stacks the rows; `vertical` sets them side by side as columns. */
  @property({ type: String }) orientation: 'horizontal' | 'vertical' = 'horizontal'

  /** Whether each row's name and description are drawn: `start` (the default) before the bands, or `none`. */
  @property({ type: String }) labels: 'start' | 'none' = 'start'

  /** Whether each row's value is printed: `end` (the default) after the bands, or `none`. */
  @property({ type: String, attribute: 'value-labels' }) valueLabels: 'end' | 'none' = 'end'

  /** Whether each row draws its own tick axis: `row` (the default), or `none`. */
  @property({ type: String }) axis: 'row' | 'none' = 'row'

  /** Text appended to the values, targets and band ranges, such as `%`. */
  @property({ type: String, attribute: 'value-suffix' }) valueSuffix = ''

  /** Maximum number of decimal places in the values. Unset, up to two. */
  @property({ type: Number }) precision?: number

  /**
   * Formats the values, targets and band ranges in the labels, the tooltip, the table and the announcement, from the
   * value and its row: each row in its own unit. Falls back to `value-suffix` and `precision`. Property only.
   */
  @property({ attribute: false }) format?: (value: number, row: BulletRow) => string

  private readonly msg = new LocalizeController(this, bulletMessages, () => this.locale)

  /** The row the keyboard focus is on, or `-1`. Not reactive: moving it shows the tooltip and emphasises the row through the engine. */
  #focused = -1

  #rows?: { frame: ChartFrame; revision: number; length: number; data: unknown; key: string; rows: BulletRow[] }
  #style?: BulletStyle
  #layout?: Layout
  #rowCount = 0

  constructor() {
    super()
    this.tooltip = 'item'
    this.legend = 'none'
  }

  // ----------------------------------------------------------- public API ---

  /** The bullets, in data order, with their scale, bands, the band the value falls in and the share of the target. */
  get rows(): BulletRow[] {
    return this.#computeRows().map((row) => ({ ...row, bands: row.bands.map((band) => ({ ...band })) }))
  }

  // ------------------------------------------------------ chart overrides ---

  protected override normalizeContext(): NormalizeContext {
    const base = super.normalizeContext()
    const extraFields = [this.targetField, this.maxField].filter((field) => field !== '')
    return { ...base, extraFields, signature: `${base.signature}|${extraFields.join(',')}` }
  }

  protected override reshapesFrame(changed: PropertyValues): boolean {
    return super.reshapesFrame(changed) || changed.has('targetField') || changed.has('maxField')
  }

  /** No data-only fast path: the chart's height, its text list and every row's layout follow the rows. */
  protected override isDataKey(): boolean {
    return false
  }

  /**
   * An update with no property changed is a redraw request (a `lang` change from the localize controller, the row
   * count changing under `updateData()`): it renders. The base class would take it for a data-only tick and skip it,
   * leaving the table, the summary and the announcement in the old language.
   */
  protected override shouldUpdate(changed: PropertyValues): boolean {
    return changed.size === 0 || super.shouldUpdate(changed)
  }

  /** Such a redraw request also redraws the engine: the values and ticks on the canvas follow the language too. */
  #redrawEngine(): void {
    this.adapter?.setOptions(this.buildOptions(this.buildContext()), 'merge')
  }

  /** A bullet reads one series; the target and scale-end fields must not be inferred as more. */
  protected override inferredSeries(): ChartSeriesConfig[] {
    return super
      .inferredSeries()
      .filter((series) => series.field !== this.targetField && series.field !== this.maxField)
      .slice(0, 1)
  }

  protected override coordinateSystem(): Record<string, unknown> {
    return {}
  }

  protected override seriesOption(_index: number, context: ChartBuildContext): Record<string, unknown> {
    return {
      type: 'custom',
      coordinateSystem: 'none',
      animationDurationUpdate: 0,
      renderItem: (params: RenderParams, api: RenderApi) => this.renderRow(params.dataIndex, api.getWidth(), api.getHeight(), context.theme),
    }
  }

  /** One series, whatever the series list holds: a second `c2-chart-series` is not drawn. */
  protected override buildOptions(context: ChartBuildContext): unknown {
    this.#style = undefined
    this.#layout = undefined
    const options = super.buildOptions(context) as Record<string, unknown>
    const series = this.resolvedSeries[0]
    return { ...options, series: [{ name: series?.label ?? series?.field ?? 'value', ...this.seriesOption(0, context) }] }
  }

  protected override projectData(_frame: ChartFrame, _context: ChartBuildContext): unknown {
    const rows = this.#computeRows()
    this.#layout = undefined
    // `updateData()` and a data source reach the engine through here alone: the height and the table follow the rows.
    this.#renderAccessibleSummary()
    if (this.hasUpdated && rows.length !== this.#rowCount) this.requestUpdate()
    return [rows.map((row) => [row.index])]
  }

  /** Every series draws the same row: events report the one measure. */
  protected override pointAt(index: number, _seriesIndex: number): ChartPointEventDetail | undefined {
    return super.pointAt(index, 0)
  }

  /** A click highlights the row, by its label. */
  protected override highlightKeyAt(detail: { index: number; seriesIndex: number }): string | undefined {
    return this.#computeRows()[detail.index]?.label
  }

  protected override tooltipContextAt(detail: { index: number; seriesIndex: number; px: number; py: number }): BulletTooltipContext {
    const row = this.#computeRows()[detail.index]
    const base = { index: detail.index, x: detail.index, px: detail.px, py: detail.py }
    if (!row) return { ...base, formattedX: '', entries: [] }
    const series = this.resolvedSeries[0] ?? { field: 'value' }
    const theme = this.themeController.theme
    const entries: BulletTooltipEntry[] = [
      {
        kind: 'actual',
        seriesIndex: 0,
        series: { ...series, label: series.label ?? this.msg.t('actual') },
        value: row.value,
        formatted: row.value === null ? '—' : this.#format(row.value, row),
        color: this.#barColor(row, theme),
      },
    ]
    if (row.target !== null) {
      entries.push({
        kind: 'target',
        seriesIndex: 0,
        series: { field: 'target', label: this.msg.t('target') },
        value: row.target,
        formatted: this.#targetText(row),
        color: this.#readStyle().target,
      })
    }
    if (row.band >= 0 && row.bands.length > 1) {
      const band = row.bands[row.band]
      entries.push({
        kind: 'band',
        seriesIndex: 0,
        series: { field: 'band', label: this.msg.t('band') },
        value: band.to,
        formatted: this.msg.t('bandRange', this.#bandName(row, row.band), this.#range(band.from, band.to, row)),
        color: this.#bandColor(row, row.band),
      })
    }
    return { ...base, formattedX: row.label, label: row.label, entries, row: this.#copy(row) }
  }

  protected override defaultTooltip(context: BulletTooltipContext): TemplateResult {
    const { row } = context
    if (!row) return super.defaultTooltip(context)
    return html`
      <div class="tooltip-title">${row.label}${row.description ? html`<span class="bullet-tooltip-description"> · ${row.description}</span>` : nothing}</div>
      ${context.entries.map(
        (entry) => html`
          <div class="tooltip-row">
            ${
              entry.kind === 'target'
                ? html`<span class="bullet-tick-marker" style="background:${entry.color}"></span>`
                : html`<span class="tooltip-marker ${entry.kind === 'band' ? 'bullet-band-marker' : ''}" style="background:${entry.color}"></span>`
            }
            <span class="tooltip-label">${entry.series.label ?? entry.series.field}</span>
            <span class="tooltip-value">${entry.formatted}</span>
          </div>
        `,
      )}
    `
  }

  // ------------------------------------------------------------ lifecycle ---

  protected override firstUpdated(): void {
    super.firstUpdated()
    const plot = this.plotElement
    if (!plot) return
    // The plot is the chart's one tab stop. It is inside the shadow root, so nothing is written on the host.
    plot.tabIndex = 0
    plot.setAttribute('role', 'img')
    plot.addEventListener('keydown', this.#handleKeydown)
    plot.addEventListener('blur', this.#handleBlur)
  }

  protected override updated(changed: PropertyValues): void {
    super.updated(changed)
    if (changed.size === 0) this.#redrawEngine()
    this.#renderAccessibleSummary()
    const plot = this.plotElement
    const label = this.#summary()
    if (plot && plot.getAttribute('aria-label') !== label) plot.setAttribute('aria-label', label)
  }

  /**
   * The sizer that gives the chart its height, and the root the table and the live announcement are rendered into after
   * each update rather than in this template, for the reason the legend is: a server cannot see the chart's
   * `c2-chart-series` children, and hydration would keep what it rendered.
   */
  protected override render(): TemplateResult {
    // The row count is known on the server too (the rows come from the `data` attribute), so the height matches.
    this.#rowCount = this.frame?.length ?? 0
    const sizer = ['bullet-sizer', this.axis === 'none' ? 'bullet-sizer--bare' : '', this.orientation === 'vertical' ? 'bullet-sizer--vertical' : '']
    return html`${super.render()}
      <div class=${sizer.filter(Boolean).join(' ')} style="--_rows: ${Math.max(1, this.#rowCount)}" aria-hidden="true"></div>
      <div class="bullet-a11y-root"></div>`
  }

  /** The probes the chart reads its own variables through. */
  protected override renderOverlayExtras(): unknown {
    return html`<span class="bullet-probe" aria-hidden="true"
      ><i class="band-start"></i><i class="band-end"></i><i class="band-1"></i><i class="band-2"></i><i class="band-3"></i><i class="band-4"></i
      ><i class="band-5"></i><i class="target"></i><i class="description"></i><i class="row"></i><i class="row-bare"></i><i class="gap"></i
    ></span>`
  }

  // ------------------------------------------------------------- drawing ---

  /** One row as ECharts elements: the backdrop, the bands, the bar, the target, the tick axis and the text. */
  protected renderRow(index: number, width: number, height: number, theme: ChartTheme = this.themeController.theme): Record<string, unknown> | null {
    const rows = this.#computeRows()
    const row = rows[index]
    if (!row || width <= 0 || height <= 0) return null
    const style = this.#readStyle()
    const layout = this.#computeLayout(rows, width, height, theme)
    const box = layout.rows[index]
    if (!box) return null
    const horizontal = layout.horizontal
    const dimmed = this.highlighted !== null && rows.some((item) => item.label === this.highlighted) && row.label !== this.highlighted
    const opacity = dimmed ? theme.dimmedOpacity : 1
    const font = { fontFamily: style.fontFamily }
    const children: Record<string, unknown>[] = []

    // The backdrop is the row's one hit target: everything over it is silent, so the pointer moves within a row
    // without leaving it, and hover and keyboard focus light it up through the engine's emphasis.
    children.push({
      type: 'rect',
      shape: { ...box.box, r: 6 },
      style: { fill: 'rgba(0, 0, 0, 0)' },
      emphasis: { style: { fill: withAlpha(theme.color, HOVER_OPACITY) } },
    })

    // Bands, or one track across the scale when the row has none.
    const segment = (from: number, to: number) => {
      const a = box.at(from)
      const b = box.at(to)
      return horizontal
        ? { x: Math.min(a, b), y: box.cross, width: Math.abs(b - a), height: box.thickness }
        : { x: box.cross, y: Math.min(a, b), width: box.thickness, height: Math.abs(b - a) }
    }
    const bands = row.bands.length > 0 ? row.bands : [{ from: row.min, to: row.max, quality: 0 }]
    bands.forEach((band, at) => {
      if (band.from >= row.max) return
      children.push({
        type: 'rect',
        silent: true,
        shape: segment(band.from, Math.min(band.to, row.max)),
        style: { fill: row.bands.length > 0 ? this.#bandColor(row, at) : style.bandEnd, opacity },
        emphasis: STILL,
      })
    })

    // The measure, from zero (or the scale start), a third of the band height.
    if (row.value !== null) {
      const origin = Math.min(row.max, Math.max(row.min, 0))
      const shape = segment(origin, Math.min(row.max, Math.max(row.min, row.value)))
      const thickness = Math.max(2, box.thickness * BAR_SHARE)
      const bar = horizontal
        ? { ...shape, y: box.cross + (box.thickness - thickness) / 2, height: thickness }
        : { ...shape, x: box.cross + (box.thickness - thickness) / 2, width: thickness }
      const radius = theme.barRadius * thickness
      // The bar grows from the scale start on the first draw; under reduced motion the engine does not animate.
      const grown = horizontal ? { x: box.at(origin), width: 0 } : { y: box.at(origin), height: 0 }
      children.push({
        type: 'rect',
        silent: true,
        shape: { ...bar, r: radius },
        style: { fill: this.#barColor(row, theme), opacity },
        emphasis: STILL,
        enterFrom: { shape: grown },
      })
    }

    // The target: a tick across the bar, with a halo of the surface so it reads where it crosses a bar of its colour.
    if (row.target !== null && row.target >= row.min && row.target <= row.max) {
      const length = Math.max(4, box.thickness * TARGET_SHARE)
      const at = box.at(row.target)
      const tick = horizontal
        ? { x: at - style.targetWidth / 2, y: box.cross + (box.thickness - length) / 2, width: style.targetWidth, height: length }
        : { x: box.cross + (box.thickness - length) / 2, y: at - style.targetWidth / 2, width: length, height: style.targetWidth }
      children.push({
        type: 'rect',
        silent: true,
        shape: { x: tick.x - 1, y: tick.y - 1, width: tick.width + 2, height: tick.height + 2, r: 2 },
        style: { fill: theme.surface, opacity },
        emphasis: STILL,
      })
      children.push({ type: 'rect', silent: true, shape: { ...tick, r: 1 }, style: { fill: style.target, opacity }, emphasis: STILL })
    }

    // The tick axis: short marks and their values, under the bands (to their left when vertical).
    if (this.axis !== 'none') {
      for (const value of box.ticks) {
        const at = box.at(value)
        const label = this.#tick(value)
        if (horizontal) {
          const y = box.cross + box.thickness
          children.push({
            type: 'line',
            silent: true,
            shape: { x1: at, y1: y, x2: at, y2: y + TICK },
            style: { stroke: theme.axisColor, lineWidth: 1, opacity },
            emphasis: { style: { stroke: theme.axisColor } },
          })
          children.push({
            type: 'text',
            silent: true,
            style: {
              ...font,
              text: label,
              x: at,
              y: y + TICK + 2,
              fill: theme.axisColor,
              fontSize: theme.axisFontSize,
              align: 'center',
              verticalAlign: 'top',
              opacity,
            },
          })
        } else {
          const x = box.cross
          children.push({
            type: 'line',
            silent: true,
            shape: { x1: x - TICK, y1: at, x2: x, y2: at },
            style: { stroke: theme.axisColor, lineWidth: 1, opacity },
            emphasis: { style: { stroke: theme.axisColor } },
          })
          children.push({
            type: 'text',
            silent: true,
            style: {
              ...font,
              text: label,
              x: x - TICK - 3,
              y: at,
              fill: theme.axisColor,
              fontSize: theme.axisFontSize,
              align: 'right',
              verticalAlign: 'middle',
              opacity,
            },
          })
        }
      }
    }

    // The name and description, and the value.
    const named = this.labels !== 'none'
    const valued = this.valueLabels !== 'none'
    const nameStyle = { ...font, fill: theme.color, fontSize: layout.nameSize, fontWeight: style.labelWeight, opacity }
    const descriptionStyle = { ...font, fill: style.description, fontSize: theme.fontSize, opacity }
    if (horizontal) {
      const middle = box.cross + box.thickness / 2
      if (named) {
        const nameY = row.description ? middle - layout.lineHeight / 2 + 1 : middle
        // A pixel of slack: the engine measures the text again, and a name exactly as wide as the column would be cut.
        const text = { width: layout.labelWidth + 2, overflow: 'truncate', ellipsis: '…', align: 'right', verticalAlign: 'middle' }
        children.push({ type: 'text', silent: true, style: { ...nameStyle, ...text, text: row.label, x: layout.labelEdge, y: nameY } })
        if (row.description)
          children.push({
            type: 'text',
            silent: true,
            style: { ...descriptionStyle, ...text, text: row.description, x: layout.labelEdge, y: nameY + layout.lineHeight },
          })
      }
      if (valued)
        children.push({
          type: 'text',
          silent: true,
          style: { ...nameStyle, text: this.#valueText(row), x: layout.valueEdge, y: middle, align: 'left', verticalAlign: 'middle' },
        })
    } else {
      const center = box.cross + box.thickness / 2
      const room = { width: box.box.width - 4, overflow: 'truncate', ellipsis: '…', align: 'center' }
      if (valued)
        children.push({
          type: 'text',
          silent: true,
          style: { ...nameStyle, ...room, text: this.#valueText(row), x: center, y: layout.valueEdge, verticalAlign: 'middle' },
        })
      if (named) {
        children.push({ type: 'text', silent: true, style: { ...nameStyle, ...room, text: row.label, x: center, y: layout.labelEdge, verticalAlign: 'top' } })
        if (row.description)
          children.push({
            type: 'text',
            silent: true,
            style: { ...descriptionStyle, ...room, text: row.description, x: center, y: layout.labelEdge + layout.lineHeight, verticalAlign: 'top' },
          })
      }
    }
    return { type: 'group', children }
  }

  /** Where every row sits for a plot of `width` × `height`. Cached until the rows, the variables or the size change. */
  #computeLayout(rows: BulletRow[], width: number, height: number, theme: ChartTheme): Layout {
    const key = `${width}|${height}|${this.orientation}|${this.labels}|${this.valueLabels}|${this.axis}`
    if (this.#layout && this.#layout.key === key) return this.#layout
    const style = this.#readStyle()
    const count = Math.max(1, rows.length)
    const nameSize = theme.fontSize + 1
    const lineHeight = Math.round(theme.fontSize * 1.35)
    const nameFont = `${style.labelWeight} ${nameSize}px ${style.fontFamily}`
    const axisFont = `${theme.axisFontSize}px ${style.fontFamily}`
    const axis = this.axis !== 'none'
    const named = this.labels !== 'none'
    const valued = this.valueLabels !== 'none'
    const widest = (texts: string[], font: string, size: number) => Math.max(0, ...texts.map((text) => measureText(text, font, size)))
    // A row's band is never thicker than a row allows, however tall the chart is.
    const axisHeight = axis ? theme.axisFontSize + TICK + 4 : 0
    const cap = Math.max(4, style.rowHeight - axisHeight)
    const ticksFor = (row: BulletRow, length: number, spacing: number) =>
      axis ? bulletTicks(row.min, row.max, Math.max(1, Math.min(5, Math.floor(length / spacing)))) : []

    if (this.orientation === 'vertical') {
      const gap = rows.length > 1 ? style.rowGap : 0
      const pitch = (width - gap * (count - 1)) / count
      const top = valued ? lineHeight + 8 : axis ? theme.axisFontSize / 2 + 2 : 2
      const bottom = named ? lineHeight * (rows.some((row) => row.description) ? 2 : 1) + 8 : axis ? theme.axisFontSize / 2 + 2 : 2
      const start = height - bottom
      const length = Math.max(1, start - top)
      const boxes = rows.map((row, index) => {
        const ticks = ticksFor(row, length, 40)
        const axisWidth = axis
          ? widest(
              ticks.map((tick) => this.#tick(tick)),
              axisFont,
              theme.axisFontSize,
            ) +
            TICK +
            3
          : 0
        const thickness = Math.max(2, Math.min(cap, pitch - 2 * axisWidth - 4))
        const left = index * (pitch + gap)
        const cross = left + (pitch - thickness) / 2
        const at = (value: number) => start - ((Math.min(row.max, Math.max(row.min, value)) - row.min) / (row.max - row.min)) * length
        return { box: { x: left, y: 0, width: pitch, height }, cross, thickness, at, ticks }
      })
      this.#layout = { key, horizontal: false, rows: boxes, labelEdge: start + 8, labelWidth: pitch, valueEdge: top / 2 + 1, nameSize, lineHeight }
      return this.#layout
    }

    const gap = rows.length > 1 ? style.rowGap : 0
    const pitch = (height - gap * (count - 1)) / count
    const thickness = Math.max(2, Math.min(cap, pitch - axisHeight))
    const content = thickness + axisHeight
    const labelWidth = named
      ? Math.min(
          width * 0.4,
          Math.max(
            widest(
              rows.map((row) => row.label),
              nameFont,
              nameSize,
            ),
            widest(
              rows.map((row) => row.description),
              `${theme.fontSize}px ${style.fontFamily}`,
              theme.fontSize,
            ),
          ),
        )
      : 0
    const valueWidth = valued
      ? widest(
          rows.map((row) => this.#valueText(row)),
          nameFont,
          nameSize,
        )
      : 0
    // Without a column beside them, the end ticks' labels need half their width of room.
    const tickRoom = axis ? measureText('0000', axisFont, theme.axisFontSize) / 2 : 0
    const startEdge = named ? labelWidth + COLUMN_GAP : tickRoom
    const endEdge = width - (valued ? valueWidth + COLUMN_GAP : tickRoom)
    const length = Math.max(1, endEdge - startEdge)
    const boxes = rows.map((row, index) => {
      const top = index * (pitch + gap)
      const cross = top + Math.max(0, (pitch - content) / 2)
      const at = (value: number) => startEdge + ((Math.min(row.max, Math.max(row.min, value)) - row.min) / (row.max - row.min)) * length
      // The backdrop reaches halfway into the gaps, so the pointer is always over a row.
      const box = { x: 0, y: top - gap / 2, width, height: pitch + gap }
      return { box, cross, thickness, at, ticks: ticksFor(row, length, 56) }
    })
    this.#layout = { key, horizontal: true, rows: boxes, labelEdge: labelWidth, labelWidth, valueEdge: endEdge + COLUMN_GAP, nameSize, lineHeight }
    return this.#layout
  }

  /** The chart's own variables, read through its probes. Read once per option build. */
  #readStyle(): BulletStyle {
    if (this.#style) return this.#style
    const root = this.renderRoot as ParentNode | undefined
    const probe = (name: string) => root?.querySelector<HTMLElement>(`.bullet-probe .${name}`) ?? null
    const computed = (name: string) => {
      const element = probe(name)
      return element && typeof getComputedStyle === 'function' ? getComputedStyle(element) : null
    }
    const color = (name: string, fallback: string) => computed(name)?.color || fallback
    const pixels = (name: string, fallback: number) => {
      const value = parseFloat(computed(name)?.width ?? '')
      return Number.isFinite(value) && value >= 0 ? value : fallback
    }
    const override = (position: number) => {
      const value = computed(`band-${position}`)?.color
      const rgba = value ? parseColor(value) : undefined
      return value && (!rgba || rgba[3] > 0) ? value : undefined
    }
    const theme = this.themeController.theme
    const family =
      theme.fontFamily === 'inherit' ? (typeof getComputedStyle === 'function' ? getComputedStyle(this).fontFamily : '') || 'sans-serif' : theme.fontFamily
    const style: BulletStyle = {
      bandStart: color('band-start', '#d4d4d8'),
      bandEnd: color('band-end', '#f4f4f5'),
      bandOverrides: [1, 2, 3, 4, 5].map(override),
      target: color('target', theme.color),
      targetWidth: Math.max(1, pixels('target', 3)),
      description: color('description', theme.mutedColor),
      labelWeight: computed('description')?.fontWeight || '600',
      rowHeight: this.axis === 'none' ? pixels('row-bare', 24) : pixels('row', 44),
      rowGap: pixels('gap', 12),
      fontFamily: family,
    }
    // Before the first render there are no probes: keep the fallback for this build only.
    if (probe('band-start')) this.#style = style
    return style
  }

  #computeRows(): BulletRow[] {
    const frame = this.frame
    if (!frame) return []
    const key = [
      this.descriptionField,
      this.targetField,
      this.target,
      this.bandsField,
      JSON.stringify(this.bands ?? null),
      this.min,
      this.max,
      this.maxField,
      this.scale,
      this.better,
      this.colorField,
    ].join('|')
    const cached = this.#rows
    if (
      cached &&
      cached.frame === frame &&
      cached.revision === frame.revision &&
      cached.length === frame.length &&
      cached.data === this.data &&
      cached.key === key
    )
      return cached.rows
    const data = Array.isArray(this.data) ? (this.data as unknown[]) : []
    const column = frame.columns[0]
    const targets = this.targetField ? frame.extras?.[this.targetField] : undefined
    const ends = this.maxField ? frame.extras?.[this.maxField] : undefined
    const shared = bandBoundaries(this.bands)
    const finite = (value: number | undefined) => (typeof value === 'number' && Number.isFinite(value) ? value : null)
    const inputs: BulletRowInput[] = []
    for (let index = 0; index < frame.length; index += 1) {
      const raw = data[index]
      const record = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : undefined
      const read = (field: string) => (field && record ? getFieldValue(record, field) : undefined)
      const description = read(this.descriptionField)
      const color = read(this.colorField)
      inputs.push({
        label: frame.labels?.[index] ?? String(index + 1),
        description: description === undefined || description === null ? '' : String(description),
        value: column ? columnValue(column, index) : null,
        target: this.targetField ? (targets ? columnValue(targets, index) : null) : finite(this.target),
        bands: this.bandsField ? bandBoundaries(read(this.bandsField)) : shared,
        max: ends ? columnValue(ends, index) : null,
        color: typeof color === 'string' && color.trim() ? color.trim() : undefined,
      })
    }
    const rows = buildBulletRows(inputs, {
      min: finite(this.min) ?? 0,
      max: finite(this.max) ?? undefined,
      scale: this.scale === 'shared' ? 'shared' : 'row',
      better: this.better === 'lower' ? 'lower' : 'higher',
    })
    this.#rows = { frame, revision: frame.revision, length: frame.length, data: this.data, key, rows }
    return rows
  }

  /** A band's colour: its position's override, or its place on the ramp from the poor end to the good end. */
  #bandColor(row: BulletRow, at: number): string {
    const band = row.bands[at]
    const style = this.#readStyle()
    if (!band) return style.bandEnd
    const own = style.bandOverrides[band.quality]
    if (own) return own
    const count = row.bands.length
    return count > 1 ? mixColors(style.bandStart, style.bandEnd, band.quality / (count - 1)) : style.bandEnd
  }

  #barColor(row: BulletRow, theme: ChartTheme): string {
    const series = this.resolvedSeries[0]
    const fallback = series ? this.colorOf(series, 0, theme) : theme.palette[0]
    return row.color ? this.themeController.resolveColor(row.color, fallback) : fallback
  }

  /** The name of the band `at`, from `band-labels` or the default names for the row's band count. */
  #bandName(row: BulletRow, at: number): string {
    const quality = row.bands[at]?.quality ?? 0
    const authored = this.#authoredBandNames()
    if (authored.length > 0) return authored[quality] ?? authored[authored.length - 1]
    return this.msg.t(bandNameKey(quality + 1, row.bands.length))
  }

  /** `band-labels`, as a JSON array (names may hold commas) or a comma list. */
  #authoredBandNames(): string[] {
    const text = this.bandLabels.trim()
    if (!text) return []
    if (text.startsWith('[')) {
      try {
        const list: unknown = JSON.parse(text)
        if (Array.isArray(list)) return list.map((name) => String(name).trim()).filter(Boolean)
      } catch {
        // Not JSON after all: read it as a comma list.
      }
    }
    return text
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean)
  }

  // ------------------------------------------------------------ keyboard ---

  #handleKeydown = (event: KeyboardEvent): void => {
    const rows = this.#computeRows()
    if (rows.length === 0) return
    const current = this.#focused
    let next: number
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowRight':
        next = current < 0 ? 0 : Math.min(rows.length - 1, current + 1)
        break
      case 'ArrowUp':
      case 'ArrowLeft':
        next = current < 0 ? 0 : Math.max(0, current - 1)
        break
      case 'Home':
        next = 0
        break
      case 'End':
        next = rows.length - 1
        break
      case 'Enter':
      case ' ':
        if (current < 0) return
        event.preventDefault()
        this.handleEngineClick({ index: current, seriesIndex: 0 })
        return
      case 'Escape':
        if (current < 0 && this.highlighted === null) return
        event.preventDefault()
        this.#focus(-1)
        this.highlight(null)
        return
      default:
        return
    }
    event.preventDefault()
    this.#focus(next)
  }

  #handleBlur = (): void => this.#focus(-1)

  /** Moves the keyboard focus to a row: its backdrop lights up, the tooltip shows it and the live region reads it. */
  #focus(index: number): void {
    const previous = this.#focused
    this.#focused = index
    this.adapter?.dispatchAction?.({ type: 'downplay', seriesIndex: 0 })
    if (index >= 0) {
      this.adapter?.dispatchAction?.({ type: 'highlight', seriesIndex: 0, dataIndex: index })
      const { px, py } = this.#anchor(index)
      this.handleEngineHover({ index, seriesIndex: 0, px, py })
    } else if (previous >= 0) {
      this.handleEngineHover(null)
    }
    this.#renderAccessibleSummary()
  }

  /** Where the tooltip points for a focused row: the end of its bar, or its target. */
  #anchor(index: number): { px: number; py: number } {
    const rows = this.#computeRows()
    const row = rows[index]
    const { width, height } = this.buildContext()
    const layout = this.#computeLayout(rows, width, height, this.themeController.theme)
    const box = layout.rows[index]
    if (!row || !box) return { px: width / 2, py: 0 }
    const along = box.at(row.value ?? row.target ?? row.min)
    return layout.horizontal ? { px: along, py: box.cross } : { px: box.cross + box.thickness / 2, py: along }
  }

  // ----------------------------------------------------------------- text ---

  #copy(row: BulletRow): BulletRow {
    return { ...row, bands: row.bands.map((band) => ({ ...band })) }
  }

  #number(value: number): string {
    const precision = typeof this.precision === 'number' && Number.isFinite(this.precision) ? Math.max(0, Math.min(20, Math.trunc(this.precision))) : 2
    return new Intl.NumberFormat(this.msg.locale || undefined, { maximumFractionDigits: precision }).format(value)
  }

  #format(value: number, row: BulletRow): string {
    if (this.format) return this.format(value, this.#copy(row))
    const series = this.resolvedSeries[0]?.format
    return series ? series(value) : `${this.#number(value)}${this.valueSuffix}`
  }

  /** A band's range, `20–25%`: the suffix once, at the end; a custom format on both ends. */
  #range(from: number, to: number, row: BulletRow): string {
    if (this.format || this.resolvedSeries[0]?.format) return this.msg.t('range', this.#format(from, row), this.#format(to, row))
    return `${this.msg.t('range', this.#number(from), this.#number(to))}${this.valueSuffix}`
  }

  #percent(share: number): string {
    return new Intl.NumberFormat(this.msg.locale || undefined, { style: 'percent', maximumFractionDigits: 0 }).format(share)
  }

  #valueText(row: BulletRow): string {
    return row.value === null ? '—' : this.#format(row.value, row)
  }

  /** `27% · 83% reached`, or `of target` when lower is better. */
  #targetText(row: BulletRow): string {
    if (row.target === null) return ''
    const target = this.#format(row.target, row)
    if (row.attainment === null) return target
    const share = this.#percent(row.attainment)
    return `${target} · ${this.better === 'lower' ? this.msg.t('ofTarget', share) : this.msg.t('reached', share)}`
  }

  /** A tick's value: compact past a thousand, so a row's axis stays short. */
  #tick(value: number): string {
    const compact = Math.abs(value) >= 1000
    return new Intl.NumberFormat(this.msg.locale || undefined, compact ? { notation: 'compact', maximumFractionDigits: 1 } : { maximumFractionDigits: 4 }).format(value)
  }

  #summary(): string {
    const rows = this.#computeRows()
    const withTarget = rows.filter((row) => row.onTarget !== null)
    if (withTarget.length === 0) return this.msg.t('summaryNoTargets', rows.length)
    return this.msg.t('summary', rows.length, new Intl.NumberFormat(this.msg.locale || undefined).format(withTarget.filter((row) => row.onTarget).length))
  }

  #announcement(row: BulletRow): string {
    const value = row.value === null ? this.msg.t('noValue') : this.#format(row.value, row)
    const band = row.band >= 0 && row.bands.length > 1 ? this.#bandName(row, row.band) : ''
    if (row.target === null || row.attainment === null) return this.msg.t('announcementNoTarget', row.label, value, band)
    return this.msg.t('announcement', row.label, value, this.#percent(row.attainment), this.#format(row.target, row), band)
  }

  #renderAccessibleSummary(): void {
    const root = this.renderRoot?.querySelector<HTMLElement>('.bullet-a11y-root')
    if (!root) return
    const rows = this.#computeRows()
    const focused = rows[this.#focused]
    render(
      html`
        ${
          rows.length > 0
            ? html`
                <table class="bullet-a11y">
                  <caption>
                    ${this.#summary()}
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">${this.msg.t('measure')}</th>
                      <th scope="col">${this.resolvedSeries[0]?.label ?? this.msg.t('actual')}</th>
                      <th scope="col">${this.msg.t('target')}</th>
                      <th scope="col">${this.msg.t('ofTargetHeader')}</th>
                      <th scope="col">${this.msg.t('band')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${rows.map(
                      (row) => html`
                        <tr>
                          <th scope="row">${row.description ? `${row.label} (${row.description})` : row.label}</th>
                          <td>${this.#valueText(row)}</td>
                          <td>${row.target === null ? '—' : this.#format(row.target, row)}</td>
                          <td>${row.attainment === null ? '—' : this.#percent(row.attainment)}</td>
                          <td>
                            ${
                              row.band >= 0 && row.bands.length > 1
                                ? this.msg.t('bandRange', this.#bandName(row, row.band), this.#range(row.bands[row.band].from, row.bands[row.band].to, row))
                                : '—'
                            }
                          </td>
                        </tr>
                      `,
                    )}
                  </tbody>
                </table>
              `
            : nothing
        }
        <div class="bullet-a11y" aria-live="polite">${focused ? this.#announcement(focused) : nothing}</div>
      `,
      root,
      { host: this },
    )
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-bullet-chart': BulletChart
  }
}
