import { html, nothing, render, svg, unsafeCSS, type CSSResultGroup, type PropertyValues, type TemplateResult } from 'lit'
import { state } from 'lit/decorators.js'
import { arrayPropertyConverter, property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import sunburstStyles from './sunburst-chart.scss?inline'
import { ChartBase, type ChartEventMap, type ChartLegendItem } from './chart-base.js'
import { EchartsChartBase } from './echarts-chart-base.js'
import { readableOn } from './chart-contrast.js'
import { mixColors } from './map-scale.js'
import { measureText } from './chart-measure.js'
import { sunburstMessages } from './sunburst-messages.js'
import {
  buildHierarchy,
  findHierarchyNode,
  hierarchyEngineName,
  hierarchyHeight,
  preorderHierarchy,
  type HierarchyNode,
  type HierarchyTreeNode,
} from './chart-hierarchy.js'
import type { ChartBuildContext } from './chart-adapter.js'
import type { EchartsFeature } from './engines/echarts-loader.js'
import type { ChartFrame, ChartPointEventDetail, ChartSeriesConfig, ChartTooltipContext } from './chart-types.js'
import './chart-series.js'

/** One segment of the sunburst (a leaf or a group), as the tooltip, the events and `nodes` describe it. */
export type SunburstNode = HierarchyNode

/** What `renderTooltip`, the `tooltip-change` event and a linked `c2-chart-tooltip` receive. */
export interface SunburstTooltipContext extends ChartTooltipContext {
  node?: SunburstNode
}

/** Detail of `zoom-change`: the path the chart zooms to, and the group at its end (`null` for the whole). */
export interface SunburstZoomEventDetail {
  /** The names from the top level down to the new centre; empty when zooming out to the whole. */
  path: string[]
  /** The group that becomes the centre, or `null` for the whole. */
  node: SunburstNode | null
}

export interface SunburstChartEventMap extends ChartEventMap {
  'zoom-change': CustomEvent<SunburstZoomEventDetail>
}

export interface SunburstChart {
  addEventListener: TypedAddEventListener<SunburstChart, SunburstChartEventMap>
  removeEventListener: TypedRemoveEventListener<SunburstChart, SunburstChartEventMap>
}

/** Where the rings are drawn, in pixels inside the plot. */
interface SunburstGeometry {
  cx: number
  cy: number
  /** Radius of the hole. */
  hole: number
  /** Outer radius of the last ring. */
  outer: number
  /** Thickness of one ring. */
  ring: number
  /** How many rings are drawn from the current centre. */
  rings: number
  gap: number
  radius: number
}

/** One drawn segment: its ring (1 for the first) and its angles, in radians clockwise from three o'clock. */
interface SunburstArc {
  ring: number
  start: number
  end: number
  r0: number
  r1: number
}

/** The tree as the chart reads it, rebuilt only when the rows or the fields that read them change. */
interface SunburstModel {
  key: string
  data: unknown
  tree: HierarchyTreeNode[]
  /** Every node, a group before its children: the index the events carry. */
  nodes: HierarchyTreeNode[]
  /** Every top-level name in its unhidden order. */
  order: string[]
  /** Each node's place in `nodes`, by the name ECharts knows it under. */
  byName: Map<string, number>
  parents: Map<HierarchyTreeNode, HierarchyTreeNode | undefined>
}

type LabelPlacement = 'tangential' | 'radial' | null

/** Space kept free between the outer ring and the plot's edge, in pixels. */
const EDGE = 4

/** Space a segment's label keeps from the segment's edges, in pixels. */
const LABEL_INSET = 4

/** How long the arcs take to morph into a new zoom. */
const ZOOM_DURATION = 400

/** How a node is named in `highlighted` and in `series-highlight`: its path, so a top-level branch is its own name. */
function keyOf(node: HierarchyNode): string {
  return node.path.join(' › ')
}

/** An annular sector as an SVG path; a full turn is drawn as two halves, since one arc cannot close a circle. */
function arcPath(cx: number, cy: number, arc: SunburstArc): string {
  const { r0, r1 } = arc
  const sweep = Math.min(arc.end - arc.start, Math.PI * 2 - 1e-4)
  const point = (radius: number, angle: number) => `${(cx + radius * Math.cos(angle)).toFixed(2)} ${(cy + radius * Math.sin(angle)).toFixed(2)}`
  const end = arc.start + sweep
  const large = sweep > Math.PI ? 1 : 0
  const outer = `M ${point(r1, arc.start)} A ${r1.toFixed(2)} ${r1.toFixed(2)} 0 ${large} 1 ${point(r1, end)}`
  if (r0 <= 0) return `${outer} L ${point(0, 0)} Z`
  return `${outer} L ${point(r0, end)} A ${r0.toFixed(2)} ${r0.toFixed(2)} 0 ${large} 0 ${point(r0, arc.start)} Z`
}

/**
 * A sunburst: a hierarchy drawn as rings, drawn by ECharts' sunburst series. The centre is the whole, the first ring
 * splits it into its top-level branches, and each ring further out splits its parent, as disk-usage tools and budget
 * breakdowns show a tree. Rows are read the treemap's way: `label-field` names a node, the one series sizes it,
 * `children-field` nests rows and `group-field` builds groups from flat rows.
 *
 * ```html
 * <c2-sunburst-chart label-field="name" value-prefix="$" value-suffix="M"
 *   data='[{ "name": "Engineering", "children": [{ "name": "Platform", "budget": 2.1 }, { "name": "Product", "budget": 1.8 }] }, { "name": "Sales", "budget": 3.2 }]'>
 *   <c2-chart-series field="budget" label="Budget"></c2-chart-series>
 * </c2-sunburst-chart>
 * ```
 *
 * `levels` rings show from the current centre. Each top-level branch takes the next palette colour and its children
 * step lighter toward the surface, largest darkest; with `color-field`, every segment is coloured on the treemap's
 * scale around zero instead. Names are drawn where they fit, along the arc or along the radius.
 *
 * Clicking a group zooms into it: it becomes the centre, a breadcrumb appears top left and the centre turns into a
 * button that goes back up. `root` holds the zoom, and `zoomTo(path)` and `zoomOut()` drive it. Clicking a leaf fires
 * `point-click` and highlights it. Hovering a segment keeps its path to the centre and fades the rest.
 *
 * The plot is one tab stop: the left and right arrows move around a ring, down goes to the first child and up to
 * the parent, Enter zooms into a group, and Escape or Backspace zooms out. A hidden table lists every leaf.
 *
 * @tag c2-sunburst-chart
 *
 * @slotcomponent c2-chart-series
 *
 * @slot center - Replaces the text in the hole: the current centre's name and value.
 *
 * @event {CustomEvent<SunburstZoomEventDetail>} zoom-change - Fired before the chart zooms into a group or back out, from a click, the breadcrumb, the centre button, the keyboard, `zoomTo` or `zoomOut`. Cancelable: `preventDefault()` keeps the current zoom, so an app can load a branch first. Does not bubble.
 *
 * @csspart center - The hole: the box around the `center` slot, a button while zoomed.
 * @csspart breadcrumb - The path to the current centre, shown while zoomed.
 * @csspart breadcrumb-item - One entry of the breadcrumb; every entry but the last is a button.
 *
 * @cssproperty {pixel} [--c2-chart__segment--gap=1.5px] - Space between two segments, drawn in the surface colour.
 * @cssproperty {pixel} [--c2-chart__segment--border-radius=2px] - Corner radius of a segment.
 * @cssproperty {color} [--c2-chart__segment__focus--color=#0265dc] - Ring drawn around the segment the keyboard is on.
 * @cssproperty {percentage} [--c2-chart__hole--size=28%] - Radius of the hole, as a share of the chart's radius.
 * @cssproperty {color} [--c2-chart__center--background=#f4f4f5] - Fill of the hole while zoomed, when it is the button that goes back up.
 * @cssproperty {color} [--c2-chart__breadcrumb--color=#0265dc] - Colour of the breadcrumb's links.
 * @cssproperty {font-size} [--c2-chart__breadcrumb--font-size=14px] - Font size of the breadcrumb.
 * @cssproperty {color} [--c2-chart__neutral--color=#d4d4d8] - Colour of a segment whose `color-field` value is zero; the scale runs from it to the positive and negative colours.
 * @cssproperty {opacity} [--c2-chart__series__dimmed--opacity=0.25] - Opacity the other segments keep while one is hovered or highlighted.
 * @cssproperty {border} [--c2-chart__plot__focus--outline=2px solid rgba(2, 101, 220, 0.4)] - Focus ring of the plot, the chart's tab stop.
 */
@customElement('c2-sunburst-chart')
export class SunburstChart extends EchartsChartBase {
  static override styles: CSSResultGroup = [ChartBase.styles, unsafeCSS(sunburstStyles)]

  protected override readonly features: readonly EchartsFeature[] = ['sunburst']

  // A click highlight or a zoom rebuilds the options under the pointer; the redraw must land in one step.
  protected override readonly lazyEngineUpdates = false

  /** Row fields naming the groups a row belongs to, outermost first, separated by commas; each may be a dotted path. */
  @property({ type: String, attribute: 'group-field' }) groupField = ''

  /** Row field holding a row's nested rows, which turns the row into a group of them. */
  @property({ type: String, attribute: 'children-field' }) childrenField = 'children'

  /** Row field that colours the segments on a scale around zero, in place of their branch's colour. */
  @property({ type: String, attribute: 'color-field' }) colorField = ''

  /** Value at which the colour scale reaches full strength on either side of zero. Defaults to the largest value either side. */
  @property({ type: Number, attribute: 'color-max' }) colorMax?: number

  /** Name of the `color-field` measure in the tooltip and the table, such as `Change`. */
  @property({ type: String, attribute: 'color-label' }) colorLabel = ''

  /** Text appended to the `color-field` value, such as `%`. */
  @property({ type: String, attribute: 'color-suffix' }) colorSuffix = ''

  /** Formats the `color-field` value. Falls back to a signed number with `color-suffix`. Property only. */
  @property({ attribute: false }) formatColor?: (value: number) => string

  /** Text put before every value, such as `$`. A series' `format` takes precedence. */
  @property({ type: String, attribute: 'value-prefix' }) valuePrefix = ''

  /** Text put after every value, such as `k` or ` MB`. A series' `format` takes precedence. */
  @property({ type: String, attribute: 'value-suffix' }) valueSuffix = ''

  /** How many rings show from the current centre. Deeper levels come into view as the reader zooms. */
  @property({ type: Number }) levels = 3

  /** Whether segment names are drawn where they fit (`auto`) or not at all. */
  @property({ type: String }) labels: 'auto' | 'none' = 'auto'

  /** Whether the path to the current centre shows top left while zoomed. */
  @property({ type: String }) breadcrumb: 'auto' | 'none' = 'auto'

  /**
   * The group at the centre, as the names from the top level down; empty for the whole. As an attribute, a JSON array
   * (`root='["Engineering","Platform"]'`). A path that ends at a leaf, or at a name the data does not hold, centres the
   * deepest group along it.
   */
  @property({ converter: arrayPropertyConverter }) root: string[] = []

  /** Top-level branches the reader has switched off from the legend, by name. */
  @state() private hiddenGroups = new Set<string>()

  /** Bumped on every data change, so the options are rebuilt with the data. */
  @state() private dataRevision = 0

  /** The plot's size, rounded: the rings, labels and hole are laid out in pixels. Never set on a server. */
  @state() private plotSize = 0

  private readonly msg = new LocalizeController(this, sunburstMessages, () => this.locale)

  #model?: SunburstModel

  #colors?: { model: unknown; theme: unknown; scale: string; colors: Map<HierarchyTreeNode, string> }

  #sizes?: ResizeObserver
  #plotBox = { width: 0, height: 0 }

  /** The segment the keyboard is on, by engine name. Not reactive: a move only redraws the ring and the announcement. */
  #focused: string | null = null

  /** What the live region last said about a zoom, until the keyboard moves on. */
  #announcement = ''

  constructor() {
    super()
    this.tooltip = 'item'
    this.legend = 'none'
  }

  /** Every group and leaf, a group before its children and siblings largest first. For a table view or an export. */
  get nodes(): SunburstNode[] {
    return this.#computeModel().nodes.map((node) => this.#describe(node))
  }

  /**
   * Zooms so the group at `path` is the centre (an empty path zooms out to the whole). Fires `zoom-change`, and does
   * nothing when a listener cancels it. Resolves to whether the zoom changed.
   */
  zoomTo(path: readonly string[]): boolean {
    return this.#requestZoom(path)
  }

  /** Zooms out one level. Resolves to whether the zoom changed; `false` at the whole. */
  zoomOut(): boolean {
    const current = this.#viewRoot()
    if (!current) return false
    return this.#requestZoom(current.path.slice(0, -1))
  }

  /** Shows or hides one top-level branch, as the legend does. */
  setGroupVisible(name: string, visible: boolean): void {
    const next = new Set(this.hiddenGroups)
    if (visible) next.delete(name)
    else next.add(name)
    this.hiddenGroups = next
    if (!visible && this.highlighted !== null && (this.highlighted === name || this.highlighted.startsWith(`${name} › `))) this.highlight(null)
    this.notifyLegendChange()
  }

  // ------------------------------------------------------ chart overrides ---

  /** The base fast path sends the data alone; the colours, labels and rings ride on the options too. */
  protected override shouldUpdate(changed: PropertyValues): boolean {
    if (changed.has('data') || changed.has('revision')) return true
    return super.shouldUpdate(changed)
  }

  protected override willUpdate(changed: PropertyValues): void {
    if (changed.has('data') || changed.has('revision')) this.dataRevision += 1
    // An update may come with new variables (a class, a theme); a pointer move only changes the tooltip.
    if ([...changed.keys()].some((key) => key !== 'hoverContext')) this.#styleCache = undefined
    super.willUpdate(changed)
  }

  protected override get legendDependsOnData(): boolean {
    return true
  }

  protected override reshapesFrame(changed: PropertyValues): boolean {
    return super.reshapesFrame(changed) || changed.has('groupField') || changed.has('childrenField') || changed.has('colorField')
  }

  /** The value is the first numeric field that is not the colour measure. */
  protected override inferredSeries(): ChartSeriesConfig[] {
    return super
      .inferredSeries()
      .filter((series) => series.field !== this.colorField && !this.#groupFields().includes(series.field))
      .slice(0, 1)
  }

  /** One entry per top-level branch. A sunburst coloured by `color-field` has no branch colours to list. */
  protected override legendItems(): ChartLegendItem[] {
    if (this.colorField) return []
    const series = this.resolvedSeries[0] ?? { field: '' }
    return this.#computeModel().order.map((name, index) => {
      const shown = !this.hiddenGroups.has(name)
      return {
        label: name,
        color: this.#branchColor(name),
        visible: shown,
        ...this.legendEntryState(name, shown, (next) => this.setGroupVisible(name, next)),
        series,
        index,
      }
    })
  }

  /** A sunburst has no grid and no axes. */
  protected override coordinateSystem(): Record<string, unknown> {
    return {}
  }

  protected override seriesOption(_index: number, context: ChartBuildContext): Record<string, unknown> {
    const { theme } = context
    const geometry = this.#geometry(context.width, context.height)
    const animate = this.animation === 'auto' && !globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    return {
      type: 'sunburst',
      center: [geometry.cx, geometry.cy],
      radius: [geometry.hole, geometry.outer],
      startAngle: 90,
      clockwise: true,
      // The children arrive largest first already; ECharts' own sort would reorder ties.
      sort: null,
      // The component owns the zoom, so the breadcrumb, the keyboard and `root` follow one state.
      nodeClick: false,
      animationDuration: animate ? 500 : 0,
      animationDurationUpdate: animate ? ZOOM_DURATION : 0,
      animationEasingUpdate: 'cubicInOut',
      itemStyle: { borderWidth: geometry.gap, borderColor: theme.surface, borderRadius: geometry.radius },
      label: {
        show: this.labels !== 'none',
        position: 'inside',
        align: 'center',
        fontSize: theme.fontSize,
        formatter: (params: { name: string }) => this.#nodeNamed(params.name)?.label ?? '',
      },
      // Hovering a segment keeps its path to the centre and fades the rest, rather than ECharts' own darker emphasis.
      emphasis: { focus: 'ancestor', itemStyle: { shadowBlur: 0 } },
      blur: { itemStyle: { opacity: theme.dimmedOpacity }, label: { opacity: theme.dimmedOpacity } },
      // A rebuild without the tree in it would leave ECharts' sunburst laid out against nothing, so the data rides along.
      data: this.#engineData(context),
    }
  }

  protected override projectData(_frame: ChartFrame, context: ChartBuildContext): unknown {
    this.#renderAccessibleSummary()
    return [this.#engineData(context)]
  }

  protected override handleEngineHover(
    detail: { index: number; seriesIndex: number; px: number; py: number; name?: string; component?: string; dataType?: string } | null,
  ): void {
    super.handleEngineHover(detail && this.#fromEngine(detail))
  }

  /** A group zooms in; a leaf fires `point-click` and highlights it, as on the other charts. */
  protected override handleEngineClick(detail: { index: number; seriesIndex: number; name?: string; component?: string; dataType?: string }): void {
    const translated = this.#fromEngine(detail)
    if (!translated) return
    const node = this.#computeModel().nodes[translated.index]
    if (node && !node.leaf) {
      this.#requestZoom(node.path)
      return
    }
    super.handleEngineClick(translated)
  }

  protected override highlightKeyAt(detail: { index: number; seriesIndex: number }): string | undefined {
    const node = this.#computeModel().nodes[detail.index]
    return node ? keyOf(node) : undefined
  }

  protected override pointAt(index: number): ChartPointEventDetail | undefined {
    const node = this.#computeModel().nodes[index]
    const series = this.resolvedSeries[0]
    if (!node || !series) return undefined
    return { index, seriesIndex: 0, series, x: index, y: node.value, label: node.label }
  }

  protected override tooltipContextAt(detail: { index: number; seriesIndex: number; px: number; py: number }): SunburstTooltipContext {
    const node = this.#computeModel().nodes[detail.index]
    const base = { index: detail.index, x: detail.index, px: detail.px, py: detail.py }
    if (!node) return { ...base, formattedX: '', entries: [] }
    const series = this.resolvedSeries[0] ?? { field: '' }
    const color = this.#colorOf(node)
    const entry = (field: string, label: string, value: number, formatted: string) => ({
      seriesIndex: 0,
      series: { ...series, field, label },
      value,
      formatted,
      color,
    })
    const entries = [entry(series.field, series.label ?? this.msg.t('value'), node.value, this.#format(node.value))]
    if (node.colorValue !== null && this.colorField)
      entries.push(entry(this.colorField, this.colorLabel || this.colorField, node.colorValue, this.#formatColor(node.colorValue)))
    entries.push(entry('share', this.msg.t('share'), node.share, this.#percent(node.share)))
    if (node.depth > 1) {
      const parent = node.path[node.path.length - 2] ?? ''
      entries.push(entry('parent-share', this.msg.t('shareOf', parent), node.parentShare, this.#percent(node.parentShare)))
    }
    return { ...base, formattedX: this.#pathText(node.path), label: node.label, entries, node: this.#describe(node) }
  }

  // ------------------------------------------------------------ lifecycle ---

  override connectedCallback(): void {
    super.connectedCallback()
    if (typeof ResizeObserver === 'undefined') return
    this.#sizes ??= new ResizeObserver((entries) => {
      const rect = entries[entries.length - 1]?.contentRect
      if (!rect) return
      this.#plotBox = { width: rect.width, height: rect.height }
      const size = Math.round(rect.width) * 10000 + Math.round(rect.height)
      if (size !== this.plotSize) this.plotSize = size
    })
    if (this.plotElement) this.#sizes.observe(this.plotElement)
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.#sizes?.disconnect()
  }

  protected override firstUpdated(): void {
    super.firstUpdated()
    const plot = this.plotElement
    if (!plot) return
    this.#sizes?.observe(plot)
    // The plot is the chart's one tab stop. It is inside the shadow root, so nothing is written on the host.
    plot.tabIndex = 0
    plot.setAttribute('role', 'group')
    plot.addEventListener('keydown', this.#handleKeydown)
    plot.addEventListener('blur', this.#handleBlur)
  }

  protected override updated(changed: PropertyValues): void {
    super.updated(changed)
    this.#renderAccessibleSummary()
    this.#renderFocus()
    const plot = this.plotElement
    if (!plot) return
    const label = this.#summary()
    if (plot.getAttribute('aria-label') !== label) plot.setAttribute('aria-label', label)
    const roleDescription = this.msg.t('roleDescription')
    if (plot.getAttribute('aria-roledescription') !== roleDescription) plot.setAttribute('aria-roledescription', roleDescription)
  }

  /** The leaf table and the live announcement are rendered into a static container after each update, as the legend is. */
  protected override render(): TemplateResult {
    return html`${super.render()}
      <div class="sunburst-a11y-root"></div>`
  }

  /**
   * The breadcrumb and the hole. Both render on a server from `root` alone; the hole's name and value need the laid-out
   * rings, so they arrive with the first measurement, after hydration.
   */
  protected override renderOverlayExtras(): unknown {
    // Before the first measurement (and on a server) the path is `root` as written; after it, what is drawn.
    const root = this.plotSize > 0 ? this.#viewPath() : (this.root ?? [])
    const zoomed = root.length > 0
    const crumbs = zoomed && this.breadcrumb !== 'none'
    const parentName = root.length > 1 ? root[root.length - 2] : this.msg.t('root')
    const box = this.plotSize > 0 ? this.#geometry(this.#plotBox.width, this.#plotBox.height) : undefined
    const diameter = box ? Math.max(0, box.hole * 2 - box.gap) : 0
    const place = box
      ? `left:${(box.cx - diameter / 2).toFixed(1)}px;top:${(box.cy - diameter / 2).toFixed(1)}px;width:${diameter.toFixed(1)}px;height:${diameter.toFixed(1)}px`
      : ''
    const content = html`<slot name="center">${box ? this.#centerText(diameter, zoomed ? parentName : '') : nothing}</slot>`
    return html`
      ${
        crumbs
          ? html`<nav class="sunburst-breadcrumb" part="breadcrumb" aria-label=${this.msg.t('breadcrumb')}>
              <ol>
                <li>
                  <button type="button" part="breadcrumb-item" @click=${() => this.#requestZoom([])}>${this.msg.t('root')}</button>
                </li>
                ${root.map((name, index) =>
                  index === root.length - 1
                    ? html`<li><span part="breadcrumb-item" aria-current="location">${name}</span></li>`
                    : html`<li><button type="button" part="breadcrumb-item" @click=${() => this.#requestZoom(root.slice(0, index + 1))}>${name}</button></li>`,
                )}
              </ol>
            </nav>`
          : nothing
      }
      ${
        zoomed
          ? html`<button
              type="button"
              class="sunburst-center sunburst-center--back"
              part="center"
              style=${place}
              aria-label=${this.msg.t('back', parentName)}
              @click=${() => this.zoomOut()}
            >
              ${content}
            </button>`
          : html`<div class="sunburst-center" part="center" style=${place}>${content}</div>`
      }
      <svg class="sunburst-focus" aria-hidden="true"></svg>
      <span class="sunburst-probe" aria-hidden="true"><i class="gap"></i><i class="radius"></i><i class="crumb"></i></span>
    `
  }

  // ------------------------------------------------------------ internals ---

  /** The hole's own text: the centre's name and value, and the way back while zoomed. Drops what the hole cannot hold. */
  #centerText(diameter: number, backTo: string): unknown {
    if (diameter < 40) return nothing
    const view = this.#viewRoot()
    const value = view ? view.value : this.#computeModel().tree.reduce((sum, node) => sum + node.value, 0)
    if (value <= 0) return nothing
    const name = view ? view.label : this.msg.t('total')
    const size = Math.max(11, Math.min(28, diameter * 0.17))
    return html`<span class="sunburst-center-text" aria-hidden=${backTo ? 'true' : 'false'}>
      ${backTo && diameter >= 104 ? html`<span class="sunburst-center-back">↑ ${this.msg.t('back', backTo)}</span>` : nothing}
      ${diameter >= 76 ? html`<span class="sunburst-center-label">${name}</span>` : nothing}
      <span class="sunburst-center-value" style="font-size:${size.toFixed(1)}px">${this.#format(value)}</span>
    </span>`
  }

  /** A node as the public API hands it out: without its children, and with a path of its own. */
  #describe({ children: _children, ...node }: HierarchyTreeNode): SunburstNode {
    return { ...node, path: [...node.path] }
  }

  #summary(): string {
    const series = this.resolvedSeries[0]
    const leaves = this.#computeModel().nodes.filter((node) => node.leaf).length
    return this.msg.t('summary', series?.label ?? series?.field ?? '', String(leaves))
  }

  #pathText(path: readonly string[]): string {
    return path.reduce((text, part) => (text ? this.msg.t('path', text, part) : part), '')
  }

  #renderAccessibleSummary(): void {
    const root = this.renderRoot?.querySelector<HTMLElement>('.sunburst-a11y-root')
    if (!root) return
    const leaves = this.#computeModel().nodes.filter((node) => node.leaf)
    const grouped = leaves.some((node) => node.depth > 1)
    const colored = Boolean(this.colorField)
    const series = this.resolvedSeries[0]
    const focused = this.#focusedNode()
    let announcement = this.#announcement
    if (focused) {
      const path = this.#pathText(focused.path)
      announcement = focused.leaf
        ? this.msg.t('leafAnnouncement', path, this.#format(focused.value), this.#percent(focused.share))
        : this.msg.t('groupAnnouncement', path, this.#format(focused.value), this.#percent(focused.share), String(focused.children.length))
      if (this.#announcement) announcement = `${this.#announcement}. ${announcement}`
    }
    render(
      html`
        ${
          leaves.length > 0
            ? html`
                <table class="sunburst-a11y">
                  <caption>
                    ${this.#summary()}
                  </caption>
                  <thead>
                    <tr>
                      ${grouped ? html`<th scope="col">${this.msg.t('group')}</th>` : nothing}
                      <th scope="col">${this.msg.t('name')}</th>
                      <th scope="col">${series?.label ?? this.msg.t('value')}</th>
                      ${colored ? html`<th scope="col">${this.colorLabel || this.colorField}</th>` : nothing}
                      <th scope="col">${this.msg.t('share')}</th>
                      ${grouped ? html`<th scope="col">${this.msg.t('shareOfGroup')}</th>` : nothing}
                    </tr>
                  </thead>
                  <tbody>
                    ${leaves.map(
                      (node) => html`
                        <tr>
                          ${grouped ? html`<td>${this.#pathText(node.path.slice(0, -1))}</td>` : nothing}
                          <th scope="row">${node.label}</th>
                          <td>${this.#format(node.value)}</td>
                          ${colored ? html`<td>${node.colorValue === null ? '—' : this.#formatColor(node.colorValue)}</td>` : nothing}
                          <td>${this.#percent(node.share)}</td>
                          ${grouped ? html`<td>${node.depth > 1 ? this.#percent(node.parentShare) : '—'}</td>` : nothing}
                        </tr>
                      `,
                    )}
                  </tbody>
                </table>
              `
            : nothing
        }
        <div class="sunburst-a11y" aria-live="polite">${announcement || nothing}</div>
      `,
      root,
      { host: this },
    )
  }

  /** The ring around the segment the keyboard is on, drawn over the canvas. */
  #renderFocus(): void {
    const layer = this.renderRoot?.querySelector<SVGSVGElement>('.sunburst-focus')
    if (!layer) return
    const node = this.#focusedNode()
    const { width, height } = this.#plotBox
    const geometry = width > 0 && height > 0 ? this.#geometry(width, height) : undefined
    const arc = node && geometry ? this.#arcs(geometry).get(node) : undefined
    render(arc && geometry ? svg`<path class="sunburst-focus-ring" d=${arcPath(geometry.cx, geometry.cy, arc)}></path>` : nothing, layer, { host: this })
  }

  #computeModel(): SunburstModel {
    const valueField = this.resolvedSeries[0]?.field ?? ''
    const key = [this.revision, this.labelField, valueField, this.groupField, this.childrenField, this.colorField, [...this.hiddenGroups].join('\u0000')].join(
      '|',
    )
    if (this.#model && this.#model.key === key && this.#model.data === this.data) return this.#model
    const rows = Array.isArray(this.data) ? (this.data as unknown[]) : []
    const options = {
      labelField: this.labelField,
      valueField,
      groupFields: this.#groupFields(),
      childrenField: this.childrenField,
      colorField: this.colorField,
    }
    const tree = buildHierarchy(rows, { ...options, hidden: this.hiddenGroups })
    // Every top-level name in its unhidden order: a branch's palette slot and legend place stay put while others are hidden.
    const order = this.hiddenGroups.size === 0 ? tree.map((node) => node.label) : buildHierarchy(rows, options).map((node) => node.label)
    const nodes = preorderHierarchy(tree)
    const parents = new Map<HierarchyTreeNode, HierarchyTreeNode | undefined>()
    const link = (children: HierarchyTreeNode[], parent: HierarchyTreeNode | undefined) => {
      for (const child of children) {
        parents.set(child, parent)
        link(child.children, child)
      }
    }
    link(tree, undefined)
    this.#model = { key, data: this.data, tree, nodes, order, byName: new Map(nodes.map((node, index) => [hierarchyEngineName(node), index])), parents }
    return this.#model
  }

  /**
   * The path to the group drawn at the centre: the deepest group along `root` the data holds. `root` itself is kept as
   * the author set it, so a branch that arrives later (lazy data, a legend toggle) is zoomed into once it exists.
   * Without data yet, `root` as written.
   */
  #viewPath(): string[] {
    if (this.#computeModel().nodes.length === 0) return [...(this.root ?? [])]
    return this.#viewRoot()?.path ?? []
  }

  /** The group at the centre, or `undefined` for the whole. */
  #viewRoot(): HierarchyTreeNode | undefined {
    return this.root?.length ? findHierarchyNode(this.#computeModel().tree, this.root, true) : undefined
  }

  /** The nodes on the first ring. */
  #viewNodes(): HierarchyTreeNode[] {
    return this.#viewRoot()?.children ?? this.#computeModel().tree
  }

  #nodeNamed(name: string | undefined): HierarchyTreeNode | undefined {
    const index = name === undefined ? undefined : this.#computeModel().byName.get(name)
    return index === undefined ? undefined : this.#computeModel().nodes[index]
  }

  /** An engine hover or click, indexed by the node's place in `nodes`; `null` when it names no node. */
  #fromEngine<T extends { index: number; name?: string }>(detail: T): T | null {
    if (detail.name === undefined) return detail
    const index = this.#computeModel().byName.get(detail.name)
    return index === undefined ? null : { ...detail, index }
  }

  #focusedNode(): HierarchyTreeNode | undefined {
    const node = this.#nodeNamed(this.#focused ?? undefined)
    // A segment zoomed or legend-toggled out of view cannot hold the focus.
    return node && this.#arcsNow().has(node) ? node : undefined
  }

  // -------------------------------------------------------------- geometry ---

  #styleCache?: { gap: number; radius: number; hole: number; crumb: number }

  /**
   * The layout variables in pixels. The lengths are read from probes sized by them, so any unit (`rem`, `em`, `calc()`)
   * resolves; the hole is a share, read from its percentage. Read once per update.
   */
  #style(): { gap: number; radius: number; hole: number; crumb: number } {
    if (this.#styleCache) return this.#styleCache
    const probe = (name: string) => this.renderRoot?.querySelector<HTMLElement>(`.sunburst-probe > .${name}`)
    const pixels = (name: string, fallback: number, read: (element: HTMLElement) => number) => {
      const element = probe(name)
      const value = element?.isConnected ? read(element) : Number.NaN
      return Number.isFinite(value) && value >= 0 ? value : fallback
    }
    const width = (element: HTMLElement) => element.getBoundingClientRect().width
    const holeText = getComputedStyle(this).getPropertyValue('--_hole-size').trim()
    const holeValue = parseFloat(holeText)
    const hole = Number.isFinite(holeValue) ? (holeText.endsWith('%') || holeValue > 1 ? holeValue / 100 : holeValue) : 0.28
    const style = {
      gap: pixels('gap', 1.5, width),
      radius: pixels('radius', 2, width),
      hole: Math.min(0.9, Math.max(0, hole)),
      crumb: pixels('crumb', 14, (element) => parseFloat(getComputedStyle(element).fontSize)),
    }
    // Only cached once the probes exist, so a read before the first render does not stick.
    if (probe('gap')?.isConnected) this.#styleCache = style
    return style
  }

  #geometry(width: number, height: number): SunburstGeometry {
    const style = this.#style()
    // The breadcrumb takes a strip across the top while zoomed; the rings sit below it.
    const inset = this.#viewPath().length > 0 && this.breadcrumb !== 'none' ? Math.ceil(style.crumb * 1.5) + 8 : 0
    const outer = Math.max(0, Math.min(width, height - inset) / 2 - EDGE)
    const hole = outer * style.hole
    const rings = Math.min(Math.max(1, Math.trunc(this.levels) || 1), hierarchyHeight(this.#viewNodes()))
    return {
      cx: width / 2,
      cy: inset + (height - inset) / 2,
      hole,
      outer,
      ring: rings > 0 ? (outer - hole) / rings : 0,
      rings,
      gap: style.gap,
      radius: style.radius,
    }
  }

  #arcCache?: { key: string; model: unknown; arcs: Map<HierarchyTreeNode, SunburstArc> }

  /** Where every drawn segment sits, as ECharts lays it out: clockwise from twelve o'clock, each child from its parent's start. */
  #arcs(geometry: SunburstGeometry): Map<HierarchyTreeNode, SunburstArc> {
    const model = this.#computeModel()
    const key = [geometry.cx, geometry.cy, geometry.hole, geometry.outer, geometry.rings, this.#viewPath().join('\u001f')].join('|')
    if (this.#arcCache && this.#arcCache.key === key && this.#arcCache.model === model) return this.#arcCache.arcs
    const arcs = new Map<HierarchyTreeNode, SunburstArc>()
    const nodes = this.#viewNodes()
    const total = nodes.reduce((sum, node) => sum + node.value, 0)
    const unit = total > 0 ? (Math.PI * 2) / total : 0
    const place = (children: HierarchyTreeNode[], ring: number, start: number) => {
      if (ring > geometry.rings) return
      let at = start
      for (const node of children) {
        const end = at + node.value * unit
        arcs.set(node, { ring, start: at, end, r0: geometry.hole + (ring - 1) * geometry.ring, r1: geometry.hole + ring * geometry.ring })
        place(node.children, ring + 1, at)
        at = end
      }
    }
    place(nodes, 1, -Math.PI / 2)
    this.#arcCache = { key, model, arcs }
    return arcs
  }

  /** The arcs at the plot's current size. */
  #arcsNow(): Map<HierarchyTreeNode, SunburstArc> {
    const { width, height } = this.#plotBox
    return this.#arcs(this.#geometry(width, height))
  }

  /**
   * Whether a name fits its segment, and which way: along the arc where it can (the first ring and wide arcs), else
   * along the radius (narrow, deep arcs), else not at all. The tooltip still names a segment left blank.
   */
  #placement(label: string, arc: SunburstArc, geometry: SunburstGeometry, font: string, fontSize: number): LabelPlacement {
    if (!label) return null
    const width = measureText(label, font, fontSize)
    const thickness = arc.r1 - arc.r0 - geometry.gap
    const angle = arc.end - arc.start
    const middle = (arc.r0 + arc.r1) / 2
    // The straight line a tangential label sits on is a chord of the arc through the middle of the ring, shortened
    // where it nears the inner edge.
    const chord = 2 * (middle - fontSize / 2) * Math.sin(Math.min(angle, Math.PI) / 2) - geometry.gap
    if (thickness >= fontSize + LABEL_INSET && chord >= width + LABEL_INSET * 2) return 'tangential'
    const across = 2 * arc.r0 * Math.sin(Math.min(angle, Math.PI) / 2) - geometry.gap
    if (thickness >= width + LABEL_INSET * 2 && across >= fontSize + 2) return 'radial'
    return null
  }

  // ------------------------------------------------------------ engine data ---

  #engineCache?: { key: string; model: unknown; theme: unknown; colors: unknown; data: Record<string, unknown>[] }

  /**
   * The tree as ECharts draws it, with every label fitted. The option build and the data push of one update ask for it
   * with the same inputs, so it is built (and its names measured) once and handed out twice.
   */
  #engineData(context: ChartBuildContext): Record<string, unknown>[] {
    const model = this.#computeModel()
    const colors = this.#colorMap()
    const key = [
      context.width,
      context.height,
      this.highlighted,
      this.labels,
      this.levels,
      this.#viewPath().join('\u001f'),
      JSON.stringify(this.#style()),
    ].join('|')
    const cached = this.#engineCache
    if (cached && cached.key === key && cached.model === model && cached.theme === context.theme && cached.colors === colors) return cached.data
    const data = this.#buildEngineData(context)
    this.#engineCache = { key, model, theme: context.theme, colors, data }
    return data
  }

  #buildEngineData(context: ChartBuildContext): Record<string, unknown>[] {
    const { theme } = context
    const geometry = this.#geometry(context.width, context.height)
    const arcs = this.#arcs(geometry)
    const colors = this.#colorMap()
    const highlighted = this.highlighted === null ? null : (this.#computeModel().nodes.find((node) => keyOf(node) === this.highlighted) ?? null)
    const font = (weight: number) => `${weight} ${theme.fontSize}px ${theme.fontFamily === 'inherit' ? 'system-ui, sans-serif' : theme.fontFamily}`
    const lit = (node: HierarchyTreeNode) => {
      if (!highlighted) return true
      const [short, long] = node.path.length <= highlighted.path.length ? [node.path, highlighted.path] : [highlighted.path, node.path]
      return short.every((name, index) => long[index] === name)
    }
    const build = (nodes: HierarchyTreeNode[], ring: number): Record<string, unknown>[] =>
      nodes.map((node) => {
        const color = colors.get(node) ?? theme.palette[0]
        const opacity = lit(node) ? 1 : theme.dimmedOpacity
        const arc = arcs.get(node)
        const weight = ring === 1 ? 600 : 400
        const placement = this.labels === 'none' || !arc || geometry.ring <= 0 ? null : this.#placement(node.label, arc, geometry, font(weight), theme.fontSize)
        const item: Record<string, unknown> = {
          name: hierarchyEngineName(node),
          value: node.value,
          itemStyle: { color, opacity },
          label: placement ? { show: true, rotate: placement, color: readableOn(color), fontWeight: weight, opacity } : { show: false, rotate: 'tangential' },
        }
        if (ring < geometry.rings && node.children.length > 0) item.children = build(node.children, ring + 1)
        return item
      })
    return build(this.#viewNodes(), 1)
  }

  /**
   * Each node's colour. A top-level branch takes its palette colour, and each child steps lighter toward the surface
   * than its parent, siblings in order so the largest is darkest. Worked out on the whole tree, so a zoomed node keeps
   * its colour. With `color-field`, every node is placed on the scale around zero instead.
   */
  #colorMap(): Map<HierarchyTreeNode, string> {
    const model = this.#computeModel()
    const theme = this.themeController.theme
    const scale = this.#colorScale()
    const scaleKey = `${scale.neutral}|${scale.limit}|${this.resolvedSeries[0]?.color ?? ''}`
    if (this.#colors && this.#colors.model === model && this.#colors.theme === theme && this.#colors.scale === scaleKey) return this.#colors.colors
    const colors = new Map<HierarchyTreeNode, string>()
    const paint = (nodes: HierarchyTreeNode[], strength: number, base: string | undefined) => {
      nodes.forEach((node, index) => {
        if (this.colorField) {
          const value = node.colorValue
          const amount = value === null || scale.limit <= 0 ? 0 : Math.min(1, Math.abs(value) / scale.limit)
          colors.set(node, value === null ? scale.neutral : mixColors(scale.neutral, value < 0 ? theme.negative : theme.positive, amount))
          paint(node.children, 1, undefined)
          return
        }
        const color = base ?? this.#branchColor(node.label)
        const own = base === undefined ? 1 : Math.max(0.22, strength * (0.9 - (0.42 * index) / Math.max(2, nodes.length)))
        colors.set(node, own >= 1 ? color : mixColors(theme.surface, color, own))
        paint(node.children, own, color)
      })
    }
    paint(model.tree, 1, undefined)
    this.#colors = { model, theme, scale: scaleKey, colors }
    return colors
  }

  #colorOf(node: HierarchyTreeNode): string {
    return this.#colorMap().get(node) ?? this.#branchColor(node.path[0] ?? node.label)
  }

  /** What the `color-field` colours are read against, worked out once per build. */
  #colorScale(): { neutral: string; limit: number } {
    if (!this.colorField) return { neutral: '', limit: 0 }
    return { neutral: this.themeController.resolveColor('var(--c2-chart__neutral--color, #d4d4d8)', '#d4d4d8'), limit: this.#colorLimit() }
  }

  #colorLimit(): number {
    if (this.colorMax !== undefined && Number.isFinite(this.colorMax) && this.colorMax > 0) return this.colorMax
    let largest = 0
    for (const node of this.#computeModel().nodes) if (node.leaf && node.colorValue !== null) largest = Math.max(largest, Math.abs(node.colorValue))
    return largest
  }

  /** A top-level branch's palette colour, which stays with its name when others are hidden. */
  #branchColor(name: string): string {
    const theme = this.themeController.theme
    const series = this.resolvedSeries[0]
    const order = this.#computeModel().order
    // One top-level branch takes the series colour, as a one-series chart does.
    if (order.length === 1 && series?.color) return series.color
    const index = Math.max(0, order.indexOf(name))
    return theme.palette[index % theme.palette.length]
  }

  #groupFields(): string[] {
    return this.groupField
      .split(',')
      .map((field) => field.trim())
      .filter(Boolean)
  }

  // ------------------------------------------------------------------ zoom ---

  /** Fires `zoom-change` and, unless a listener cancels it, centres the group at `path`. */
  #requestZoom(path: readonly string[]): boolean {
    const model = this.#computeModel()
    const target = path.length > 0 ? findHierarchyNode(model.tree, path, true) : undefined
    const next = target?.path ?? []
    const current = this.#viewRoot()?.path ?? []
    if (next.length === current.length && next.every((name, index) => name === current[index])) return false
    const detail: SunburstZoomEventDetail = { path: [...next], node: target ? this.#describe(target) : null }
    const event = new CustomEvent<SunburstZoomEventDetail>('zoom-change', { detail, cancelable: true })
    this.dispatchEvent(event)
    if (event.defaultPrevented) return false
    const total = model.tree.reduce((sum, item) => sum + item.value, 0)
    this.#announcement = target
      ? this.msg.t('zoomAnnouncement', this.#pathText(target.path), this.#format(target.value))
      : this.msg.t('zoomOutAnnouncement', this.#format(total))
    // The keyboard follows the zoom: zooming out lands on the branch it came out of (now on the first ring), zooming in
    // on the new centre's first child.
    if (this.#focused !== null || this.shadowRoot?.activeElement === this.plotElement) {
      const out = next.length < current.length && next.every((name, index) => name === current[index])
      const focus = out ? findHierarchyNode(model.tree, current.slice(0, next.length + 1), true) : (target?.children[0] ?? model.tree[0])
      this.#focused = focus ? hierarchyEngineName(focus) : null
    }
    this.root = [...next]
    return true
  }

  // -------------------------------------------------------------- keyboard ---

  #handleKeydown = (event: KeyboardEvent): void => {
    const model = this.#computeModel()
    const top = this.#viewNodes()
    if (top.length === 0) return
    const arcs = this.#arcsNow()
    const current = this.#focusedNode()
    const parent = current ? model.parents.get(current) : undefined
    const siblings = current ? (parent && arcs.has(parent) ? parent.children : top) : top
    let next: HierarchyTreeNode | undefined
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowLeft': {
        if (!current) {
          next = top[0]
          break
        }
        const at = siblings.indexOf(current)
        next = siblings[(at + (event.key === 'ArrowRight' ? 1 : siblings.length - 1)) % siblings.length]
        break
      }
      case 'ArrowDown':
        next = current ? (current.children.find((child) => arcs.has(child)) ?? current) : top[0]
        break
      case 'ArrowUp':
        next = current ? (parent && arcs.has(parent) ? parent : current) : top[0]
        break
      case 'Home':
        next = siblings[0]
        break
      case 'End':
        next = siblings[siblings.length - 1]
        break
      case 'Enter':
      case ' ': {
        if (!current) return
        event.preventDefault()
        if (!current.leaf) this.#requestZoom(current.path)
        else super.handleEngineClick({ index: model.nodes.indexOf(current), seriesIndex: 0 })
        this.#renderAccessibleSummary()
        return
      }
      case 'Escape':
      case 'Backspace': {
        if (this.#viewRoot()) {
          event.preventDefault()
          this.zoomOut()
          return
        }
        if (event.key === 'Backspace' || (this.#focused === null && this.highlighted === null)) return
        event.preventDefault()
        this.#announcement = ''
        this.#focusNode(null)
        this.highlight(null)
        return
      }
      default:
        return
    }
    event.preventDefault()
    this.#announcement = ''
    this.#focusNode(next ?? null)
  }

  #handleBlur = (): void => {
    this.#announcement = ''
    this.#focusNode(null)
  }

  /** Moves the keyboard focus to a segment and lights its path through the engine, as a hover does. */
  #focusNode(node: HierarchyTreeNode | null): void {
    this.#focused = node ? hierarchyEngineName(node) : null
    this.#renderAccessibleSummary()
    this.#renderFocus()
    this.adapter?.dispatchAction?.({ type: 'downplay', seriesIndex: 0 })
    if (node) this.adapter?.dispatchAction?.({ type: 'highlight', seriesIndex: 0, name: hierarchyEngineName(node) })
  }

  // ------------------------------------------------------------ formatting ---

  #format(value: number): string {
    const format = this.resolvedSeries[0]?.format
    if (format) return format(value)
    return `${this.valuePrefix}${this.formatValue(value)}${this.valueSuffix}`
  }

  #formatColor(value: number): string {
    if (this.formatColor) return this.formatColor(value)
    const text = new Intl.NumberFormat(this.locale, { maximumFractionDigits: 2, signDisplay: 'exceptZero' }).format(value)
    return `${text}${this.colorSuffix}`
  }

  #percent(share: number): string {
    return new Intl.NumberFormat(this.locale, { style: 'percent', maximumFractionDigits: 1 }).format(share)
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-sunburst-chart': SunburstChart
  }
}
