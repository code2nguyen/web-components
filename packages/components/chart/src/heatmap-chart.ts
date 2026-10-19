import { html, nothing, unsafeCSS, type CSSResultGroup, type PropertyValues, type TemplateResult } from 'lit'
import { state } from 'lit/decorators.js'
import { styleMap } from 'lit/directives/style-map.js'
import { property, jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import heatmapStyles from './heatmap-chart.scss?inline'
import { ChartBase, type ChartEventMap, type ChartLegendItem } from './chart-base.js'
import { EchartsChartBase } from './echarts-chart-base.js'
import type { ChartBuildContext } from './chart-adapter.js'
import type { EchartsFeature } from './engines/echarts-loader.js'
import type { NormalizeContext } from './chart-data.js'
import type { ChartInput, ChartPointEventDetail, ChartRow, ChartSeriesConfig, ChartTooltipContext } from './chart-types.js'
import type { ChartTheme } from './chart-theme.js'
import { createMapScale, parseColor, type MapScale } from './map-scale.js'
import { heatmapMessages } from './messages.js'
import {
  buildHeatmapModel,
  fillLegendBins,
  inRange,
  layoutHeatmap,
  legendBinIndex,
  niceTicks,
  type HeatmapAggregate,
  type HeatmapBin,
  type HeatmapCell,
  type HeatmapGeometry,
  type HeatmapLayout,
  type HeatmapLegendBin,
  type HeatmapModel,
  type HeatmapOrder,
  type HeatmapTimeZone,
  type HeatmapWeekStart,
  type HeatmapWeekdays,
} from './heatmap-layout.js'

export type {
  HeatmapAggregate,
  HeatmapBin,
  HeatmapCell,
  HeatmapLayout,
  HeatmapModel,
  HeatmapOrder,
  HeatmapTimeZone,
  HeatmapWeekStart,
  HeatmapWeekdays,
} from './heatmap-layout.js'

/** A cell as the events and the tooltip report it: its keys and labels, its aggregate, and the rows behind it. */
export interface HeatmapCellDetail {
  /** Column key: the `x-field` value (or its bin), a week's first day on a calendar, a weekday in a month grid. */
  x: string
  /** Row key: the `y-field` value (or its bin), or a weekday on a calendar. */
  y: string
  xLabel: string
  yLabel: string
  value: number | null
  /** How many rows were aggregated into the cell. */
  count: number
  rows: ChartRow[]
  /** The day, as `YYYY-MM-DD`, on the calendar layouts. */
  date?: string
  /** The row's `group-field` value. */
  group?: string
}

/** A marginal total, as the tooltip reports it. */
export interface HeatmapTotalDetail {
  axis: 'x' | 'y'
  key: string
  label: string
  value: number
}

/** What the tooltip slot and `renderTooltip` are handed: the shared model plus the hovered cell or total. */
export interface HeatmapTooltipContext extends ChartTooltipContext {
  cell?: HeatmapCellDetail
  total?: HeatmapTotalDetail
}

/** `[from, to)` in values; `null` leaves an end open. */
export type HeatmapScaleRange = [number | null, number | null]

/** Detail of `scale-filter-change`. */
export interface HeatmapScaleFilterChangeEventDetail {
  /** The kept range, or `null` when the filter was cleared. */
  range: HeatmapScaleRange | null
  /** Cells whose value is in the range (every cell with a value when cleared). */
  count: number
  /** Sum of those values. */
  sum: number
}

/** Events fired by `c2-heatmap-chart`, on top of every chart's. */
export interface HeatmapChartEventMap extends ChartEventMap {
  'cell-click': CustomEvent<HeatmapCellDetail>
  'cell-hover': CustomEvent<HeatmapCellDetail | null>
  'scale-filter-change': CustomEvent<HeatmapScaleFilterChangeEventDetail>
}

export interface HeatmapChart {
  addEventListener: TypedAddEventListener<HeatmapChart, HeatmapChartEventMap>
  removeEventListener: TypedRemoveEventListener<HeatmapChart, HeatmapChartEventMap>
}

/** Values read from the host's custom properties for each option build. */
interface HeatmapStyle {
  gap: number
  radius: number
  maxCellSize: number
  marginalSize: number
  groupGap: number
  dimmedOpacity: number
  labelFontSize: number
  /** Whether the axis, group and month labels are drawn: `--c2-chart__axis-label--display` is not `none`. */
  labels: boolean
  emptyColor: string
  hoverColor: string
  focusColor: string
  labelColor: string
  labelInverseColor: string
  marginalColor: string
  scaleStart: string
  scaleEnd: string
  scaleNegative: string
  scaleMid: string
}

const STYLE_FALLBACK: HeatmapStyle = {
  gap: 2,
  radius: 2,
  maxCellSize: 24,
  marginalSize: 40,
  groupGap: 12,
  dimmedOpacity: 0.15,
  labelFontSize: 11,
  labels: true,
  emptyColor: '#f4f4f5',
  hoverColor: '#18181b',
  focusColor: '#0265dc',
  labelColor: '#18181b',
  labelInverseColor: '#ffffff',
  marginalColor: '#a1a1aa',
  scaleStart: '#dce8fb',
  scaleEnd: '#0a3b8c',
  scaleNegative: '#c2410c',
  scaleMid: '#e4e4e7',
}

/** Engine series order. The labels are drawn first and never answer the pointer. */
const CHROME_SERIES = 0
const CELL_SERIES = 1
const TOTAL_SERIES = 2

/** Slices of a continuous scale's key: fine enough to show the distribution, coarse enough to hover. */
const CONTINUOUS_BINS = 20

/** The subset of ECharts' `renderItem` arguments this chart uses. */
interface RenderParams {
  dataIndex: number
}
interface RenderApi {
  getWidth(): number
  getHeight(): number
}

/** Everything a draw reads, refreshed with each option or data build so `renderItem` does no work per cell. */
interface DrawState {
  model: HeatmapModel
  scale?: MapScale
  style: HeatmapStyle
  theme: ChartTheme
  /** The range cells are dimmed outside of: the previewed band, else the kept filter. */
  active: HeatmapScaleRange | null
}

/** The colour key, computed from the scale and the cell values. */
interface ScaleKey {
  title: string
  stepped: boolean
  bins: HeatmapLegendBin[]
  /** Domain ends of a continuous scale. */
  min: number
  max: number
  clampLow: boolean
  clampHigh: boolean
  ticks: { at: number; text: string }[]
}

/** `unit_price` -> `Unit price`. */
function humanize(field: string): string {
  const last = field.split('.').pop() ?? field
  const spaced = last.replace(/[_-]+/g, ' ').replace(/([a-z\d])([A-Z])/g, '$1 $2')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

/** An order as an attribute: a keyword, or a JSON list of keys. */
const orderConverter = {
  fromAttribute(value: string | null): HeatmapOrder | undefined {
    if (value === null) return undefined
    const text = value.trim()
    if (!text.startsWith('[')) return text
    try {
      const parsed: unknown = JSON.parse(text)
      return Array.isArray(parsed) ? parsed.map(String) : text
    } catch {
      return text
    }
  },
  toAttribute(value: HeatmapOrder | undefined): string | null {
    if (value === undefined) return null
    return typeof value === 'string' ? value : JSON.stringify(value)
  },
}

/** Relative luminance of a colour, 0–1, or `undefined` when it cannot be parsed. */
function luminance(color: string): number | undefined {
  const rgba = parseColor(color)
  if (!rgba) return undefined
  const [r, g, b] = rgba.slice(0, 3).map((channel) => {
    const value = channel / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

let measureContext: CanvasRenderingContext2D | null | undefined

/** Width of `text` in `font`, measured on a canvas; an estimate where there is none. */
function measureText(text: string, font: string, size: number): number {
  if (measureContext === undefined) measureContext = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d')
  if (!measureContext) return text.length * size * 0.6
  measureContext.font = font
  return measureContext.measureText(text).width
}

/**
 * A heatmap drawn by ECharts: rows binned into cells by two keys, aggregated, and coloured by a sequential, diverging
 * or stepped scale. A calendar is one way to derive the keys, from a date; any two fields — currency × currency,
 * pair × tenor, hour × weekday — are others.
 *
 * ```html
 * <c2-heatmap-chart x-field="tenor" x-order="tenor" y-field="pair" value-field="vol" unit="%"
 *   data='[{ "pair": "EURUSD", "tenor": "1M", "vol": 7.1 }, { "pair": "EURUSD", "tenor": "1W", "vol": 7.4 }]'>
 * </c2-heatmap-chart>
 * ```
 *
 * - **`layout="grid"`** (the default) has a column per `x-field` value and a row per `y-field` value. `x-bin` and
 *   `y-bin` derive a key from a date instead (`x-bin="hour"` `y-bin="weekday"` reads one timestamp twice), and
 *   `x-order`/`y-order` order the axes: by data, naturally, by maturity (`tenor`), by total, or as an explicit list.
 *   `group-field` bands the rows, `diagonal="hide"` blanks a matrix's x = y cells and `marginals` adds total bars.
 * - **`layout="calendar"`** takes `date-field` and draws a column per week and a row per weekday, labelled by month;
 *   `weekdays="mon-fri"` drops weekends, as trading days do. Days in `range` without rows are drawn empty.
 * - **`layout="calendar-month"`** draws one month grid per month, with day numbers when there is room.
 *
 * Rows that share a cell are combined by `aggregate`. The colour scale is the one `c2-map-chart` uses: `scale`,
 * `domain`, `thresholds` and `scale-colors` work the same way.
 *
 * The legend is the colour key. By default (`legend-detail="histogram"`) it counts the cells in each band, names
 * both ends (`scale-poles`), marks the hovered cell's value, and filters the cells: hover a band to preview it, click
 * to keep it, drag across a continuous scale for a range. `legend-detail="simple"` keeps the bar and its ticks only.
 * `legend` places the key above, below, or beside the plot (`start`, `end`), where it stands upright; `legend="none"` hides it.
 * Each line of text in the key can be hidden through its `--c2-chart__scale-key-…--display` variable, and
 * `--c2-chart__axis-label--display: none` leaves only the cells.
 * `scale-filter` holds the kept range and can be set by the application.
 *
 * The plot is one tab stop: the arrow keys move from cell to cell, Enter fires `cell-click` and Escape leaves.
 *
 * @tag c2-heatmap-chart
 *
 * @event {CustomEvent<HeatmapCellDetail>} cell-click - Fired when a cell is clicked, or chosen with Enter. `detail.rows` are the rows behind it. Does not bubble.
 * @event {CustomEvent<HeatmapCellDetail | null>} cell-hover - Fired as the pointer or the keyboard focus moves onto a cell, and with a `null` detail when it leaves. Does not bubble.
 * @event {CustomEvent<HeatmapScaleFilterChangeEventDetail>} scale-filter-change - Fired when the reader keeps or clears a range from the colour key. `detail.range` is `[from, to)` (an open end is `null`), or `null` once cleared. Does not bubble.
 *
 * @csspart scale-key - The colour key in the built-in legend.
 * @csspart scale-band - One band of a stepped colour key, a button when the key filters.
 *
 * @cssproperty {pixel} [--c2-chart__cell--gap=2px] - Space between two cells.
 * @cssproperty {pixel} [--c2-chart__cell--border-radius=2px] - Corner radius of a cell.
 * @cssproperty {pixel} [--c2-chart__cell--max-size=24px] - Largest side of a calendar cell, and half the largest width of a month grid's cell, so a short span is not drawn with huge squares.
 * @cssproperty {color} [--c2-chart__cell__empty--background-color=#f4f4f5] - Fill of a cell without data: a day in the range with no rows, a pair with no quote.
 * @cssproperty {color} [--c2-chart__cell__hover--border-color=#18181b] - Outline of the hovered cell.
 * @cssproperty {color} [--c2-chart__cell__focus--border-color=#0265dc] - Outline of the cell the keyboard focus is on.
 * @cssproperty {opacity} [--c2-chart__cell__dimmed--opacity=0.15] - Opacity of the cells outside the range previewed or kept from the colour key.
 * @cssproperty {color} [--c2-chart__cell-label--color=#18181b] - Colour of a cell's value on a light cell.
 * @cssproperty {color} [--c2-chart__cell-label__inverse--color=#ffffff] - Colour of a cell's value on a dark cell.
 * @cssproperty {font-size} [--c2-chart__cell-label--font-size=11px] - Font size of the values written in the cells and of a month grid's day numbers.
 * @cssproperty {pixel} [--c2-chart__group--gap=12px] - Space between two row groups.
 * @cssproperty {pixel} [--c2-chart__marginal--size=40px] - Depth of the band the marginal total bars are drawn in.
 * @cssproperty {color} [--c2-chart__marginal--color=#a1a1aa] - Colour of the marginal total bars.
 * @cssproperty {color} [--c2-chart__scale-start--color=#dce8fb] - Low end of a sequential scale.
 * @cssproperty {color} [--c2-chart__scale-end--color=#0a3b8c] - High end of a sequential scale, and positive end of a diverging one.
 * @cssproperty {color} [--c2-chart__scale-negative--color=#c2410c] - Negative end of a diverging scale.
 * @cssproperty {color} [--c2-chart__scale-mid--color=#e4e4e7] - Neutral midpoint of a diverging scale.
 * @cssproperty {string} [--c2-chart__axis-label--display=block] - `none` draws the cells alone: no row, column, group or month labels, and no room kept for them.
 * @cssproperty {string} [--c2-chart__scale-key-title--display=inline] - `none` hides the colour key's title.
 * @cssproperty {string} [--c2-chart__scale-key-readout--display=inline] - `none` hides the line under the key's title: the count, the range, the total and the hovered cell's value.
 * @cssproperty {string} [--c2-chart__scale-key-total--display=inline] - `none` hides the total in the readout, for values that do not add up to anything meaningful.
 * @cssproperty {string} [--c2-chart__scale-key-hint--display=inline] - `none` hides the line saying how to preview and keep a band. It is always hidden beside the plot.
 * @cssproperty {string} [--c2-chart__scale-key-poles--display=flex] - `none` hides the names of the scale's two ends.
 * @cssproperty {length} [--c2-chart__scale-key--width=280px] - Width of the colour key.
 * @cssproperty {length} [--c2-chart__scale-key--height=200px] - Length of the colour key when it stands beside the plot (`legend="start"` or `"end"`), where it runs from bottom to top.
 * @cssproperty {pixel} [--c2-chart__scale-key-histogram--height=28px] - Height of the distribution bars above the colour key, and their width beside a vertical key.
 * @cssproperty {color} [--c2-chart__scale-key-histogram--color=#a1a1aa] - Colour of the distribution bars.
 * @cssproperty {color} [--c2-chart__scale-key-marker--color=#18181b] - Colour of the hovered value's marker and of the kept range's outline on the colour key.
 * @cssproperty {outline} [--c2-chart__plot__focus--outline=2px solid rgba(2, 101, 220, 0.4)] - Focus ring of the plot when it is reached with the keyboard.
 */
@customElement('c2-heatmap-chart')
export class HeatmapChart extends EchartsChartBase {
  static override styles: CSSResultGroup = [ChartBase.styles, unsafeCSS(heatmapStyles)]

  protected override readonly features: readonly EchartsFeature[] = ['custom']

  /** Where the cells go: two category axes, a column per week, or a grid per month. */
  @property({ type: String }) layout: HeatmapLayout = 'grid'

  /** Row field holding the row key of `layout="grid"`. The column key is `x-field`. */
  @property({ type: String, attribute: 'y-field' }) yField = ''

  /** Row field holding the value cells are coloured by. Without it, `aggregate="count"` counts rows. */
  @property({ type: String, attribute: 'value-field' }) valueField = ''

  /** Names the value in the tooltip and the colour key. Defaults to the humanized `value-field`. */
  @property({ type: String, attribute: 'value-label' }) valueLabel = ''

  /** Text appended to every formatted value, such as `%` or ` bp`. */
  @property({ type: String }) unit = ''

  /** Formats a value for the cells, the tooltip and the colour key. Property only; `unit` is not appended to its result. */
  @property({ attribute: false }) format?: (value: number) => string

  /** Row field holding the date of the calendar layouts. */
  @property({ type: String, attribute: 'date-field' }) dateField = ''

  /** Derives the column key from a date in `x-field`: `hour`, `weekday`, `day`, `week`, `month`, `quarter` or `year`. */
  @property({ type: String, attribute: 'x-bin' }) xBin: HeatmapBin | '' = ''

  /** Derives the row key from a date in `y-field`, as `x-bin` does the column key. */
  @property({ type: String, attribute: 'y-bin' }) yBin: HeatmapBin | '' = ''

  /**
   * Column order: `data` (first appearance), `natural` or `natural-desc`, `tenor` (ON, TN, 1W … 30Y), `value-asc`, `value-desc`, or a JSON
   * list of keys, which also adds listed columns without rows. Defaults to `natural` for a binned key, `data` otherwise.
   */
  @property({ converter: orderConverter, attribute: 'x-order' }) xOrder?: HeatmapOrder

  /** Row order, as `x-order`; `x` mirrors the columns, for a matrix. */
  @property({ converter: orderConverter, attribute: 'y-order' }) yOrder?: HeatmapOrder

  /** How the rows sharing a cell combine: `sum`, `mean`, `count`, `min`, `max`, `first` or `last`. */
  @property({ type: String }) aggregate: HeatmapAggregate = 'sum'

  /** Row field that bands the rows into labelled groups (region, desk, asset class). `layout="grid"` only. */
  @property({ type: String, attribute: 'group-field' }) groupField = ''

  /** Group order, as `x-order`. */
  @property({ converter: orderConverter, attribute: 'group-order' }) groupOrder?: HeatmapOrder

  /** `hide` blanks the cells whose column and row keys are equal, as a currency cross matrix does. */
  @property({ type: String }) diagonal: 'show' | 'hide' = 'show'

  /** Bars with each column's total along the top, each row's along the end, or both. */
  @property({ type: String }) marginals: 'none' | 'top' | 'end' | 'both' = 'none'

  /** Which values are written in the cells: `auto` where they fit, `always`, or `none`. */
  @property({ type: String, attribute: 'cell-labels' }) cellLabels: 'none' | 'auto' | 'always' = 'auto'

  /**
   * The calendar span: a year (`2026`), months (`2026-08/2026-10`) or days (`2025-10-20/2026-10-19`). Days in it without
   * rows are drawn empty. Defaults to the data's first and last day.
   */
  @property({ type: String }) range = ''

  /** `mon-fri` drops Saturday and Sunday from the calendar layouts. */
  @property({ type: String }) weekdays: HeatmapWeekdays = 'all'

  /** The first day of the calendar's weeks. */
  @property({ type: String, attribute: 'week-start' }) weekStart: HeatmapWeekStart = 'monday'

  /** The time zone a timestamp's day and hour are read in. A plain `YYYY-MM-DD` date is that day in either. */
  @property({ type: String, attribute: 'time-zone' }) timeZone: HeatmapTimeZone = 'local'

  /** `sequential` shades from light to dark; `diverging` runs two hues out from a neutral midpoint. */
  @property({ type: String }) scale: 'sequential' | 'diverging' = 'sequential'

  /** The values the scale's ends sit at: `[min, max]`, or `[min, mid, max]` for a diverging scale. Defaults to the data's extent, symmetric around `0` when diverging. */
  @property({ converter: jsonPropertyConverter }) domain?: number[]

  /** Class breaks, such as `[-50, -10, 10, 50]`, which turn the scale into stepped classes. A value equal to a break is in the upper class. */
  @property({ converter: jsonPropertyConverter }) thresholds?: number[]

  /** One colour per class of a stepped scale, overriding the ramp. */
  @property({ converter: jsonPropertyConverter, attribute: 'scale-colors' }) scaleColors?: string[]

  /** What the two ends of the scale mean, written under the colour key: `["loss", "gain"]`. */
  @property({ converter: jsonPropertyConverter, attribute: 'scale-poles' }) scalePoles?: string[]

  /** `histogram` adds the distribution bars and the readout to the colour key; `simple` keeps the bar and its ticks. */
  @property({ type: String, attribute: 'legend-detail' }) legendDetail: 'histogram' | 'simple' = 'histogram'

  /** What the colour key does: `filter` previews a band on hover and keeps it on click, `preview` only previews, `none` nothing. */
  @property({ type: String, attribute: 'legend-interaction' }) legendInteraction: 'filter' | 'preview' | 'none' = 'filter'

  /** The kept range, `[from, to)` in values with `null` for an open end; cells outside it are dimmed. */
  @property({ converter: jsonPropertyConverter, attribute: 'scale-filter' }) scaleFilter?: HeatmapScaleRange | null

  /** Bumped on every data change: the cells are options as much as data, so data rebuilds them. */
  @state() private dataRevision = 0

  /** The band range of the colour key under the pointer or the keyboard, as bin indices. */
  @state() private previewBins: [number, number] | null = null

  /** The cell the keyboard focus is on, by model index. */
  @state() private focusedCell: number | null = null

  private readonly msg = new LocalizeController(this, heatmapMessages, () => this.locale)

  #modelCache?: { key: string; data: unknown; model: HeatmapModel }
  #modelVersion = 0
  #draw?: DrawState
  #geometry?: { key: string; geometry: HeatmapGeometry }
  #drag: number | null = null
  #keyFocus = -1

  constructor() {
    super()
    this.tooltip = 'item'
  }

  // ----------------------------------------------------------- public API ---

  /** The cells with rows, in draw order, for a table view or an export. */
  get cells(): HeatmapCellDetail[] {
    const model = this.#model()
    return model.cells.filter((cell) => cell.count > 0).map((cell) => this.#detail(model, cell))
  }

  // ------------------------------------------------------ chart overrides ---

  /**
   * Replaces the data. A heatmap is not a streaming chart: new rows reshape its axes and its colour key, so this goes
   * through the normal update rather than the base's engine-only path.
   */
  override updateData(next: ChartInput): void {
    this.data = next
  }

  /** The value series, as the tooltip names it. The frame only tells the base whether there are rows. */
  override get resolvedSeries(): ChartSeriesConfig[] {
    const field = this.valueField || '__count'
    return [{ field, label: this.#valueLabel(), format: this.format }]
  }

  protected override normalizeContext(): NormalizeContext {
    const series = this.resolvedSeries
    // Keys are categories, not x values: the frame reads rows by index.
    return { xField: '', labelField: '', series, signature: `heatmap|${series[0].field}` }
  }

  protected override reshapesFrame(changed: PropertyValues): boolean {
    return super.reshapesFrame(changed) || changed.has('valueField')
  }

  /** The base fast path pushes data straight to the engine; a heatmap's data also reshapes its axes and its key. */
  protected override shouldUpdate(changed: PropertyValues): boolean {
    if (changed.has('data') || changed.has('revision')) return true
    return super.shouldUpdate(changed)
  }

  protected override willUpdate(changed: PropertyValues): void {
    // Set before the base reads `changed`, so the data change counts as a presentation change too.
    if (changed.has('data') || changed.has('revision')) this.dataRevision += 1
    // A different scale or data makes the previewed bins meaningless.
    if (changed.has('dataRevision') || changed.has('thresholds') || changed.has('domain') || changed.has('scale')) this.previewBins = null
    if (changed.has('dataRevision') || changed.has('layout')) this.focusedCell = null
    super.willUpdate(changed)
  }

  protected override replacesOptions(changed: PropertyValues): boolean {
    return changed.has('layout') || changed.has('marginals')
  }

  protected override validationError(): string {
    if (this.layout === 'grid' && (!this.xField || !this.yField)) return 'A heatmap grid needs x-field and y-field.'
    if (this.layout !== 'grid' && !this.dateField) return 'A calendar heatmap needs date-field.'
    return ''
  }

  /** There is no series to list: the legend is the colour key. */
  protected override legendItems(): ChartLegendItem[] {
    return []
  }

  protected override coordinateSystem(): Record<string, unknown> {
    return {}
  }

  protected override seriesOption(): Record<string, unknown> {
    return {}
  }

  protected override buildOptions(context: ChartBuildContext): unknown {
    const options = super.buildOptions(context) as Record<string, unknown>
    this.#prepare(context.theme)
    const common = { type: 'custom', coordinateSystem: 'none', animationDurationUpdate: 0 }
    return {
      ...options,
      series: [
        { ...common, name: 'labels', silent: true, z: 1, renderItem: this.#renderChromeItem },
        { ...common, name: 'cells', z: 2, renderItem: this.#renderCellItem },
        { ...common, name: 'totals', z: 2, renderItem: this.#renderTotalItem },
      ],
    }
  }

  /** One datum for the labels, one per cell, and one per column total then row total when marginals are drawn. */
  protected override projectData(): unknown {
    const draw = this.#prepare(this.themeController.theme)
    const { model } = draw
    const totals = this.marginals === 'none' ? [] : [...model.xTotals.map((_, index) => [0, index]), ...model.yTotals.map((_, index) => [1, index])]
    return [[[0]], model.cells.map((_, index) => [index]), totals]
  }

  // The same functions on every option build: a new `renderItem` makes ECharts replace the series' elements.
  #renderChromeItem = (_params: RenderParams, api: RenderApi): unknown => this.#renderChrome(api)
  #renderCellItem = (params: RenderParams, api: RenderApi): unknown => this.#renderCell(params.dataIndex, api)
  #renderTotalItem = (params: RenderParams, api: RenderApi): unknown => this.#renderTotal(params.dataIndex, api)

  // ------------------------------------------------------------- model ---

  #valueLabel(): string {
    if (this.valueLabel) return this.valueLabel
    if (this.valueField) return humanize(this.valueField)
    return this.msg.t('value')
  }

  #locale(): string | undefined {
    return this.msg.locale || undefined
  }

  #model(): HeatmapModel {
    const rows = Array.isArray(this.data) ? (this.data as unknown[]) : []
    const options = {
      layout: this.layout,
      xField: this.xField,
      yField: this.yField,
      valueField: this.valueField,
      dateField: this.dateField,
      groupField: this.groupField,
      xBin: this.xBin,
      yBin: this.yBin,
      xOrder: this.xOrder,
      yOrder: this.yOrder,
      groupOrder: this.groupOrder,
      aggregate: this.aggregate,
      diagonal: this.diagonal,
      range: this.range,
      weekdays: this.weekdays,
      weekStart: this.weekStart,
      timeZone: this.timeZone,
      locale: this.#locale(),
    }
    const key = `${this.dataRevision}|${JSON.stringify(options)}`
    if (this.#modelCache?.key === key && this.#modelCache.data === this.data) return this.#modelCache.model
    const model = buildHeatmapModel(rows, options)
    this.#modelVersion += 1
    this.#modelCache = { key, data: this.data, model }
    return model
  }

  /** The scale cells are coloured with, or `undefined` when no cell has a value. */
  #scale(model: HeatmapModel, style: HeatmapStyle): MapScale | undefined {
    if (model.values.length === 0) return undefined
    const diverging = this.scale === 'diverging'
    return createMapScale(
      {
        kind: this.scale,
        domain: this.domain ?? [],
        thresholds: this.thresholds,
        colors: this.scaleColors,
        start: diverging ? style.scaleNegative : style.scaleStart,
        end: style.scaleEnd,
        mid: style.scaleMid,
      },
      model.values,
    )
  }

  #prepare(theme: ChartTheme): DrawState {
    const model = this.#model()
    const style = this.#readStyle()
    const scale = this.#scale(model, style)
    this.#draw = { model, scale, style, theme, active: this.#activeRange(model, scale) }
    return this.#draw
  }

  /** The range the cells are dimmed outside of: the previewed band, else the kept filter. */
  #activeRange(model: HeatmapModel, scale: MapScale | undefined): HeatmapScaleRange | null {
    if (this.previewBins) {
      const key = this.#scaleKey(model, scale)
      if (key) return this.#binRange(key, this.previewBins)
    }
    const filter = this.scaleFilter
    return Array.isArray(filter) && filter.length === 2 ? [filter[0] ?? null, filter[1] ?? null] : null
  }

  /** The value range of bins `a` to `b`, open at the key's ends so a value past the scale still counts. */
  #binRange(key: ScaleKey, [a, b]: [number, number]): HeatmapScaleRange {
    const low = Math.min(a, b)
    const high = Math.max(a, b)
    const from = low === 0 ? null : key.bins[low].from
    const to = high === key.bins.length - 1 ? null : key.bins[high].to
    return [Number.isFinite(from) ? from : null, Number.isFinite(to) ? to : null]
  }

  #detail(model: HeatmapModel, cell: HeatmapCell): HeatmapCellDetail {
    const rows = Array.isArray(this.data) ? (this.data as unknown[]) : []
    const xLabel = model.layout === 'grid' ? (model.xs[cell.xIndex]?.label ?? cell.x) : (cell.date ?? cell.x)
    const yLabel =
      model.layout === 'grid'
        ? (model.ys[cell.yIndex]?.label ?? cell.y)
        : ((model.layout === 'calendar' ? model.ys[cell.yIndex]?.label : model.xs[cell.xIndex]?.label) ?? cell.y)
    const group = model.layout === 'grid' ? model.ys[cell.yIndex]?.group : undefined
    return {
      x: cell.x,
      y: cell.y,
      xLabel,
      yLabel,
      value: cell.value,
      count: cell.count,
      rows: cell.rows.map((index) => rows[index] as ChartRow),
      ...(cell.date ? { date: cell.date } : {}),
      ...(group !== undefined ? { group } : {}),
    }
  }

  // --------------------------------------------------------------- style ---

  /** A colour variable resolved through a hidden probe, as the chart theme does. */
  #probeColor(name: string, fallback: string): string {
    const probe = this.renderRoot?.querySelector<HTMLElement>(`.heat-probe--${name}`)
    const color = probe && typeof getComputedStyle === 'function' ? getComputedStyle(probe).color : ''
    return color || fallback
  }

  #readStyle(): HeatmapStyle {
    if (typeof getComputedStyle !== 'function') return STYLE_FALLBACK
    const style = getComputedStyle(this)
    const read = (name: string, fallback: number): number => {
      const value = parseFloat(style.getPropertyValue(name))
      return Number.isFinite(value) ? value : fallback
    }
    const fallback = STYLE_FALLBACK
    return {
      gap: Math.max(0, read('--c2-chart__cell--gap', fallback.gap)),
      radius: Math.max(0, read('--c2-chart__cell--border-radius', fallback.radius)),
      maxCellSize: Math.max(4, read('--c2-chart__cell--max-size', fallback.maxCellSize)),
      marginalSize: Math.max(8, read('--c2-chart__marginal--size', fallback.marginalSize)),
      groupGap: Math.max(0, read('--c2-chart__group--gap', fallback.groupGap)),
      dimmedOpacity: read('--c2-chart__cell__dimmed--opacity', fallback.dimmedOpacity),
      labelFontSize: read('--c2-chart__cell-label--font-size', fallback.labelFontSize),
      labels: style.getPropertyValue('--c2-chart__axis-label--display').trim() !== 'none',
      emptyColor: this.#probeColor('empty', fallback.emptyColor),
      hoverColor: this.#probeColor('hover', fallback.hoverColor),
      focusColor: this.#probeColor('focus', fallback.focusColor),
      labelColor: this.#probeColor('label', fallback.labelColor),
      labelInverseColor: this.#probeColor('label-inverse', fallback.labelInverseColor),
      marginalColor: this.#probeColor('marginal', fallback.marginalColor),
      scaleStart: this.#probeColor('scale-start', fallback.scaleStart),
      scaleEnd: this.#probeColor('scale-end', fallback.scaleEnd),
      scaleNegative: this.#probeColor('scale-negative', fallback.scaleNegative),
      scaleMid: this.#probeColor('scale-mid', fallback.scaleMid),
    }
  }

  #fontFamily(theme: ChartTheme): string {
    return theme.fontFamily === 'inherit' ? (typeof getComputedStyle === 'function' ? getComputedStyle(this).fontFamily : '') || 'sans-serif' : theme.fontFamily
  }

  // ------------------------------------------------------------ geometry ---

  #geometryFor(width: number, height: number): HeatmapGeometry | undefined {
    const draw = this.#draw
    if (!draw) return undefined
    const { model, style, theme } = draw
    const fontFamily = this.#fontFamily(theme)
    const key = `${width}x${height}|${this.#modelVersion}|${this.marginals}|${JSON.stringify(style)}|${theme.axisFontSize}|${fontFamily}`
    if (this.#geometry?.key === key) return this.#geometry.geometry
    const font = `${theme.axisFontSize}px ${fontFamily}`
    const geometry = layoutHeatmap(model, width, height, {
      measure: (text) => measureText(text, font, theme.axisFontSize),
      fontSize: theme.axisFontSize,
      gap: style.gap,
      maxCellSize: style.maxCellSize,
      marginalSize: style.marginalSize,
      groupGap: style.groupGap,
      marginals: this.marginals,
      labels: style.labels,
    })
    this.#geometry = { key, geometry }
    return geometry
  }

  /** The last drawn geometry, for placing the tooltip of a cell reached with the keyboard. */
  #lastGeometry(): HeatmapGeometry | undefined {
    const plot = this.plotElement
    return plot ? this.#geometryFor(plot.clientWidth, plot.clientHeight) : this.#geometry?.geometry
  }

  // ------------------------------------------------------------- drawing ---

  /** As every chart formats a value, but a sum that rounds to zero reads `0`, never `-0`. */
  protected override formatValue(value: number): string {
    // Two decimals: anything that rounds to zero is written as zero.
    return super.formatValue(Math.abs(value) < 0.005 ? 0 : value)
  }

  #formatValue(value: number | null): string {
    if (value === null) return '—'
    return this.format?.(value) ?? `${this.formatValue(value)}${this.unit}`
  }

  /** A shorter form for the key's ticks: `100K` rather than `100,000`. */
  #formatTick(value: number): string {
    if (this.format) return this.format(value)
    if (Math.abs(value) < 10_000) return `${this.formatValue(value)}${this.unit}`
    return `${new Intl.NumberFormat(this.#locale(), { notation: 'compact', maximumFractionDigits: 1 }).format(value || 0)}${this.unit}`
  }

  #renderChrome(api: RenderApi): unknown {
    const draw = this.#draw
    const geometry = this.#geometryFor(api.getWidth(), api.getHeight())
    if (!draw || !geometry) return null
    const { theme } = draw
    const fontFamily = this.#fontFamily(theme)
    const strong = (role: string) => role === 'group' || role === 'panel'
    // An empty group would leave the previous labels on screen: ECharts keeps old children it is handed none for.
    if (geometry.texts.length === 0 && geometry.rules.length === 0) return null
    return {
      type: 'group',
      children: [
        ...geometry.rules.map((rule) => ({ type: 'line', shape: rule, style: { fill: 'none', stroke: theme.gridColor, lineWidth: 2 } })),
        ...geometry.texts.map((text) => ({
          type: 'text',
          style: {
            text: text.text,
            x: text.x,
            y: text.y,
            align: text.align,
            verticalAlign: text.baseline,
            fill: strong(text.role) ? theme.color : theme.axisColor,
            fontSize: theme.axisFontSize,
            fontWeight: strong(text.role) ? 600 : 400,
            fontFamily,
          },
        })),
      ],
    }
  }

  #renderCell(index: number, api: RenderApi): unknown {
    const draw = this.#draw
    const geometry = this.#geometryFor(api.getWidth(), api.getHeight())
    const cell = draw?.model.cells[index]
    const rect = geometry?.cells[index]
    if (!draw || !geometry || !cell || !rect) return null
    const { style, scale, theme, active } = draw
    const fill = cell.value !== null && scale ? scale.colorOf(cell.value) : style.emptyColor
    const dimmed = active !== null && (cell.value === null || !inRange(cell.value, active))
    const opacity = dimmed ? style.dimmedOpacity : 1
    const focused = this.focusedCell === index
    const radius = Math.min(style.radius, rect.width / 2, rect.height / 2)
    const children: unknown[] = [
      {
        type: 'rect',
        shape: { ...rect, r: radius },
        z2: focused ? 2 : 0,
        style: { fill, opacity, stroke: focused ? style.focusColor : 'none', lineWidth: focused ? 2 : 0 },
        // The outline is the hover; the fill stays the scale's colour, which ECharts would otherwise lighten.
        emphasis: { style: { fill, stroke: focused ? style.focusColor : style.hoverColor, lineWidth: 2 } },
      },
    ]
    const light = (luminance(fill) ?? 1) > 0.36
    const ink = light ? style.labelColor : style.labelInverseColor
    const fontFamily = this.#fontFamily(theme)
    if (cell.value !== null && this.cellLabels !== 'none') {
      const text = this.#formatValue(cell.value)
      const fits =
        this.cellLabels === 'always'
          ? rect.height >= style.labelFontSize
          : rect.height >= style.labelFontSize + 4 && measureText(text, `500 ${style.labelFontSize}px ${fontFamily}`, style.labelFontSize) + 6 <= rect.width
      // A month grid's day number takes the top-left corner, so the value goes below the middle there.
      const below = geometry.dayNumbers && cell.date !== undefined
      if (fits && (!below || rect.height >= style.labelFontSize * 2.6))
        children.push({
          type: 'text',
          silent: true,
          style: {
            text,
            x: rect.x + rect.width / 2,
            y: rect.y + rect.height * (below ? 0.62 : 0.5),
            align: 'center',
            verticalAlign: 'middle',
            fill: ink,
            opacity,
            fontSize: style.labelFontSize,
            fontWeight: 500,
            fontFamily,
          },
        })
    }
    if (geometry.dayNumbers && cell.date) {
      children.push({
        type: 'text',
        silent: true,
        style: {
          text: String(Number(cell.date.slice(8))),
          x: rect.x + 4,
          y: rect.y + 3,
          align: 'left',
          verticalAlign: 'top',
          fill: cell.value === null ? theme.mutedColor : ink,
          opacity: opacity * 0.85,
          fontSize: Math.max(8, style.labelFontSize - 1),
          fontFamily,
        },
      })
    }
    return { type: 'group', children }
  }

  #renderTotal(index: number, api: RenderApi): unknown {
    const draw = this.#draw
    const geometry = this.#geometryFor(api.getWidth(), api.getHeight())
    if (!draw || !geometry) return null
    const bar = this.#totalBar(draw.model, geometry, index)
    if (!bar) return null
    const { x, y, width, height } = bar
    return {
      type: 'rect',
      shape: { x, y, width, height, r: Math.min(2, width / 2, height / 2) },
      style: { fill: draw.style.marginalColor },
      emphasis: { style: { fill: draw.theme.color } },
    }
  }

  /** The bar a totals datum stands for: the column totals first, then the row totals. */
  #totalBar(model: HeatmapModel, geometry: HeatmapGeometry, index: number): HeatmapGeometry['bars'][number] | undefined {
    const axis = index < model.xTotals.length ? 'x' : 'y'
    const position = axis === 'x' ? index : index - model.xTotals.length
    return geometry.bars.find((bar) => bar.axis === axis && bar.index === position)
  }

  // ---------------------------------------------------------- interaction ---

  protected override tooltipContextAt(detail: { index: number; seriesIndex: number; px: number; py: number }): HeatmapTooltipContext {
    const model = this.#model()
    const theme = this.themeController.theme
    const series = this.resolvedSeries[0]
    const geometry = this.#lastGeometry()
    if (detail.seriesIndex === TOTAL_SERIES) {
      const total = this.#totalDetail(model, detail.index)
      const bar = geometry ? this.#totalBar(model, geometry, detail.index) : undefined
      return {
        index: detail.index,
        x: detail.index,
        formattedX: total ? this.msg.t('totalFor', total.label) : '',
        entries: total
          ? [
              {
                seriesIndex: TOTAL_SERIES,
                series,
                value: total.value,
                formatted: this.#formatValue(total.value),
                color: this.#draw?.style.marginalColor ?? theme.mutedColor,
              },
            ]
          : [],
        px: bar ? bar.x + bar.width / 2 : detail.px,
        py: bar ? bar.y : detail.py,
        ...(total ? { total } : {}),
      }
    }
    const cell = model.cells[detail.index]
    const rect = geometry?.cells[detail.index]
    const info = cell ? this.#detail(model, cell) : undefined
    const color = cell?.value !== null && cell ? (this.#draw?.scale?.colorOf(cell.value) ?? theme.palette[0]) : theme.mutedColor
    return {
      index: detail.index,
      x: detail.index,
      formattedX: info ? this.#cellTitle(model, info) : '',
      entries: info ? [{ seriesIndex: CELL_SERIES, series, value: info.value, formatted: this.#formatValue(info.value), color }] : [],
      px: rect ? rect.x + rect.width / 2 : detail.px,
      py: rect ? rect.y : detail.py,
      ...(info ? { cell: info } : {}),
    }
  }

  #cellTitle(model: HeatmapModel, cell: HeatmapCellDetail): string {
    if (cell.date) {
      const [year, month, day] = cell.date.split('-').map(Number)
      return new Intl.DateTimeFormat(this.#locale(), { dateStyle: 'full', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, day)))
    }
    const group = cell.group ? ` · ${cell.group}` : ''
    return model.layout === 'grid' ? `${cell.yLabel} · ${cell.xLabel}${group}` : cell.xLabel
  }

  #totalDetail(model: HeatmapModel, index: number): HeatmapTotalDetail | undefined {
    const axis = index < model.xTotals.length ? 'x' : 'y'
    const position = axis === 'x' ? index : index - model.xTotals.length
    const value = axis === 'x' ? model.xTotals[position] : model.yTotals[position]
    const category = axis === 'x' ? model.xs[position] : model.ys[position]
    if (value === null || value === undefined || !category) return undefined
    const label = model.layout === 'calendar' && axis === 'x' ? category.label : category.label
    return { axis, key: category.key, label, value }
  }

  protected override defaultTooltip(context: HeatmapTooltipContext): TemplateResult {
    const cell = context.cell
    const extra =
      cell && cell.count > 1 && this.aggregate !== 'count'
        ? html`<div class="tooltip-row"><span class="tooltip-label">${this.msg.t('rows', this.formatValue(cell.count))}</span></div>`
        : nothing
    const empty = cell && cell.value === null ? html`<div class="tooltip-row"><span class="tooltip-label">${this.msg.t('noData')}</span></div>` : nothing
    if (cell && cell.value === null)
      return html`<div class="tooltip-title">${context.formattedX}</div>
        ${empty}`
    return html`${super.defaultTooltip(context)}${extra}`
  }

  /** A cell is not a series point: `point-hover` and `point-click` stay quiet and the cell events fire instead. */
  protected override pointAt(): ChartPointEventDetail | undefined {
    return undefined
  }

  protected override handleEngineHover(detail: { index: number; seriesIndex: number; px: number; py: number } | null): void {
    if (!detail || detail.seriesIndex === CHROME_SERIES) {
      super.handleEngineHover(null)
      this.#markKey(null)
      this.dispatchEvent(new CustomEvent<HeatmapCellDetail | null>('cell-hover', { detail: null }))
      return
    }
    super.handleEngineHover(detail)
    if (detail.seriesIndex !== CELL_SERIES) {
      this.#markKey(null)
      return
    }
    const model = this.#model()
    const cell = model.cells[detail.index]
    if (!cell) return
    this.#markKey(cell.value)
    this.dispatchEvent(new CustomEvent<HeatmapCellDetail | null>('cell-hover', { detail: this.#detail(model, cell) }))
  }

  protected override handleEngineClick(detail: { index: number; seriesIndex: number }): void {
    if (detail.seriesIndex !== CELL_SERIES) return
    this.#activate(detail.index)
  }

  #activate(index: number): void {
    const model = this.#model()
    const cell = model.cells[index]
    if (cell) this.dispatchEvent(new CustomEvent<HeatmapCellDetail>('cell-click', { detail: this.#detail(model, cell) }))
  }

  // ------------------------------------------------------------- keyboard ---

  protected override firstUpdated(): void {
    super.firstUpdated()
    const plot = this.plotElement
    if (!plot) return
    // The plot is the chart's one tab stop. It is inside the shadow root, so nothing is written on the host.
    plot.tabIndex = 0
    plot.setAttribute('role', 'group')
    plot.addEventListener('keydown', this.#handleKeydown)
    plot.addEventListener('blur', this.#handleBlur)
  }

  protected override updated(changed: PropertyValues): void {
    super.updated(changed)
    const plot = this.plotElement
    if (!plot) return
    const description = this.msg.t('roleDescription')
    if (plot.getAttribute('aria-roledescription') !== description) plot.setAttribute('aria-roledescription', description)
    const label = this.#valueLabel()
    if (plot.getAttribute('aria-label') !== label) plot.setAttribute('aria-label', label)
  }

  #focus(index: number | null): void {
    this.focusedCell = index
    if (index === null) {
      this.handleEngineHover(null)
      return
    }
    const rect = this.#lastGeometry()?.cells[index]
    this.handleEngineHover({ index, seriesIndex: CELL_SERIES, px: rect ? rect.x + rect.width / 2 : 0, py: rect?.y ?? 0 })
  }

  /** The cell `dx` columns and `dy` rows away, skipping hidden positions (a blank diagonal, a dropped weekend). */
  #neighbour(model: HeatmapModel, from: HeatmapCell, dx: number, dy: number): number | undefined {
    if (model.layout === 'calendar-month' && from.date) {
      const byDate = new Map(model.cells.map((cell, index) => [cell.date, index]))
      const start = Date.parse(`${from.date}T00:00:00Z`)
      const step = dx + dy * 7
      for (let hop = 1; hop <= 7; hop += 1) {
        const date = new Date(start + step * hop * 86_400_000).toISOString().slice(0, 10)
        const found = byDate.get(date)
        if (found !== undefined) return found
        if (Math.abs(step) === 7) break
      }
      return undefined
    }
    const at = new Map(model.cells.map((cell, index) => [`${cell.xIndex}:${cell.yIndex}`, index]))
    const columns = model.xs.length
    const rows = model.ys.length
    for (let x = from.xIndex + dx, y = from.yIndex + dy; x >= 0 && y >= 0 && x < columns && y < rows; x += dx, y += dy) {
      const found = at.get(`${x}:${y}`)
      if (found !== undefined) return found
    }
    return undefined
  }

  #handleKeydown = (event: KeyboardEvent): void => {
    const model = this.#model()
    if (model.cells.length === 0) return
    const current = this.focusedCell
    const cell = current === null ? undefined : model.cells[current]
    const go = (index: number | undefined) => {
      event.preventDefault()
      if (index !== undefined) this.#focus(index)
    }
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowLeft':
      case 'ArrowDown':
      case 'ArrowUp': {
        if (!cell) return go(0)
        const dx = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
        const dy = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0
        return go(this.#neighbour(model, cell, dx, dy))
      }
      case 'Home':
      case 'End': {
        const row = cell
          ? model.cells.map((item, index) => ({ item, index })).filter(({ item }) => item.yIndex === cell.yIndex && item.panel === cell.panel)
          : []
        const pool = row.length > 0 ? row : model.cells.map((item, index) => ({ item, index }))
        return go(event.key === 'Home' ? pool[0].index : pool[pool.length - 1].index)
      }
      case 'Enter':
      case ' ':
        if (current === null) return
        event.preventDefault()
        this.#activate(current)
        return
      case 'Escape':
        if (current === null) return
        event.preventDefault()
        this.#focus(null)
        return
    }
  }

  #handleBlur = (): void => {
    if (this.focusedCell !== null) this.#focus(null)
  }

  // ------------------------------------------------------------ colour key ---

  /** The key's bands: the classes of a stepped scale, or even slices of a continuous one, with the cells counted in. */
  #scaleKey(model: HeatmapModel, scale: MapScale | undefined): ScaleKey | undefined {
    if (!scale) return undefined
    const values = model.values
    const title = this.#valueLabel()
    if (scale.steps) {
      const bins = fillLegendBins(
        scale.steps.map((step) => ({ from: step.from, to: step.to, color: step.color })),
        values,
      )
      return { title, stepped: true, bins, min: -Infinity, max: Infinity, clampLow: false, clampHigh: false, ticks: [] }
    }
    const min = scale.domain[0]
    const max = scale.domain[scale.domain.length - 1]
    const width = (max - min) / CONTINUOUS_BINS
    const bins = fillLegendBins(
      Array.from({ length: CONTINUOUS_BINS }, (_, index) => {
        // Rounded, so a band reads 1.2 rather than 1.1999999999999997.
        const from = Number((min + width * index).toPrecision(12))
        const to = index === CONTINUOUS_BINS - 1 ? max : Number((min + width * (index + 1)).toPrecision(12))
        return { from, to, color: scale.colorOf((from + to) / 2) }
      }),
      values,
    )
    const ticks = max > min ? niceTicks(min, max).map((value) => ({ at: (value - min) / (max - min), text: this.#formatTick(value) })) : []
    return {
      title,
      stepped: false,
      bins,
      min,
      max,
      clampLow: values.some((value) => value < min),
      clampHigh: values.some((value) => value > max),
      ticks,
    }
  }

  /** Where a value sits along the key, from 0 to 1. */
  #keyPosition(key: ScaleKey, value: number): number {
    if (!key.stepped) return key.max === key.min ? 0.5 : Math.min(1, Math.max(0, (value - key.min) / (key.max - key.min)))
    const index = legendBinIndex(key.bins, value)
    const bin = key.bins[index]
    const share = Number.isFinite(bin.from) && Number.isFinite(bin.to) && bin.to > bin.from ? (value - bin.from) / (bin.to - bin.from) : 0.5
    return (index + Math.min(1, Math.max(0, share))) / key.bins.length
  }

  /** Whether the key stands beside the plot (`legend="start"` or `"end"`), running from bottom to top. */
  #verticalKey(): boolean {
    return this.legend === 'start' || this.legend === 'end'
  }

  /** Places a mark at `at` (0–1) along the key: from the inline start, or up from the bottom of a vertical key. */
  #along(at: number): Record<string, string> {
    return this.#verticalKey() ? { 'inset-block-end': `${at * 100}%` } : { 'inset-inline-start': `${at * 100}%` }
  }

  #noun(count: number): string {
    const text = this.formatValue(count)
    return this.layout === 'grid' ? this.msg.t('cells', text) : this.msg.t('days', text)
  }

  /** Whether the values add up to something worth showing: a sum or a count does, a mean or a maximum does not. */
  #summable(): boolean {
    return this.aggregate === 'sum' || this.aggregate === 'count'
  }

  #rangeText(range: HeatmapScaleRange): string {
    const [from, to] = range
    const format = (value: number) => this.#formatTick(value)
    if (from === null && to === null) return ''
    if (from === null) return this.msg.t('below', format(to as number))
    if (to === null) return this.msg.t('andAbove', format(from))
    return this.msg.t('range', format(from), format(to))
  }

  /**
   * The readout under the key's title, as parts the page can hide one by one (`--c2-chart__scale-key-total--display`).
   * The total comes last, so hiding it leaves no separator behind.
   */
  #readout(model: HeatmapModel, key: ScaleKey, range: HeatmapScaleRange | null): { part: 'count' | 'range' | 'note' | 'total'; text: string }[] {
    const values = model.values
    const sum = (list: number[]) => list.reduce((total, value) => total + value, 0)
    if (!range) {
      return [
        { part: 'count' as const, text: this.#noun(values.length) },
        { part: 'range' as const, text: this.msg.t('range', this.#formatValue(Math.min(...values)), this.#formatValue(Math.max(...values))) },
        ...(key.clampLow || key.clampHigh ? [{ part: 'note' as const, text: this.msg.t('pastScale') }] : []),
        ...(this.#summable() ? [{ part: 'total' as const, text: this.msg.t('total', this.#formatValue(sum(values))) }] : []),
      ]
    }
    const kept = values.filter((value) => inRange(value, range))
    return [
      { part: 'range' as const, text: this.#rangeText(range) },
      { part: 'count' as const, text: this.msg.t('ofTotal', this.formatValue(kept.length), this.#noun(values.length)) },
      ...(this.#summable() ? [{ part: 'total' as const, text: this.msg.t('total', this.#formatValue(sum(kept))) }] : []),
    ].filter((item) => item.text)
  }

  /** Shows the hovered cell's value on the key, without an update: the marker and the readout are written directly. */
  #markKey(value: number | null): void {
    const root = this.renderRoot as ParentNode | undefined
    const marker = root?.querySelector<HTMLElement>('.scale-key__marker')
    const hover = root?.querySelector<HTMLElement>('.scale-key__hover')
    const idle = root?.querySelector<HTMLElement>('.scale-key__readout')
    const draw = this.#draw
    const key = draw ? this.#scaleKey(draw.model, draw.scale) : undefined
    if (!marker || !key || value === null) {
      if (marker) marker.hidden = true
      if (hover) hover.hidden = true
      if (idle) idle.hidden = false
      return
    }
    const at = `${this.#keyPosition(key, value) * 100}%`
    marker.style.insetInlineStart = this.#verticalKey() ? '' : at
    marker.style.insetBlockEnd = this.#verticalKey() ? at : ''
    marker.hidden = false
    if (!hover || !idle || this.previewBins) return
    const band = key.bins[legendBinIndex(key.bins, value)]
    hover.textContent = `${this.#formatValue(value)} · ${this.msg.t('inBand', this.#noun(band?.count ?? 0))}`
    hover.hidden = false
    idle.hidden = true
  }

  #setFilter(range: HeatmapScaleRange | null): void {
    this.previewBins = null
    this.scaleFilter = range
    const values = this.#model().values
    const kept = range ? values.filter((value) => inRange(value, range)) : values
    this.dispatchEvent(
      new CustomEvent<HeatmapScaleFilterChangeEventDetail>('scale-filter-change', {
        detail: { range, count: kept.length, sum: kept.reduce((sum, value) => sum + value, 0) },
      }),
    )
  }

  /** Keeps bins `a` to `b`, or clears the filter when exactly that range is already kept. */
  #keep(key: ScaleKey, bins: [number, number]): void {
    const range = this.#binRange(key, bins)
    const current = this.scaleFilter
    const same = Array.isArray(current) && (current[0] ?? null) === range[0] && (current[1] ?? null) === range[1]
    this.#setFilter(same ? null : range)
  }

  /** The bins the kept filter covers, for the pressed state of the bands. */
  #filteredBins(key: ScaleKey): Set<number> {
    const filter = this.scaleFilter
    const active = this.previewBins
    const covered = new Set<number>()
    if (active) {
      for (let index = Math.min(...active); index <= Math.max(...active); index += 1) covered.add(index)
      return covered
    }
    if (!Array.isArray(filter) || filter.length !== 2) return covered
    const from = filter[0] ?? -Infinity
    const to = filter[1] ?? Infinity
    key.bins.forEach((bin, index) => {
      if (bin.from < to && bin.to > from) covered.add(index)
    })
    return covered
  }

  #binAt(event: PointerEvent, key: ScaleKey): number {
    const track = (event.currentTarget as HTMLElement).getBoundingClientRect()
    // A vertical key runs from the bottom up, as a value axis does.
    const share = this.#verticalKey()
      ? track.height > 0
        ? (track.bottom - event.clientY) / track.height
        : 0
      : track.width > 0
        ? (event.clientX - track.left) / track.width
        : 0
    return Math.min(key.bins.length - 1, Math.max(0, Math.floor(share * key.bins.length)))
  }

  #onTrackDown(event: PointerEvent, key: ScaleKey): void {
    if (this.legendInteraction === 'none') return
    const index = this.#binAt(event, key)
    this.#drag = index
    ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
    this.previewBins = [index, index]
  }

  #onTrackMove(event: PointerEvent, key: ScaleKey): void {
    if (this.legendInteraction === 'none') return
    const index = this.#binAt(event, key)
    const next: [number, number] = this.#drag !== null ? [this.#drag, index] : [index, index]
    if (!this.previewBins || this.previewBins[0] !== next[0] || this.previewBins[1] !== next[1]) this.previewBins = next
  }

  #onTrackUp(event: PointerEvent, key: ScaleKey): void {
    if (this.#drag === null) return
    const bins: [number, number] = [this.#drag, this.#binAt(event, key)]
    this.#drag = null
    if (this.legendInteraction === 'filter') this.#keep(key, bins)
    else this.previewBins = null
  }

  #onTrackLeave(): void {
    if (this.#drag === null) this.previewBins = null
  }

  #onTrackKey(event: KeyboardEvent, key: ScaleKey): void {
    const last = key.bins.length - 1
    // Right and Up move towards the high end, whichever way the key runs.
    const up = event.key === 'ArrowRight' || event.key === 'ArrowUp'
    const down = event.key === 'ArrowLeft' || event.key === 'ArrowDown'
    if (up || down || event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      const step = up ? 1 : down ? -1 : 0
      this.#keyFocus =
        event.key === 'Home' ? 0 : event.key === 'End' ? last : this.#keyFocus < 0 ? (step > 0 ? 0 : last) : Math.min(last, Math.max(0, this.#keyFocus + step))
      // Shift extends the previewed range from where it started.
      const anchor = event.shiftKey && this.previewBins ? this.previewBins[0] : this.#keyFocus
      this.previewBins = [anchor, this.#keyFocus]
    } else if ((event.key === 'Enter' || event.key === ' ') && this.previewBins && this.legendInteraction === 'filter') {
      event.preventDefault()
      this.#keep(key, this.previewBins)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      this.previewBins = null
      this.#keyFocus = -1
      if (this.scaleFilter && this.legendInteraction === 'filter') this.#setFilter(null)
    }
  }

  #onBandClick(event: MouseEvent, key: ScaleKey, index: number): void {
    if (this.legendInteraction !== 'filter') return
    const current = this.scaleFilter
    // Shift-click extends the kept range to this band.
    if (event.shiftKey && Array.isArray(current)) {
      const covered = [...this.#filteredBinsOf(key, current)]
      if (covered.length > 0) {
        this.#keep(key, [Math.min(...covered, index), Math.max(...covered, index)])
        return
      }
    }
    this.#keep(key, [index, index])
  }

  #filteredBinsOf(key: ScaleKey, range: HeatmapScaleRange): Set<number> {
    const from = range[0] ?? -Infinity
    const to = range[1] ?? Infinity
    return new Set(key.bins.flatMap((bin, index) => (bin.from < to && bin.to > from ? [index] : [])))
  }

  /** The colour key: a stepped or continuous bar, with the distribution, ticks, ends, marker and readout. */
  protected override renderLegendExtras(): unknown {
    const model = this.#model()
    const style = this.#readStyle()
    const key = this.#scaleKey(model, this.#scale(model, style))
    if (!key) return nothing
    const histogram = this.legendDetail === 'histogram'
    const interactive = this.legendInteraction !== 'none'
    const vertical = this.#verticalKey()
    const covered = this.#filteredBins(key)
    const active = covered.size > 0
    const range = this.previewBins ? this.#binRange(key, this.previewBins) : Array.isArray(this.scaleFilter) ? (this.scaleFilter as HeatmapScaleRange) : null
    const peak = Math.max(1, ...key.bins.map((bin) => bin.count))
    const missing = model.cells.some((cell) => cell.value === null)
    const poles = this.scalePoles && this.scalePoles.length >= 2 ? this.scalePoles : undefined
    const lo = active ? Math.min(...covered) : 0
    const hi = active ? Math.max(...covered) : 0
    const bandText = (bin: HeatmapLegendBin) => this.#rangeText([Number.isFinite(bin.from) ? bin.from : null, Number.isFinite(bin.to) ? bin.to : null])

    const bars = histogram
      ? html`<span class="scale-key__histogram" aria-hidden="true">
          ${key.bins.map(
            (bin, index) =>
              html`<span
                class="scale-key__count ${active ? (covered.has(index) ? 'is-on' : 'is-off') : ''}"
                style=${styleMap({ [vertical ? 'width' : 'height']: `${bin.count > 0 ? Math.max(6, (bin.count / peak) * 100) : 0}%` })}
                >${key.stepped && bin.count > 0 ? html`<span class="scale-key__count-text">${this.formatValue(bin.count)}</span>` : nothing}</span
              >`,
          )}
        </span>`
      : nothing

    const ramp = key.stepped
      ? html`<span class="scale-key__steps">
          ${key.bins.map((bin, index) =>
            interactive
              ? html`<button
                  type="button"
                  class="scale-key__band ${covered.has(index) ? 'is-on' : ''}"
                  part="scale-band"
                  style=${styleMap({ '--band-color': bin.color })}
                  aria-pressed=${this.legendInteraction === 'filter' ? String(Boolean(this.scaleFilter) && covered.has(index)) : nothing}
                  aria-label=${this.msg.t('bandLabel', bandText(bin), this.#noun(bin.count))}
                  @pointerenter=${() => (this.previewBins = [index, index])}
                  @pointerleave=${() => (this.previewBins = null)}
                  @focus=${() => (this.previewBins = [index, index])}
                  @blur=${() => (this.previewBins = null)}
                  @click=${(event: MouseEvent) => this.#onBandClick(event, key, index)}
                ></button>`
              : html`<span class="scale-key__band" part="scale-band" style=${styleMap({ '--band-color': bin.color })}></span>`,
          )}
        </span>`
      : html`<span
          class="scale-key__gradient"
          style=${styleMap({ background: `linear-gradient(${vertical ? '0deg' : '90deg'}, ${key.bins.map((bin) => bin.color).join(', ')})` })}
          >${key.clampLow ? html`<span class="scale-key__clamp scale-key__clamp--low" style=${styleMap({ '--clamp-color': key.bins[0].color })}></span>` : nothing}${
            key.clampHigh
              ? html`<span class="scale-key__clamp scale-key__clamp--high" style=${styleMap({ '--clamp-color': key.bins[key.bins.length - 1].color })}></span>`
              : nothing
          }</span
        >`

    const ticks = key.stepped ? key.bins.slice(1).map((bin, index) => ({ at: (index + 1) / key.bins.length, text: this.#formatTick(bin.from) })) : key.ticks
    const trackHandlers = !key.stepped && interactive
    return html`
      <div class="scale-key ${histogram ? 'scale-key--histogram' : 'scale-key--simple'} ${vertical ? 'scale-key--vertical' : ''}" part="scale-key">
        <div class="scale-key__head">
          <span class="scale-key__title">${key.title}</span>
          ${
            histogram
              ? html`<span class="scale-key__status" aria-live="polite"
                  ><span class="scale-key__readout"
                    >${this.#readout(model, key, range).map(
                      (item, index) => html`<span class="scale-key__readout-${item.part}">${index > 0 ? ' · ' : ''}${item.text}</span>`,
                    )}</span
                  ><span class="scale-key__hover" hidden></span
                ></span>`
              : nothing
          }
          ${
            this.legendInteraction === 'filter' && this.scaleFilter
              ? html`<button type="button" class="scale-key__clear" @click=${() => this.#setFilter(null)}>${this.msg.t('clearFilter')}</button>`
              : nothing
          }
        </div>
        ${vertical && poles ? html`<div class="scale-key__pole">↑ ${poles[1]}</div>` : nothing}
        <div class="scale-key__body">
          <div
            class="scale-key__track ${trackHandlers ? 'scale-key__track--interactive' : ''}"
            role=${trackHandlers ? 'group' : nothing}
            tabindex=${trackHandlers ? '0' : nothing}
            aria-label=${trackHandlers ? this.msg.t('scaleLabel', key.title) : nothing}
            @pointerdown=${trackHandlers ? (event: PointerEvent) => this.#onTrackDown(event, key) : nothing}
            @pointermove=${trackHandlers ? (event: PointerEvent) => this.#onTrackMove(event, key) : nothing}
            @pointerup=${trackHandlers ? (event: PointerEvent) => this.#onTrackUp(event, key) : nothing}
            @pointerleave=${trackHandlers ? () => this.#onTrackLeave() : nothing}
            @keydown=${trackHandlers ? (event: KeyboardEvent) => this.#onTrackKey(event, key) : nothing}
            @blur=${trackHandlers ? () => (this.previewBins = null) : nothing}
          >
            ${bars} ${ramp}
            ${
              !key.stepped && active
                ? html`<span
                    class="scale-key__brush"
                    style=${styleMap({ ...this.#along(lo / key.bins.length), [vertical ? 'height' : 'width']: `${((hi - lo + 1) / key.bins.length) * 100}%` })}
                  ></span>`
                : nothing
            }
            <span class="scale-key__marker" hidden></span>
          </div>
          <div class="scale-key__ticks" aria-hidden="true">
            ${ticks.map((tick) => html`<span class="scale-key__tick" style=${styleMap(this.#along(tick.at))}>${tick.text}</span>`)}
          </div>
        </div>
        ${
          poles
            ? vertical
              ? html`<div class="scale-key__pole">↓ ${poles[0]}</div>`
              : html`<div class="scale-key__poles"><span>← ${poles[0]}</span><span>${poles[1]} →</span></div>`
            : nothing
        }
        ${
          (histogram && interactive) || missing
            ? html`<div class="scale-key__foot">
                ${histogram && interactive ? html`<span class="scale-key__hint">${key.stepped ? this.msg.t('hintStepped') : this.msg.t('hintContinuous')}</span>` : nothing}
                ${missing ? html`<span class="scale-key__no-data"><i style=${styleMap({ background: style.emptyColor })}></i>${this.msg.t('noData')}</span>` : nothing}
              </div>`
            : nothing
        }
      </div>
    `
  }

  // --------------------------------------------------------------- render ---

  /** The cells with a value as a table, for a screen reader: the canvas itself says nothing. */
  #renderDataTable(): TemplateResult | typeof nothing {
    const model = this.#model()
    const cells = model.cells.filter((cell) => cell.value !== null)
    if (cells.length === 0) return nothing
    const calendar = model.layout !== 'grid'
    return html`
      <table class="data-table">
        <thead>
          <tr>
            ${
              calendar
                ? html`<th scope="col">${this.msg.t('date')}</th>`
                : html`<th scope="col">${this.msg.t('row')}</th>
                    <th scope="col">${this.msg.t('column')}</th>`
            }
            <th scope="col">${this.#valueLabel()}</th>
          </tr>
        </thead>
        <tbody>
          ${cells.map((cell) => {
            const info = this.#detail(model, cell)
            return html`<tr>
              ${
                calendar
                  ? html`<th scope="row">${info.date}</th>`
                  : html`<th scope="row">${info.yLabel}</th>
                      <td>${info.xLabel}</td>`
              }
              <td>${this.#formatValue(cell.value)}</td>
            </tr>`
          })}
        </tbody>
      </table>
    `
  }

  #announcement(): string {
    if (this.focusedCell === null) return ''
    const model = this.#model()
    const cell = model.cells[this.focusedCell]
    if (!cell) return ''
    const info = this.#detail(model, cell)
    return this.msg.t('cellAnnouncement', this.#cellTitle(model, info), this.#formatValue(cell.value))
  }

  protected override render(): TemplateResult {
    return html`
      ${super.render()}${this.#renderDataTable()}
      <div class="data-table" aria-live="polite">${this.#announcement()}</div>
      <span class="heat-probes" aria-hidden="true">
        ${['empty', 'hover', 'focus', 'label', 'label-inverse', 'marginal', 'scale-start', 'scale-end', 'scale-negative', 'scale-mid'].map(
          (name) => html`<span class="heat-probe heat-probe--${name}"></span>`,
        )}
      </span>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-heatmap-chart': HeatmapChart
  }
}
