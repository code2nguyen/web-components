import { html, nothing, render, unsafeCSS, type CSSResultGroup, type TemplateResult } from 'lit'
import { state } from 'lit/decorators.js'
import { property, arrayPropertyConverter } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import overlapStyles from './overlap-chart.scss?inline'
import { ChartBase, type ChartEventMap, type ChartLegendItem } from './chart-base.js'
import { EchartsChartBase } from './echarts-chart-base.js'
import type { ChartAdapter, ChartBuildContext } from './chart-adapter.js'
import type { EchartsFeature } from './engines/echarts-loader.js'
import type { ChartFrame, ChartPointEventDetail, ChartSeriesConfig, ChartTooltipContext } from './chart-types.js'
import type { ChartTheme } from './chart-theme.js'
import {
  OVERLAP_MAX_SETS,
  fitOverlap,
  boxesOverlap,
  leaderEnd,
  regionLabelPoint,
  regionPath,
  solveOverlap,
  overlapRegions,
  type OverlapBox,
  type OverlapCircle,
  type OverlapLayoutMode,
  type OverlapPoint,
  type OverlapRegion,
  type OverlapRow,
} from './overlap-layout.js'
import './chart-series.js'

export type { OverlapRegion, OverlapRow, OverlapLayoutMode } from './overlap-layout.js'

/** A whole set (one circle), as `set-hover` and `set-click` report it and the tooltip describes it. */
export interface OverlapSetDetail {
  /** The set's key: its `c2-chart-series` `field`. */
  set: string
  label: string
  /** Every member of the set, whatever else they belong to. */
  total: number
  /** Members of this set and no other visible set. */
  only: number
  /** `total` as a share of the union, from 0 to 1. */
  share: number
}

/**
 * What `renderTooltip`, the `tooltip-change` event and a linked `c2-chart-tooltip` receive: the shared tooltip
 * model plus the hovered region, or the hovered set when the pointer or the focus is on a set's name.
 */
export interface OverlapTooltipContext extends ChartTooltipContext {
  region?: OverlapRegion
  set?: OverlapSetDetail
}

/** Detail of `selection-change`. At most one of the two is set. */
export interface OverlapSelectionChangeEventDetail {
  /** Set keys of the selected region, or `[]` when no region is selected. */
  selected: string[]
  /** Key of the selected set (a whole circle), or `null`. */
  selectedSet: string | null
}

/** Events fired by `c2-overlap-chart`, on top of the ones every chart fires. */
export interface OverlapChartEventMap extends ChartEventMap {
  'region-click': CustomEvent<OverlapRegion>
  'region-hover': CustomEvent<OverlapRegion | null>
  'set-click': CustomEvent<OverlapSetDetail>
  'set-hover': CustomEvent<OverlapSetDetail | null>
  'selection-change': CustomEvent<OverlapSelectionChangeEventDetail>
}

export interface OverlapChart {
  addEventListener: TypedAddEventListener<OverlapChart, OverlapChartEventMap>
  removeEventListener: TypedRemoveEventListener<OverlapChart, OverlapChartEventMap>
}

/** A visible set: its key, its label, its colour, and its index among the declared sets. */
interface OverlapSet {
  key: string
  label: string
  color: string
  index: number
}

/** Everything that does not depend on the plot's size. Recomputed only when its signature changes. */
interface OverlapModel {
  signature: string
  sets: OverlapSet[]
  regions: OverlapRegion[]
  union: number
  /** Circles in abstract units, one per visible set. */
  circles: OverlapCircle[]
  /** The regions with an area in this layout, in engine data order. */
  drawn: OverlapRegion[]
}

interface OverlapLabel {
  text: string
  x: number
  y: number
  align: 'left' | 'center' | 'right'
  /** Set when the label sits outside its region: the line runs from the region to the text. */
  leader?: { from: OverlapPoint; to: OverlapPoint }
}

/** The model scaled into one plot size. */
interface OverlapPixels {
  key: string
  circles: OverlapCircle[]
  paths: Map<number, string>
  labels: Map<number, OverlapLabel>
  /** Where the tooltip points for each region: its label position inside the region. */
  anchors: Map<number, OverlapPoint>
  setLabels: { x: number; y: number; align: 'left' | 'center' | 'right'; verticalAlign: 'top' | 'bottom'; name: string; total: string; width: number }[]
}

/** Values read from the host's CSS custom properties for each option build. */
interface OverlapStyle {
  setFillOpacity: number
  setStrokeWidth: number
  hoverOpacity: number
  selectedOpacity: number
  highlightFillOpacity: number
  dimmedOpacity: number
  /** Resolved `--c2-chart__set__dimmed--color`, or `undefined` to keep each set's own colour. */
  dimmedColor?: string
  dimmedFillStyle: OverlapFillStyle
  regionFontSize: number
  setFontSize: number
  setFontWeight: number
}

/** The subset of ECharts' `renderItem` arguments this chart uses. */
interface RenderParams {
  dataIndex: number
}
interface RenderApi {
  getWidth(): number
  getHeight(): number
}

/** Engine series order. The regions and the set names are interactive; the fills and outlines are not. */
const REGION_SERIES = 1
const SET_SERIES = 2

/**
 * A Venn diagram of two or three sets, drawn by ECharts. Each set is a circle and each overlap is the area the
 * circles share, labelled with the number of members in exactly that combination.
 *
 * Declare the sets with `c2-chart-series`, where `field` is the set's key, and pass one `data` row per
 * combination with the number of members in *all* of its sets. A combination left out counts as 0, and the
 * chart works out every exclusive region from those totals.
 *
 * ```html
 * <c2-overlap-chart data='[
 *     { "sets": ["web"], "size": 18420 }, { "sets": ["mobile"], "size": 12960 }, { "sets": ["api"], "size": 4310 },
 *     { "sets": ["web", "mobile"], "size": 6880 }, { "sets": ["web", "api"], "size": 2150 },
 *     { "sets": ["mobile", "api"], "size": 1020 }, { "sets": ["web", "mobile", "api"], "size": 740 }
 *   ]'>
 *   <c2-chart-series field="web" label="Web app"></c2-chart-series>
 *   <c2-chart-series field="mobile" label="Mobile app"></c2-chart-series>
 *   <c2-chart-series field="api" label="Public API"></c2-chart-series>
 * </c2-overlap-chart>
 * ```
 *
 * The legend switches a set off and lays the diagram out again without it. With more than three sets the chart
 * shows its error state, because circles cannot draw every region of four sets.
 *
 * Hovering a set's name, or its legend entry, highlights its whole circle; `highlighted-set` does the same from
 * the application (a row of a table next to the chart, say). On a `selectable` chart, clicking a region selects
 * that region and clicking a set's name selects the whole set.
 *
 * The plot is one tab stop: the arrow keys move through the sets and then the regions from the largest to the
 * smallest, Enter selects the focused one when `selectable` is set, and Escape clears the focus and the selection.
 *
 * `renderTooltip` and `tooltip-change` receive an `OverlapTooltipContext`, which carries the hovered `region` or
 * `set` on top of the shared tooltip model.
 *
 * @tag c2-overlap-chart
 *
 * @slotcomponent c2-chart-series
 *
 * @event {CustomEvent<OverlapRegion>} region-click - Fired when a region is clicked or chosen with Enter. `detail.sets` names its sets, `detail.size` counts the members in exactly those sets and `detail.total` those in all of them. Does not bubble.
 * @event {CustomEvent<OverlapRegion | null>} region-hover - Fired as the pointer or the keyboard focus moves onto a region, and with a `null` detail when it leaves. Does not bubble.
 * @event {CustomEvent<OverlapSetDetail>} set-click - Fired when a set's name is clicked, or chosen with Enter. `detail.total` counts its members and `detail.only` those in no other set. Does not bubble.
 * @event {CustomEvent<OverlapSetDetail | null>} set-hover - Fired as the pointer or the keyboard focus moves onto a set's name, and with a `null` detail when it leaves. Does not bubble.
 * @event {CustomEvent<OverlapSelectionChangeEventDetail>} selection-change - Fired when the reader selects or clears a region or a set of a `selectable` chart. `detail.selected` holds the selected region's set keys and `detail.selectedSet` the selected set's key. Does not bubble.
 *
 * @cssproperty {opacity} [--c2-chart__set--fill-opacity=0.16] - Opacity of each circle's fill. Overlaps read darker because the fills stack.
 * @cssproperty {pixel} [--c2-chart__set--stroke-width=2px] - Width of each circle's outline, drawn in the set's colour.
 * @cssproperty {opacity} [--c2-chart__region__hover--opacity=0.12] - Opacity of the text-coloured wash over the hovered or focused region.
 * @cssproperty {opacity} [--c2-chart__region__selected--opacity=0.24] - Opacity of the text-coloured wash over the selected region, or over the whole circle of the selected set.
 * @cssproperty {opacity} [--c2-chart__set__highlight--fill-opacity=0.32] - Fill opacity of the highlighted or selected set's circle.
 * @cssproperty {opacity} [--c2-chart__set__dimmed--opacity=0.4] - How much of their usual fill and outline the other circles keep while one set is highlighted.
 * @cssproperty {color} [--c2-chart__set__dimmed--color=transparent] - Colour the other circles take while one set is highlighted, a neutral grey for instance. `transparent` keeps each set's own colour.
 * @cssproperty {string} [--c2-chart__set__dimmed--fill-style=solid] - How the other circles are filled while one set is highlighted: `solid`, `hatch` (diagonal lines), `dots`, or `none` (outline only).
 * @cssproperty {font-size} [--c2-chart__region-label--font-size=14px] - Font size of the count or percentage in each region.
 * @cssproperty {font-size} [--c2-chart__set-label--font-size=14px] - Font size of each set's name and total, drawn outside its circle.
 * @cssproperty {font-weight} [--c2-chart__set-label--font-weight=600] - Font weight of each set's name.
 * @cssproperty {outline} [--c2-chart__plot__focus--outline=2px solid rgba(2, 101, 220, 0.4)] - Focus ring of the plot when it is reached with the keyboard.
 */
@customElement('c2-overlap-chart')
export class OverlapChart extends EchartsChartBase {
  static override styles: CSSResultGroup = [ChartBase.styles, unsafeCSS(overlapStyles)]

  protected override readonly features: readonly EchartsFeature[] = ['custom']

  // Highlights redraw the chart under the pointer, so they must land in one step; see `createEchartsAdapter`.
  protected override readonly lazyEngineUpdates = false

  /** Row field holding the set keys of a combination. */
  @property({ type: String, attribute: 'sets-field' }) setsField = 'sets'

  /** Row field holding the number of members in all of the combination's sets. */
  @property({ type: String, attribute: 'size-field' }) sizeField = 'size'

  /**
   * `proportional` sizes the circles and their overlaps by the counts; with three sets the triple overlap is a
   * best fit, since three circles cannot match every combination exactly. `uniform` draws equal circles so
   * every region has room for its label.
   */
  @property({ type: String }) layout: OverlapLayoutMode = 'proportional'

  /** What each region shows: its member count, its share of all members, or nothing. */
  @property({ type: String }) labels: 'count' | 'percent' | 'none' = 'count'

  /** Lets the reader select a region by clicking it or pressing Enter, which fires `selection-change`. */
  @property({ type: Boolean }) selectable = false

  /** Set keys of the selected region, for example `["web", "api"]`; `selected="web;api"` as an attribute. */
  @property({ converter: arrayPropertyConverter }) selected: string[] = []

  /**
   * What a click inside the circles selects. `region` (the default) selects the exclusive region under the pointer;
   * `set` selects a whole circle: the smallest one under the pointer, and the next one there on each further click,
   * until the selection clears. Hovering then highlights the circle a click would select. A set's name always
   * selects its set.
   */
  @property({ type: String }) selection: 'region' | 'set' = 'region'

  /** Key of the selected set: its whole circle is selected. Clears `selected` when the reader picks a set. */
  @property({ type: String, attribute: 'selected-set' }) selectedSet: string | null = null

  /** Key of a set to highlight from the application, as hovering its name does. */
  @property({ type: String, attribute: 'highlighted-set' }) highlightedSet: string | null = null

  /** Formats the counts in the labels and the tooltip. Falls back to the chart's number format. Property only. */
  @property({ attribute: false }) format?: (value: number) => string

  /** The region the keyboard focus is on, as its mask. */
  @state() private focusedMask: number | null = null

  /** The set the keyboard focus is on, by key. Never set together with `focusedMask`. */
  @state() private focusedSet: string | null = null

  /** The set whose name or legend entry the pointer or the focus is on, by key. */
  @state() private hoveredSet: string | null = null

  /** What the last engine hover was on, so leaving it fires the matching `null` event. */
  #hoverKind: 'region' | 'set' | null = null

  /** The set whose name the pointer is on, for the plot's DOM click. */
  #pointerSet: string | null = null

  /** The region the pointer is on, for the plot's DOM click in `selection="set"` mode. */
  #pointerRegion: OverlapRegion | null = null

  #model?: OverlapModel
  #pixels?: OverlapPixels
  #style?: OverlapStyle

  constructor() {
    super()
    // A region has no x position to follow, so the tooltip describes the hovered region only.
    this.tooltip = 'item'
  }

  // ----------------------------------------------------------- public API ---

  /** Every exclusive region of the visible sets, including empty ones, largest first. For a table view or an export. */
  get regions(): OverlapRegion[] {
    return (this.#computeModel()?.regions ?? []).map((region) => ({ ...region, sets: [...region.sets] })).sort((a, b) => b.size - a.size)
  }

  /** The readable name of a region: `Web app only`, `Web app + Public API`. */
  regionName(region: Pick<OverlapRegion, 'sets'>): string {
    const sets = this.#visibleSets()
    const names = sets.filter((set) => region.sets.includes(set.key)).map((set) => set.label)
    if (sets.length > 1 && names.length === 1) return `${names[0]} only`
    return names.join(' + ')
  }

  /** A set's totals, as `set-hover` and `set-click` report them. `undefined` for a set that is not visible. */
  setDetail(key: string): OverlapSetDetail | undefined {
    const model = this.#computeModel()
    const index = model?.sets.findIndex((set) => set.key === key) ?? -1
    if (!model || index < 0) return undefined
    const own = model.regions.find((region) => region.mask === 1 << index)
    const total = own?.total ?? 0
    return { set: key, label: model.sets[index].label, total, only: own?.size ?? 0, share: model.union > 0 ? total / model.union : 0 }
  }

  /** Switches a set off or on, as the legend does, and lays the diagram out again. The last visible set stays on. */
  override setSeriesVisible(index: number, visible: boolean): void {
    if (!visible && this.#visibleSets().length <= 1 && !this.hiddenSeries.has(index)) return
    super.setSeriesVisible(index, visible)
    this.focusedMask = null
    this.focusedSet = null
    this.hoveredSet = null
    // Hiding a set is a new layout, not a hidden engine series: push the re-projected data.
    if (this.data) this.updateData(this.data)
  }

  // ------------------------------------------------------ chart overrides ---

  /** Sets are toggled by recomputing the layout, so the engine is never asked to hide one of its own series. */
  protected override async createAdapter(): Promise<ChartAdapter> {
    const adapter = await super.createAdapter()
    return { ...adapter, setSeriesVisibility: () => undefined }
  }

  protected override validationError(): string {
    const count = this.resolvedSeries.length
    return count > OVERLAP_MAX_SETS ? `A Venn diagram shows at most ${OVERLAP_MAX_SETS} sets; this one has ${count}.` : ''
  }

  /** Hovering or focusing a legend entry highlights that set's circle. */
  protected override legendItems(): ChartLegendItem[] {
    return super.legendItems().map((item) => ({
      ...item,
      highlight: (active: boolean) => {
        const key = item.visible ? item.series.field : null
        this.hoveredSet = active ? key : this.hoveredSet === key ? null : this.hoveredSet
      },
    }))
  }

  protected override get legendDependsOnData(): boolean {
    return this.seriesElements.length === 0 && !this.series?.length
  }

  /** Without declared sets, every key that appears in a row is a set, in order of first appearance. */
  protected override inferredSeries(): ChartSeriesConfig[] {
    const keys: string[] = []
    for (const row of this.#rows()) for (const key of row.sets) if (!keys.includes(key)) keys.push(key)
    return keys.map((key) => ({ field: key, label: key }))
  }

  protected override coordinateSystem(): Record<string, unknown> {
    return {}
  }

  protected override seriesOption(): Record<string, unknown> {
    return {}
  }

  protected override buildOptions(context: ChartBuildContext): unknown {
    const options = super.buildOptions(context) as Record<string, unknown>
    this.#style = this.#readStyle()
    this.#pixels = undefined
    const common = { type: 'custom', coordinateSystem: 'none', animationDurationUpdate: 0 }
    return {
      ...options,
      series: [
        { ...common, name: 'sets', silent: true, z: 1, renderItem: this.#renderSetFillItem },
        { ...common, name: 'regions', z: 2, renderItem: this.#renderRegionItem },
        // Not silent: a set's name is where the reader hovers and clicks the whole set. Its circle stays silent.
        { ...common, name: 'outlines', z: 3, renderItem: this.#renderOutlineItem },
      ],
    }
  }

  // The same functions on every option build: a new `renderItem` makes ECharts replace the series' elements
  // instead of updating them, and a hover highlight rebuilt between a press and its release would then lose the click.
  #renderSetFillItem = (params: RenderParams, api: RenderApi): unknown => this.#renderSetFill(params, api, this.themeController.theme)
  #renderRegionItem = (params: RenderParams, api: RenderApi): unknown => this.#renderRegion(params, api, this.themeController.theme)
  #renderOutlineItem = (params: RenderParams, api: RenderApi): unknown => this.#renderOutline(params, api, this.themeController.theme)

  /** One datum per circle for the fill and outline series, and one per drawable region in between. */
  protected override projectData(_frame: ChartFrame, _context: ChartBuildContext): unknown {
    const model = this.#computeModel()
    // A data-only change skips Lit's update, so the region table is refreshed on the data path too.
    this.#renderAccessibleSummary()
    if (!model) return [[], [], []]
    const sets = model.sets.map((set, index) => ({ name: set.label, value: [index] }))
    return [sets, model.drawn.map((region) => ({ name: this.regionName(region), value: [region.mask] })), sets]
  }

  protected override tooltipContextAt(detail: { index: number; seriesIndex: number; px: number; py: number }): OverlapTooltipContext {
    if (detail.seriesIndex === SET_SERIES) {
      const set = this.#computeModel()?.sets[detail.index]
      const info = set ? this.setDetail(set.key) : undefined
      const label = this.#pixels?.setLabels[detail.index]
      if (set && info) {
        return {
          index: detail.index,
          x: detail.index,
          formattedX: set.label,
          entries: [
            {
              seriesIndex: SET_SERIES,
              series: { field: set.key, label: set.label },
              value: info.total,
              formatted: this.#formatCount(info.total),
              color: set.color,
            },
          ],
          px: label?.x ?? detail.px,
          // The top edge of the name, so the tooltip opens above it rather than over it.
          py: label ? label.y - (label.verticalAlign === 'bottom' ? Math.ceil((this.#style?.setFontSize ?? 14) * 1.25) : 0) : detail.py,
          set: info,
        }
      }
    }
    const region = detail.seriesIndex === REGION_SERIES ? this.#computeModel()?.drawn[detail.index] : undefined
    if (!region) return { index: detail.index, x: detail.index, formattedX: '', entries: [], px: detail.px, py: detail.py }
    const name = this.regionName(region)
    const anchor = this.#pixels?.anchors.get(region.mask) ?? { x: detail.px, y: detail.py }
    return {
      index: detail.index,
      x: detail.index,
      formattedX: name,
      entries: [
        {
          seriesIndex: REGION_SERIES,
          series: { field: region.sets.join('&'), label: name },
          value: region.size,
          formatted: this.#formatCount(region.size),
          color: this.#regionColor(region),
        },
      ],
      px: anchor.x,
      py: anchor.y,
      region: { ...region, sets: [...region.sets] },
    }
  }

  /** A region is not a point: `point-hover` and `point-click` stay quiet and the region events fire instead. */
  protected override pointAt(): ChartPointEventDetail | undefined {
    return undefined
  }

  protected override handleEngineHover(detail: { index: number; seriesIndex: number; px: number; py: number } | null): void {
    const model = this.#computeModel()
    if (!detail) {
      const kind = this.#hoverKind
      this.#hoverKind = null
      super.handleEngineHover(null)
      this.#pointerSet = null
      this.#pointerRegion = null
      if (kind === 'set' || (kind === 'region' && this.selection === 'set')) this.hoveredSet = null
      if (kind === 'set') {
        this.dispatchEvent(new CustomEvent<OverlapSetDetail | null>('set-hover', { detail: null }))
      } else if (kind === 'region') {
        this.dispatchEvent(new CustomEvent<OverlapRegion | null>('region-hover', { detail: null }))
      }
      return
    }
    if (detail.seriesIndex === SET_SERIES) {
      const set = model?.sets[detail.index]
      const info = set ? this.setDetail(set.key) : undefined
      if (!set || !info) return
      if (this.#hoverKind === 'region') this.dispatchEvent(new CustomEvent<OverlapRegion | null>('region-hover', { detail: null }))
      this.#hoverKind = 'set'
      this.#pointerSet = set.key
      // This redraws the chart under the pointer, which ECharts' own click would not survive (the pressed element
      // is replaced before the release), so a click on a name is read from the plot's DOM click instead.
      this.hoveredSet = set.key
      super.handleEngineHover(detail)
      this.dispatchEvent(new CustomEvent<OverlapSetDetail | null>('set-hover', { detail: info }))
      return
    }
    const region = detail.seriesIndex === REGION_SERIES ? model?.drawn[detail.index] : undefined
    if (!region) return
    // Straight from a set to a region (the keyboard does that, with no leave in between): the set is left first.
    if (this.#hoverKind === 'set') {
      this.hoveredSet = null
      this.#pointerSet = null
      this.dispatchEvent(new CustomEvent<OverlapSetDetail | null>('set-hover', { detail: null }))
    }
    this.#hoverKind = 'region'
    this.#pointerRegion = region
    // In set mode the circle a click would select is highlighted, so the reader sees what they are about to pick.
    if (this.selection === 'set')
      this.hoveredSet = this.#setCandidates(region).includes(this.selectedSet ?? '') ? this.selectedSet : (this.#setCandidates(region)[0] ?? null)
    super.handleEngineHover(detail)
    this.dispatchEvent(new CustomEvent<OverlapRegion | null>('region-hover', { detail: { ...region, sets: [...region.sets] } }))
  }

  protected override handleEngineClick(detail: { index: number; seriesIndex: number }): void {
    const model = this.#computeModel()
    // A click on a set's name is handled by `#handlePlotClick`, which a redraw under the pointer cannot drop.
    // In set mode the hover highlight redraws under the pointer too, so that click also comes from the DOM.
    if (detail.seriesIndex !== REGION_SERIES || this.selection === 'set') return
    const region = model?.drawn[detail.index]
    if (region) this.#activate(region)
  }

  protected override defaultTooltip(context: OverlapTooltipContext): TemplateResult {
    const row = (label: string, value: string) => html`
      <div class="tooltip-row">
        <span class="tooltip-label">${label}</span>
        <span class="tooltip-value">${value}</span>
      </div>
    `
    const set = context.set
    if (set) {
      return html`
        <div class="tooltip-title">${set.label}</div>
        ${row('Members', this.#formatCount(set.total))} ${row('Share of total', this.#formatShare(set.share))}
        ${set.only !== set.total ? row('In no other set', this.#formatCount(set.only)) : nothing}
      `
    }
    const region = context.region
    if (!region) return super.defaultTooltip(context)
    const outside = this.#visibleSets()
      .filter((item) => !region.sets.includes(item.key))
      .map((item) => item.label)
    return html`
      <div class="tooltip-title">${context.formattedX}</div>
      ${outside.length > 0 && region.sets.length > 1 ? html`<div class="tooltip-subtitle">Not in ${outside.join(' or ')}</div>` : nothing}
      ${row('In this region', this.#formatCount(region.size))} ${row('Share of total', this.#formatShare(region.share))}
      ${region.total !== region.size ? row(region.sets.length > 1 ? 'In all of these' : 'Set total', this.#formatCount(region.total)) : nothing}
    `
  }

  // ------------------------------------------------------------ lifecycle ---

  protected override firstUpdated(): void {
    super.firstUpdated()
    const plot = this.plotElement
    if (!plot) return
    // The plot is the chart's one tab stop. It is inside the shadow root, so nothing is written on the host.
    plot.tabIndex = 0
    plot.setAttribute('role', 'group')
    plot.setAttribute('aria-roledescription', 'Venn diagram')
    plot.addEventListener('keydown', this.#handleKeydown)
    plot.addEventListener('blur', this.#handleBlur)
    plot.addEventListener('click', this.#handlePlotClick)
  }

  protected override updated(changed: Map<PropertyKey, unknown>): void {
    super.updated(changed)
    this.#renderAccessibleSummary()
    const model = this.#computeModel()
    const label = model ? `Venn diagram of ${model.sets.map((set) => set.label).join(', ')}` : 'Venn diagram'
    if (this.plotElement?.getAttribute('aria-label') !== label) this.plotElement?.setAttribute('aria-label', label)
  }

  /**
   * The region table and the live announcement are rendered into a static container after each update rather than
   * in this template, for the reason the legend is: a server cannot see the set definitions, and hydration would
   * keep whatever it rendered.
   */
  protected override render(): TemplateResult {
    return html`${super.render()}
      <i class="overlap-dimmed-probe" aria-hidden="true"></i>
      <div class="overlap-a11y-root"></div>`
  }

  #renderAccessibleSummary(): void {
    const root = this.renderRoot?.querySelector<HTMLElement>('.overlap-a11y-root')
    if (!root) return
    const model = this.validationError() ? undefined : this.#computeModel()
    const focused = model?.drawn.find((region) => region.mask === this.focusedMask)
    const focusedSet = this.focusedSet ? this.setDetail(this.focusedSet) : undefined
    const announcement = focusedSet
      ? `${focusedSet.label}: ${this.#formatCount(focusedSet.total)} members, ${this.#formatShare(focusedSet.share)}`
      : focused
        ? `${this.regionName(focused)}: ${this.#formatCount(focused.size)}, ${this.#formatShare(focused.share)}`
        : ''
    render(
      html`
        ${
          model
            ? html`
                <table class="overlap-a11y">
                  <caption>
                    ${model.sets.map((set) => set.label).join(', ')}
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Region</th>
                      <th scope="col">Members</th>
                      <th scope="col">Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${[...model.regions]
                      .sort((a, b) => b.size - a.size)
                      .map(
                        (region) => html`
                          <tr>
                            <th scope="row">${this.regionName(region)}</th>
                            <td>${this.#formatCount(region.size)}</td>
                            <td>${this.#formatShare(region.share)}</td>
                          </tr>
                        `,
                      )}
                  </tbody>
                </table>
              `
            : nothing
        }
        <div class="overlap-a11y" aria-live="polite">${announcement}</div>
      `,
      root,
      { host: this },
    )
  }

  // ------------------------------------------------------------ internals ---

  /** The rows as `{ sets, size }`, whatever the fields are called. Rows without a set list are skipped. */
  #rows(): OverlapRow[] {
    const data = this.data
    if (!Array.isArray(data)) return []
    const rows: OverlapRow[] = []
    for (const row of data as unknown[]) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) continue
      const record = row as Record<string, unknown>
      const sets = record[this.setsField]
      if (!Array.isArray(sets) || sets.length === 0) continue
      rows.push({ sets: sets.map(String), size: Number(record[this.sizeField]) || 0 })
    }
    return rows
  }

  #visibleSets(): OverlapSet[] {
    const theme = this.themeController.theme
    return this.resolvedSeries
      .map((series, index) => ({ key: series.field, label: series.label ?? series.field, color: this.colorOf(series, index, theme), index }))
      .filter((set) => !this.hiddenSeries.has(set.index))
  }

  #computeModel(): OverlapModel | undefined {
    const sets = this.#visibleSets()
    if (sets.length === 0 || sets.length > OVERLAP_MAX_SETS) return undefined
    const rows = this.#rows()
    const keys = sets.map((set) => set.key)
    const signature = JSON.stringify([keys, sets.map((set) => [set.label, set.color]), this.layout, rows])
    if (this.#model?.signature === signature) return this.#model

    const { regions, union } = overlapRegions(keys, rows)
    const circles = solveOverlap(keys, regions, this.layout)
    const drawn = regions.filter((region) => regionPath(circles, region.mask) !== '')
    this.#model = { signature, sets, regions, union, circles, drawn }
    this.#pixels = undefined
    return this.#model
  }

  /**
   * A colour variable resolved to `rgb(…)` through a hidden probe, as the chart theme does: `getPropertyValue`
   * would hand back a `var()` or `color-mix()` chain no engine can parse. A transparent result means "unset".
   */
  #probeColor(selector: string): string | undefined {
    const probe = this.renderRoot?.querySelector<HTMLElement>(selector)
    const color = probe ? getComputedStyle(probe).color : ''
    return !color || color === 'transparent' || /^rgba\([^)]*,\s*0\)$/.test(color) ? undefined : color
  }

  #readStyle(): OverlapStyle {
    const style = getComputedStyle(this)
    const read = (name: string, fallback: number): number => {
      const value = parseFloat(style.getPropertyValue(name))
      return Number.isFinite(value) ? value : fallback
    }
    return {
      setFillOpacity: read('--c2-chart__set--fill-opacity', 0.16),
      setStrokeWidth: read('--c2-chart__set--stroke-width', 2),
      hoverOpacity: read('--c2-chart__region__hover--opacity', 0.12),
      selectedOpacity: read('--c2-chart__region__selected--opacity', 0.24),
      highlightFillOpacity: read('--c2-chart__set__highlight--fill-opacity', 0.32),
      dimmedOpacity: read('--c2-chart__set__dimmed--opacity', 0.4),
      dimmedColor: this.#probeColor('.overlap-dimmed-probe'),
      dimmedFillStyle: readFillStyle(style.getPropertyValue('--c2-chart__set__dimmed--fill-style')),
      regionFontSize: read('--c2-chart__region-label--font-size', 14),
      setFontSize: read('--c2-chart__set-label--font-size', 14),
      setFontWeight: read('--c2-chart__set-label--font-weight', 600),
    }
  }

  /** Scales the model into the plot and places every label. Cached per size, model and label mode. */
  #layoutPixels(width: number, height: number): OverlapPixels | undefined {
    const model = this.#computeModel()
    const style = this.#style ?? this.#readStyle()
    if (!model) return undefined
    const key = `${width}x${height}|${model.signature}|${this.labels}|${JSON.stringify(style)}|${this.locale ?? ''}`
    if (this.#pixels?.key === key) return this.#pixels

    const fontFamily = this.#fontFamily(this.themeController.theme) ?? 'sans-serif'
    const measure = (text: string, size: number, weight: number) => measureText(text, `${weight} ${size}px ${fontFamily}`, size)
    const circles = fitOverlap(model.circles, width, height, { x: 8, y: style.setFontSize + 16 })
    const paths = new Map<number, string>()
    const labels = new Map<number, OverlapLabel>()
    const anchors = new Map<number, OverlapPoint>()
    const lineHeight = (size: number) => Math.ceil(size * 1.25)

    // Set names first: they sit outside their circles and everything placed later keeps clear of them.
    const cy = circles.reduce((sum, c) => sum + c.y, 0) / circles.length
    const setLabels = circles.map((circle, index) => {
      const set = model.sets[index]
      const region = model.regions.find((item) => item.mask === 1 << index)
      const total = this.#formatCount(region?.total ?? 0)
      const below = circle.y > cy + 1
      const textWidth =
        measure('● ', style.setFontSize, 400) + measure(set.label, style.setFontSize, style.setFontWeight) + measure(` ${total}`, style.setFontSize, 400)
      return {
        x: circle.x,
        y: below ? circle.y + circle.radius + 8 : circle.y - circle.radius - 8,
        align: 'center' as const,
        verticalAlign: below ? ('top' as const) : ('bottom' as const),
        name: set.label,
        total,
        width: textWidth,
      }
    })
    const setBox = (label: (typeof setLabels)[number]): OverlapBox => {
      const h = lineHeight(style.setFontSize)
      const y1 = label.verticalAlign === 'top' ? label.y : label.y - h
      return { x1: label.x - label.width / 2, y1, x2: label.x + label.width / 2, y2: y1 + h }
    }
    const clampX = (label: (typeof setLabels)[number]) => {
      label.x = Math.min(Math.max(label.x, label.width / 2 + 4), width - label.width / 2 - 4)
    }
    setLabels.forEach(clampX)
    // A name drawn over another circle is flipped to the other side of its own circle when that side is clear.
    setLabels.forEach((label, index) => {
      if (!boxTouchesCircles(setBox(label), circles, 2, index)) return
      const circle = circles[index]
      const flipped = {
        ...label,
        verticalAlign: label.verticalAlign === 'top' ? ('bottom' as const) : ('top' as const),
        y: label.verticalAlign === 'top' ? circle.y - circle.radius - 8 : circle.y + circle.radius + 8,
      }
      const box = setBox(flipped)
      if (box.y1 >= 0 && box.y2 <= height && !boxTouchesCircles(box, circles, 2, index)) Object.assign(label, flipped)
    })
    // Two names on the same side of the diagram can meet: push them apart, then stack them if there is no room.
    for (let pass = 0; pass < 8; pass += 1) {
      let moved = false
      for (let i = 0; i < setLabels.length; i += 1) {
        for (let j = i + 1; j < setLabels.length; j += 1) {
          const a = setLabels[i]
          const b = setLabels[j]
          const boxA = setBox(a)
          const boxB = setBox(b)
          if (!boxesOverlap(boxA, boxB, 4)) continue
          moved = true
          const [left, right] = a.x <= b.x ? [a, b] : [b, a]
          const overlap = Math.min(boxA.x2, boxB.x2) - Math.max(boxA.x1, boxB.x1) + 10
          left.x -= overlap / 2
          right.x += overlap / 2
          clampX(left)
          clampX(right)
          if (boxesOverlap(setBox(a), setBox(b), 4)) {
            const step = lineHeight(style.setFontSize) + 2
            b.y += b.verticalAlign === 'top' ? step : -step
          }
        }
      }
      if (!moved) break
    }
    const obstacles: OverlapBox[] = setLabels.map(setBox)

    const textBox = (x: number, y: number, textWidth: number, align: OverlapLabel['align']): OverlapBox => {
      const h = lineHeight(style.regionFontSize)
      const x1 = align === 'center' ? x - textWidth / 2 : align === 'left' ? x : x - textWidth
      return { x1, y1: y - h / 2, x2: x1 + textWidth, y2: y + h / 2 }
    }
    const pending: { region: OverlapRegion; text: string; textWidth: number; point: OverlapPoint }[] = []
    for (const region of model.drawn) {
      paths.set(region.mask, regionPath(circles, region.mask))
      const point = regionLabelPoint(circles, region.mask)
      if (!point) continue
      anchors.set(region.mask, point)
      if (this.labels === 'none' || (region.size === 0 && this.layout === 'proportional')) continue
      const text = this.labels === 'percent' ? this.#formatShare(region.share) : this.#formatCount(region.size)
      const weight = region.size === 0 ? 400 : 500
      const textWidth = measure(text, style.regionFontSize, weight)
      // Inside when the whole text box fits in the clear disc around the region's centre, corners included.
      if (point.clearance >= Math.hypot(textWidth / 2, style.regionFontSize * 0.55) + 1) {
        labels.set(region.mask, { text, x: point.x, y: point.y, align: 'center' })
        obstacles.push(textBox(point.x, point.y, textWidth, 'center'))
      } else {
        pending.push({ region, text, textWidth, point })
      }
    }

    // Too small for its text: the number moves outside, joined to the region by a line. The first direction
    // tried points away from the diagram's centre; the rest fan out from it until one is clear of every label.
    const offsets = [0, 25, -25, 50, -50, 75, -75, 105, -105, 140, -140, 180].map((degrees) => (degrees * Math.PI) / 180)
    const cx = circles.reduce((sum, c) => sum + c.x, 0) / circles.length
    for (const { region, text, textWidth, point } of pending) {
      const outward = Math.atan2(point.y - cy, point.x - cx || 1e-6)
      // Among the spots clear of every other label, the shortest leader wins; touching a circle counts as 40px
      // of extra line, so a short line across an outline beats a long one around it.
      let chosen: OverlapLabel | undefined
      let chosenBox: OverlapBox | undefined
      let best = Infinity
      let fallback: OverlapLabel | undefined
      for (const offset of offsets) {
        const angle = outward + offset
        const end = leaderEnd(circles, point, 10, { x: Math.cos(angle), y: Math.sin(angle) })
        const align = end.direction.x >= 0 ? 'left' : 'right'
        const x = end.x + (align === 'left' ? 4 : -4)
        const box = textBox(x, end.y, textWidth, align)
        const label: OverlapLabel = { text, x, y: end.y, align, leader: { from: point, to: { x: end.x, y: end.y } } }
        fallback ??= label
        const inside = box.x1 >= 2 && box.x2 <= width - 2 && box.y1 >= 0 && box.y2 <= height
        if (!inside || obstacles.some((other) => boxesOverlap(box, other, 3))) continue
        const score = Math.hypot(end.x - point.x, end.y - point.y) + (boxTouchesCircles(box, circles, 2) ? 40 : 0)
        if (score < best) {
          best = score
          chosen = label
          chosenBox = box
        }
      }
      if (chosenBox) obstacles.push(chosenBox)
      chosen ??= fallback
      if (chosen) labels.set(region.mask, chosen)
    }

    this.#pixels = { key, circles, paths, labels, anchors, setLabels }
    return this.#pixels
  }

  #renderSetFill(params: RenderParams, api: RenderApi, theme: ChartTheme): unknown {
    const pixels = this.#layoutPixels(api.getWidth(), api.getHeight())
    const circle = pixels?.circles[params.dataIndex]
    const set = this.#model?.sets[params.dataIndex]
    if (!circle || !set) return null
    const style = this.#style as OverlapStyle
    const active = this.#activeSet()
    const shape = { cx: circle.x, cy: circle.y, r: circle.radius }
    const children: unknown[] = []
    if (!active || active === set.key) {
      children.push({ type: 'circle', shape, style: { fill: set.color, fillOpacity: active ? style.highlightFillOpacity : style.setFillOpacity } })
    } else {
      // Another set is highlighted: this one takes the dimmed colour and fill style.
      const color = style.dimmedColor ?? set.color
      const pattern = style.dimmedFillStyle === 'hatch' || style.dimmedFillStyle === 'dots' ? patternFill(color, style.dimmedFillStyle) : undefined
      if (pattern) children.push({ type: 'circle', shape, style: { fill: pattern, opacity: style.dimmedOpacity } })
      else if (style.dimmedFillStyle !== 'none')
        children.push({ type: 'circle', shape, style: { fill: color, fillOpacity: style.setFillOpacity * style.dimmedOpacity } })
    }
    // The selected set gets the same text-coloured wash a selected region gets, over its whole circle.
    if (this.selectedSet === set.key) {
      children.push({
        type: 'circle',
        shape: { cx: circle.x, cy: circle.y, r: circle.radius },
        style: { fill: theme.color, fillOpacity: style.selectedOpacity },
      })
    }
    return { type: 'group', children }
  }

  #renderRegion(params: RenderParams, api: RenderApi, theme: ChartTheme): unknown {
    const pixels = this.#layoutPixels(api.getWidth(), api.getHeight())
    const region = this.#model?.drawn[params.dataIndex]
    const pathData = region ? pixels?.paths.get(region.mask) : undefined
    if (!pixels || !region || !pathData) return null
    const style = this.#style as OverlapStyle
    const selected = this.#isSelected(region)
    const focused = this.focusedMask === region.mask
    const base = selected ? style.selectedOpacity : focused ? style.hoverOpacity : 0
    const children: unknown[] = [
      {
        type: 'path',
        shape: { pathData },
        style: {
          fill: theme.color,
          fillOpacity: base,
          stroke: focused ? theme.color : 'none',
          lineWidth: focused ? 2 : 0,
          lineDash: focused ? [4, 3] : undefined,
        },
        emphasis: { style: { fillOpacity: selected ? Math.min(1, style.selectedOpacity + 0.06) : style.hoverOpacity } },
      },
    ]
    const label = pixels.labels.get(region.mask)
    if (label) {
      if (label.leader) {
        children.push({
          type: 'line',
          silent: true,
          shape: { x1: label.leader.from.x, y1: label.leader.from.y, x2: label.leader.to.x, y2: label.leader.to.y },
          style: { stroke: theme.mutedColor, lineWidth: 1 },
        })
        children.push({ type: 'circle', silent: true, shape: { cx: label.leader.from.x, cy: label.leader.from.y, r: 2 }, style: { fill: theme.color } })
      }
      children.push({
        type: 'text',
        silent: true,
        style: {
          text: label.text,
          x: label.x,
          y: label.y,
          align: label.align,
          verticalAlign: 'middle',
          fill: region.size === 0 ? theme.mutedColor : theme.color,
          fontSize: style.regionFontSize,
          fontWeight: region.size === 0 ? 400 : 500,
          fontFamily: this.#fontFamily(theme),
        },
      })
    }
    return { type: 'group', children }
  }

  #renderOutline(params: RenderParams, api: RenderApi, theme: ChartTheme): unknown {
    const pixels = this.#layoutPixels(api.getWidth(), api.getHeight())
    const circle = pixels?.circles[params.dataIndex]
    const label = pixels?.setLabels[params.dataIndex]
    const set = this.#model?.sets[params.dataIndex]
    if (!circle || !label || !set) return null
    const style = this.#style as OverlapStyle
    const fontFamily = this.#fontFamily(theme)
    const active = this.#activeSet()
    const emphasised = active === set.key
    const focused = this.focusedSet === set.key
    return {
      type: 'group',
      children: [
        {
          type: 'circle',
          silent: true,
          shape: { cx: circle.x, cy: circle.y, r: circle.radius },
          style: {
            fill: 'none',
            stroke: active && !emphasised ? (style.dimmedColor ?? set.color) : set.color,
            lineWidth: emphasised ? style.setStrokeWidth + 1.5 : style.setStrokeWidth,
            strokeOpacity: active && !emphasised ? style.dimmedOpacity : 1,
          },
        },
        {
          type: 'text',
          cursor: 'pointer',
          style: {
            text: `{dot|●} {name|${escapeRich(label.name)}} {total|${escapeRich(label.total)}}`,
            x: label.x,
            y: label.y,
            align: label.align,
            verticalAlign: label.verticalAlign,
            fontSize: style.setFontSize,
            fontFamily,
            rich: {
              dot: { fill: set.color, fontSize: style.setFontSize, fontFamily },
              name: { fill: theme.color, fontWeight: style.setFontWeight, fontSize: style.setFontSize, fontFamily },
              total: { fill: theme.mutedColor, fontSize: style.setFontSize, fontFamily },
            },
          },
        },
        // The keyboard focus on a set is drawn around its name, the thing a pointer would be on.
        ...(focused
          ? [
              {
                type: 'rect',
                silent: true,
                shape: this.#setLabelRect(label, style.setFontSize),
                style: { fill: 'none', stroke: theme.color, lineWidth: 1.5, lineDash: [4, 3] },
              },
            ]
          : []),
      ],
    }
  }

  #setLabelRect(label: OverlapPixels['setLabels'][number], fontSize: number): { x: number; y: number; width: number; height: number; r: number } {
    const height = Math.ceil(fontSize * 1.25) + 6
    const y = label.verticalAlign === 'top' ? label.y - 3 : label.y - height + 3
    return { x: label.x - label.width / 2 - 5, y, width: label.width + 10, height, r: 4 }
  }

  /** The set drawn emphasised, if any: the hovered one, else the focused one, else the one the application highlights. */
  #activeSet(): string | null {
    const visible = new Set(this.#computeModel()?.sets.map((set) => set.key))
    for (const key of [this.hoveredSet, this.focusedSet, this.highlightedSet, this.selectedSet]) if (key && visible.has(key)) return key
    return null
  }

  #fontFamily(theme: ChartTheme): string | undefined {
    return theme.fontFamily === 'inherit' ? getComputedStyle(this).fontFamily || undefined : theme.fontFamily
  }

  #isSelected(region: OverlapRegion): boolean {
    return this.selected.length === region.sets.length && region.sets.every((key) => this.selected.includes(key))
  }

  /** A single set's region wears its colour in the tooltip; an overlap wears the text colour. */
  #regionColor(region: OverlapRegion): string {
    if (region.sets.length !== 1) return this.themeController.theme.color
    return this.#visibleSets().find((set) => set.key === region.sets[0])?.color ?? this.themeController.theme.color
  }

  #formatCount(value: number): string {
    return this.format?.(value) ?? this.formatValue(value)
  }

  #formatShare(share: number): string {
    return new Intl.NumberFormat(this.locale, { style: 'percent', maximumFractionDigits: 1 }).format(share)
  }

  /** Click or Enter: fires `region-click` and, on a selectable chart, toggles the selection. */
  #activate(region: OverlapRegion): void {
    this.dispatchEvent(new CustomEvent<OverlapRegion>('region-click', { detail: { ...region, sets: [...region.sets] } }))
    if (!this.selectable) return
    this.selected = this.#isSelected(region) ? [] : [...region.sets]
    this.selectedSet = null
    this.#notifySelection()
  }

  /** Click on a set's name, or Enter on it: fires `set-click` and, on a selectable chart, toggles the set's selection. */
  #activateSet(key: string): void {
    const info = this.setDetail(key)
    if (!info) return
    this.dispatchEvent(new CustomEvent<OverlapSetDetail>('set-click', { detail: info }))
    if (!this.selectable) return
    this.selectedSet = this.selectedSet === key ? null : key
    this.selected = []
    this.#notifySelection()
  }

  /** The sets a region lies in, smallest circle first: the order a click in `selection="set"` mode walks. */
  #setCandidates(region: OverlapRegion): string[] {
    return [...region.sets].sort((a, b) => (this.setDetail(a)?.total ?? 0) - (this.setDetail(b)?.total ?? 0))
  }

  /** A click, or Enter, on a region in `selection="set"` mode: selects the next circle there, then none. */
  #activateSetAt(region: OverlapRegion): void {
    this.dispatchEvent(new CustomEvent<OverlapRegion>('region-click', { detail: { ...region, sets: [...region.sets] } }))
    const candidates = this.#setCandidates(region)
    const current = candidates.indexOf(this.selectedSet ?? '')
    const target = current < 0 ? candidates[0] : candidates[current + 1]
    if (!this.selectable) {
      if (candidates[0]) this.#activateSet(candidates[0])
      return
    }
    if (target) {
      this.#activateSet(target)
    } else {
      this.selectedSet = null
      this.selected = []
      this.#notifySelection()
    }
    // Keep the hover highlight on what is now selected, or back on the first candidate once it clears.
    if (this.#pointerRegion === region) this.hoveredSet = target ?? candidates[0] ?? null
  }

  #notifySelection(): void {
    this.dispatchEvent(
      new CustomEvent<OverlapSelectionChangeEventDetail>('selection-change', { detail: { selected: [...this.selected], selectedSet: this.selectedSet } }),
    )
  }

  /** Moves the keyboard focus onto a region and shows its tooltip, as hovering it would. */
  #focusRegion(region: OverlapRegion | undefined): void {
    const model = this.#computeModel()
    this.focusedMask = region?.mask ?? null
    this.focusedSet = null
    if (!model || !region) {
      this.handleEngineHover(null)
      return
    }
    const anchor = this.#pixels?.anchors.get(region.mask) ?? { x: 0, y: 0 }
    this.handleEngineHover({ index: model.drawn.indexOf(region), seriesIndex: REGION_SERIES, px: anchor.x, py: anchor.y })
  }

  /** Moves the keyboard focus onto a set's name and shows its tooltip, as hovering the name would. */
  #focusSet(key: string): void {
    const model = this.#computeModel()
    const index = model?.sets.findIndex((set) => set.key === key) ?? -1
    if (!model || index < 0) return
    this.focusedMask = null
    this.focusedSet = key
    this.handleEngineHover({ index, seriesIndex: SET_SERIES, px: 0, py: 0 })
  }

  #handleKeydown = (event: KeyboardEvent): void => {
    const model = this.#computeModel()
    if (!model || model.drawn.length === 0) return
    // The whole sets first, in declaration order, then the regions from the largest to the smallest.
    const order: ({ set: string } | { region: OverlapRegion })[] = [
      ...model.sets.map((set) => ({ set: set.key })),
      ...[...model.drawn].sort((a, b) => b.size - a.size).map((region) => ({ region })),
    ]
    const current = order.findIndex((item) => ('set' in item ? item.set === this.focusedSet : item.region.mask === this.focusedMask))
    const move = (index: number) => {
      event.preventDefault()
      const item = order[(index + order.length) % order.length]
      if ('set' in item) this.#focusSet(item.set)
      else this.#focusRegion(item.region)
    }
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        move(current + 1)
        break
      case 'ArrowLeft':
      case 'ArrowUp':
        move(current < 0 ? order.length - 1 : current - 1)
        break
      case 'Home':
        move(0)
        break
      case 'End':
        move(order.length - 1)
        break
      case 'Enter':
      case ' ':
        if (current < 0) return
        event.preventDefault()
        {
          const item = order[current]
          if ('set' in item) this.#activateSet(item.set)
          else if (this.selection === 'set') this.#activateSetAt(item.region)
          else this.#activate(item.region)
        }
        break
      case 'Escape': {
        const hasSelection = this.selected.length > 0 || this.selectedSet !== null
        if (current < 0 && !hasSelection) return
        event.preventDefault()
        this.#focusRegion(undefined)
        if (this.selectable && hasSelection) {
          this.selected = []
          this.selectedSet = null
          this.#notifySelection()
        }
        break
      }
    }
  }

  #handlePlotClick = (): void => {
    if (this.#hoverKind === 'set' && this.#pointerSet) this.#activateSet(this.#pointerSet)
    else if (this.#hoverKind === 'region' && this.#pointerRegion && this.selection === 'set') this.#activateSetAt(this.#pointerRegion)
  }

  #handleBlur = (): void => {
    if (this.focusedMask !== null || this.focusedSet !== null) this.#focusRegion(undefined)
  }
}

/** How a dimmed circle is filled: its usual wash, diagonal lines, dots, or not at all. */
export type OverlapFillStyle = 'solid' | 'hatch' | 'dots' | 'none'

function readFillStyle(value: string): OverlapFillStyle {
  const keyword = value.trim()
  return keyword === 'hatch' || keyword === 'dots' || keyword === 'none' ? keyword : 'solid'
}

const patterns = new Map<string, { image: HTMLCanvasElement; repeat: 'repeat' }>()

/** A repeating tile of diagonal lines or dots in `color`, as the engine's pattern fill. `undefined` without a DOM. */
function patternFill(color: string, kind: 'hatch' | 'dots'): { image: HTMLCanvasElement; repeat: 'repeat' } | undefined {
  const key = `${kind}|${color}`
  const cached = patterns.get(key)
  if (cached) return cached
  if (typeof document === 'undefined') return undefined
  const size = 8
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (!context) return undefined
  context.strokeStyle = color
  context.fillStyle = color
  if (kind === 'hatch') {
    context.lineWidth = 1.5
    context.beginPath()
    // Three segments so the lines run on across the tile edges without a seam.
    for (const offset of [-size, 0, size]) {
      context.moveTo(offset, size)
      context.lineTo(offset + size, 0)
    }
    context.stroke()
  } else {
    context.beginPath()
    context.arc(size / 2, size / 2, 1.4, 0, Math.PI * 2)
    context.fill()
  }
  const pattern = { image: canvas, repeat: 'repeat' as const }
  patterns.set(key, pattern)
  return pattern
}

/** Whether a label box touches or crosses any circle other than the one at `skip`. */
function boxTouchesCircles(box: OverlapBox, circles: readonly OverlapCircle[], gap: number, skip = -1): boolean {
  return circles.some((circle, index) => {
    if (index === skip) return false
    const x = Math.min(Math.max(circle.x, box.x1), box.x2)
    const y = Math.min(Math.max(circle.y, box.y1), box.y2)
    return Math.hypot(circle.x - x, circle.y - y) < circle.radius + gap
  })
}

let measureContext: CanvasRenderingContext2D | null | undefined

/** Width of `text` in `font`, measured on a canvas; an estimate where there is none (a test runner without one). */
function measureText(text: string, font: string, size: number): number {
  if (measureContext === undefined) measureContext = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d')
  if (!measureContext) return text.length * size * 0.6
  measureContext.font = font
  return measureContext.measureText(text).width
}

/** ECharts rich text uses `{style|text}`: a brace or a pipe in a label would end the run early. */
function escapeRich(text: string): string {
  return text.replace(/[{}|]/g, ' ')
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-overlap-chart': OverlapChart
  }
}
