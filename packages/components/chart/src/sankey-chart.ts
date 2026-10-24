import { html, nothing, render, unsafeCSS, type CSSResultGroup, type PropertyValues, type TemplateResult } from 'lit'
import { state } from 'lit/decorators.js'
import { property, jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { getFieldValue } from '@c2n/core/data-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import sankeyStyles from './sankey-chart.scss?inline'
import { ChartBase, type ChartEventMap, type ChartLegendItem } from './chart-base.js'
import { EchartsChartBase } from './echarts-chart-base.js'
import { measureText } from './chart-measure.js'
import { sankeyMessages } from './messages.js'
import type { ChartAdapter, ChartBuildContext } from './chart-adapter.js'
import type { EchartsFeature } from './engines/echarts-loader.js'
import type { ChartFrame, ChartPointEventDetail, ChartSeriesConfig, ChartTooltipContext } from './chart-types.js'

/** One entry of `nodes`: what the rows cannot say about a node. Every field but `id` is optional. */
export interface SankeyNodeConfig {
  /** The node's key: the value its rows carry in `source-field` or `target-field`. */
  id: string
  /** The name drawn and announced in place of the key. */
  label?: string
  /** A CSS colour, `var()` included, in place of the node's palette colour. */
  color?: string
  /** The column the node is drawn in, counted from `0`, in place of the one `node-align` gives it. */
  column?: number
}

/** One node, as `node-hover` and `node-click` report it and the tooltip describes it. */
export interface SankeyNodeDetail {
  /** The node's key: the value its rows carry in `source-field` or `target-field`. */
  key: string
  /** The name drawn for the node: its `nodes` label, or its key. */
  label: string
  /** Sum of the flows reaching the node. */
  incoming: number
  /** Sum of the flows leaving the node. */
  outgoing: number
  /** The larger of `incoming` and `outgoing`, which is what the node's length encodes. */
  value: number
  /** The column the node is drawn in, counted from `0`. */
  column: number
  /** `value` as a share of everything that enters the diagram, from 0 to 1. */
  share: number
}

/** One link (a flow from one node to the next), as `link-hover` and `link-click` report it. */
export interface SankeyLinkDetail {
  source: string
  target: string
  /** The flow from `source` to `target`, with duplicate rows summed. */
  value: number
  /** `value` as a share of everything leaving `source`, from 0 to 1. */
  shareOfSource: number
  /** `value` as a share of everything that enters the diagram, from 0 to 1. */
  share: number
}

/** What `renderTooltip`, the `tooltip-change` event and a linked `c2-chart-tooltip` receive. */
export interface SankeyTooltipContext extends ChartTooltipContext {
  node?: SankeyNodeDetail
  link?: SankeyLinkDetail
}

/** Events of `c2-sankey-chart`, keyed for `addEventListener`: the shared chart events plus the node and link events. */
export interface SankeyChartEventMap extends ChartEventMap {
  'node-hover': CustomEvent<SankeyNodeDetail | null>
  'node-click': CustomEvent<SankeyNodeDetail>
  'link-hover': CustomEvent<SankeyLinkDetail | null>
  'link-click': CustomEvent<SankeyLinkDetail>
}

export interface SankeyChart {
  addEventListener: TypedAddEventListener<SankeyChart, SankeyChartEventMap>
  removeEventListener: TypedRemoveEventListener<SankeyChart, SankeyChartEventMap>
}

/** Which column a node lands in when `nodes` does not fix it. */
export type SankeyNodeAlign = 'justify' | 'left' | 'right'

/** What a hovered or highlighted node or link lights up. */
export type SankeyEmphasis = 'adjacency' | 'trajectory'

/** One node as the engine receives it. */
interface SankeyEngineNode {
  name: string
  depth: number
  itemStyle: { color: string; opacity?: number }
  label: { position: string; formatter: () => string; width?: number; overflow?: 'truncate'; ellipsis?: string }
}

/** One link as the engine receives it. */
interface SankeyEngineLink {
  source: string
  target: string
  value: number
  lineStyle?: { opacity: number }
}

/** Everything the rows say once they are summed, filtered and placed. Recomputed only when one of its inputs changes. */
export interface SankeyModel {
  signature: string
  /** Every key in order of first appearance, hidden ones included: a key's palette slot never moves. */
  keys: string[]
  /** The visible nodes in order of first appearance. */
  nodes: SankeyNodeDetail[]
  /** The visible flows in row order, one per source and target pair. */
  links: { source: string; target: string; value: number }[]
  /** Everything that enters the diagram: the sum of the flows leaving the nodes nothing flows into. */
  total: number
  /** How many columns the nodes take. */
  columns: number
  /** A loop the flows form, as the keys along it with the first repeated at the end, or `null`. Nothing is drawn while there is one. */
  cycle: string[] | null
}

/** Space between a node and its label, in pixels. */
const LABEL_DISTANCE = 6

/** Space kept free on every side of the plot, in pixels. */
const EDGE = 4

/**
 * A sankey diagram: quantities moving through stages, drawn by ECharts' sankey series. One row is one flow, read
 * through `source-field`, `target-field` and `value-field`; each node is a bar whose length is the larger of what
 * reaches it and what leaves it, and each flow is a band from one node to the next, as wide as the flow.
 *
 * Nodes are placed in columns by the longest path that reaches them (`node-align` decides where the ends go), and
 * the optional `nodes` list renames, recolours or pins a node to a column. A sankey cannot draw a loop: when the
 * flows form one, nothing is drawn and the error state names it.
 *
 * ```html
 * <c2-sankey-chart source-field="from" target-field="to" value-field="amount"
 *   data='[{ "from": "Revenue", "to": "Gross profit", "amount": 690 }, { "from": "Revenue", "to": "Cost of revenue", "amount": 330 }]'>
 * </c2-sankey-chart>
 * ```
 *
 * Hovering a node or a link emphasises it and, under `emphasis="trajectory"`, every flow upstream and downstream of it.
 * Clicking a node highlights it (the key goes to `highlighted`, and `series-highlight` fires); a second click clears
 * it. The plot is one tab stop: the up and down arrows move within a column, left and right follow the largest flow
 * to the previous or next column, Enter highlights and Escape clears.
 *
 * @tag c2-sankey-chart
 *
 * @event {CustomEvent<SankeyNodeDetail | null>} node-hover - Fired when the pointer enters a node, and with `null` when it leaves. Does not bubble.
 * @event {CustomEvent<SankeyNodeDetail>} node-click - Fired when a node is clicked or Enter is pressed on it. Cancelable: `preventDefault()` keeps the highlight as it is. Does not bubble.
 * @event {CustomEvent<SankeyLinkDetail | null>} link-hover - Fired when the pointer enters a link, and with `null` when it leaves. Does not bubble.
 * @event {CustomEvent<SankeyLinkDetail>} link-click - Fired when a link is clicked. Does not bubble.
 *
 * @cssproperty {pixel} [--c2-chart__node--width=12px] - Thickness of a node, across the direction of flow.
 * @cssproperty {pixel} [--c2-chart__node--gap=8px] - Space between two nodes in the same column.
 * @cssproperty {pixel} [--c2-chart__node--border-radius=2px] - Corner radius of a node.
 * @cssproperty {opacity} [--c2-chart__link--opacity=0.35] - Opacity of a link at rest.
 * @cssproperty {opacity} [--c2-chart__link__hover--opacity=0.7] - Opacity of the links lit by the hovered node or link.
 * @cssproperty {number} [--c2-chart__link--curveness=0.5] - How far a link bends between its two nodes, from 0 (straight) to 1.
 * @cssproperty {opacity} [--c2-chart__series__dimmed--opacity=0.25] - Opacity the nodes a highlight does not touch keep.
 * @cssproperty {border} [--c2-chart__plot__focus--outline=2px solid rgba(2, 101, 220, 0.4)] - Focus ring of the plot, the chart's tab stop.
 */
@customElement('c2-sankey-chart')
export class SankeyChart extends EchartsChartBase {
  static override styles: CSSResultGroup = [ChartBase.styles, unsafeCSS(sankeyStyles)]

  protected override readonly features: readonly EchartsFeature[] = ['sankey']

  // A click highlight rebuilds the options under the pointer; the redraw must land in one step. See `createEchartsAdapter`.
  protected override readonly lazyEngineUpdates = false

  /** Row field holding the node a flow leaves; may be a dotted path. */
  @property({ type: String, attribute: 'source-field' }) sourceField = 'source'

  /** Row field holding the node a flow reaches; may be a dotted path. */
  @property({ type: String, attribute: 'target-field' }) targetField = 'target'

  /** Row field holding the size of a flow. Rows whose value is not a positive number are left out. */
  @property({ type: String, attribute: 'value-field' }) valueField = 'value'

  /** Labels, colours and fixed columns for some nodes, by key. A node the list does not name keeps its key and palette colour. */
  @property({ converter: jsonPropertyConverter }) nodes?: SankeyNodeConfig[]

  /** Whether the flows run from left to right (the default) or from top to bottom. */
  @property({ type: String }) orient: 'horizontal' | 'vertical' = 'horizontal'

  /**
   * Which column a node lands in. `justify` (the default) starts every node at the longest path that reaches it and
   * moves the nodes nothing leaves to the last column; `left` leaves them where that path puts them; `right` places
   * every node by the longest path from it to an end, so the nodes nothing enters line up as late as they can.
   */
  @property({ type: String, attribute: 'node-align' }) nodeAlign: SankeyNodeAlign = 'justify'

  /**
   * What a hovered or highlighted node or link lights up: `adjacency` (the default), its own links and the nodes at
   * their other ends; `trajectory`, every flow upstream and downstream of it, so a whole path reads at once.
   */
  @property({ type: String }) emphasis: SankeyEmphasis = 'adjacency'

  /**
   * What colours a link: its `source` node's colour (the default), its `target` node's, or a `gradient` from one to
   * the other. It decides which end of a flow the reader can trace back, so it is behaviour, not decoration.
   */
  @property({ type: String, attribute: 'link-color' }) linkColor: 'source' | 'target' | 'gradient' = 'source'

  /**
   * Where the nodes are named. `outside` (the default) puts the first and last columns' labels outside the plot and
   * keeps room for them; `inside` turns them towards the middle, so the plot takes the whole width; `none` draws none.
   */
  @property({ type: String }) labels: 'outside' | 'inside' | 'none' = 'outside'

  /** Formats the flows in the tooltip, the events' accessible text and the table. Falls back to the chart's number format. Property only. */
  @property({ attribute: false }) format?: (value: number) => string

  /** Nodes the reader has switched off from the legend, by key. */
  @state() private hiddenNodes = new Set<string>()

  /** Bumped on every data change, so the options (the nodes and links ride on them) are rebuilt with the data. */
  @state() private dataRevision = 0

  /**
   * The node the keyboard focus is on, by key. Not reactive: moving the focus only emphasises a node through the
   * engine and updates the announcement, and a rebuild of the options would clear that emphasis again.
   */
  private focusedNode: string | null = null

  private readonly msg = new LocalizeController(this, sankeyMessages, () => this.locale)

  /** What the last engine hover was on, so leaving it fires the matching `null` event. */
  #hoverKind: 'node' | 'link' | null = null

  #model?: SankeyModel
  #modelData: unknown
  #modelNodes: unknown

  constructor() {
    super()
    // A node or a link has no x position to follow, and the labels already name every node.
    this.tooltip = 'item'
    this.legend = 'none'
  }

  // ----------------------------------------------------------- public API ---

  /** The visible nodes with their totals and columns, in order of first appearance. For a table view or an export. */
  get nodeTotals(): SankeyNodeDetail[] {
    return this.#computeModel().nodes.map((node) => ({ ...node }))
  }

  /** The visible flows, one per source and target pair, in row order. */
  get flows(): SankeyLinkDetail[] {
    return this.#computeModel()
      .links.map((link) => this.#linkDetail(link.source, link.target))
      .filter((link): link is SankeyLinkDetail => link !== undefined)
  }

  /** Shows or hides one node and every flow that touches it, as the legend does. The last two nodes stay on. */
  setNodeVisible(key: string, visible: boolean): void {
    const next = new Set(this.hiddenNodes)
    if (visible) next.delete(key)
    else {
      next.add(key)
      // Hiding a node can strand its neighbours with no flow left, so count what would still be drawn.
      if (this.#buildModel(next).nodes.length < 2) return
    }
    this.hiddenNodes = next
    if (!visible && this.highlighted === key) this.highlight(null)
    if (!visible && this.focusedNode === key) this.#focusNode(null)
    this.notifyLegendChange()
  }

  // ------------------------------------------------------ chart overrides ---

  /** Nodes are hidden by leaving them out of the data, and the label room follows the plot size. */
  protected override async createAdapter(): Promise<ChartAdapter> {
    const adapter = await super.createAdapter()
    return {
      ...adapter,
      setSeriesVisibility: () => undefined,
      // The label room and widths are in pixels; a resize does not rebuild the options, so they are pushed here.
      resize: (width, height) => {
        adapter.resize(width, height)
        if (width <= 0 || height <= 0 || this.#computeModel().cycle) return
        const context = { ...this.buildContext(), width, height }
        adapter.setOptions({ series: [{ ...this.#margins(context), data: this.#nodes(context), links: this.#links(context) }] }, 'merge')
      },
    }
  }

  /** The base fast path sends the data alone; a sankey's links, columns and label room ride on the options too. */
  protected override shouldUpdate(changed: PropertyValues): boolean {
    if (changed.has('data') || changed.has('revision')) return true
    return super.shouldUpdate(changed)
  }

  protected override willUpdate(changed: PropertyValues): void {
    // Set before the base reads `changed`, so the data change counts as a presentation change too.
    if (changed.has('data') || changed.has('revision')) this.dataRevision += 1
    super.willUpdate(changed)
  }

  protected override get legendDependsOnData(): boolean {
    return true
  }

  /** The rows are read by field; the one series is the value, so the frame has rows to count. */
  protected override inferredSeries(): ChartSeriesConfig[] {
    return [{ field: this.valueField, label: this.msg.t('flow') }]
  }

  protected override reshapesFrame(changed: PropertyValues): boolean {
    return super.reshapesFrame(changed) || changed.has('valueField')
  }

  /** A loop cannot be drawn: the error state names it instead. */
  protected override validationError(): string {
    const cycle = this.#computeModel().cycle
    return cycle ? this.msg.t('cycle', cycle.map((key) => this.#labelOf(key)).join(' → ')) : ''
  }

  /** One legend entry per drawn node, as a pie lists its slices, plus the hidden ones so they can be switched back on. */
  protected override legendItems(): ChartLegendItem[] {
    const model = this.#computeModel()
    const series = this.resolvedSeries[0] ?? { field: this.valueField }
    const drawn = new Set(model.nodes.map((node) => node.key))
    return model.keys.flatMap((key, index) => {
      const visible = !this.hiddenNodes.has(key)
      // A node stranded by hiding a neighbour, or one whose only row flows to itself, has nothing to toggle.
      if (visible && !drawn.has(key)) return []
      return {
        label: this.#labelOf(key),
        color: this.#colorOf(key),
        visible,
        ...this.legendEntryState(key, visible, (next) => this.setNodeVisible(key, next)),
        series,
        index,
      }
    })
  }

  protected override coordinateSystem(): Record<string, unknown> {
    return {}
  }

  protected override seriesOption(_index: number, context: ChartBuildContext): Record<string, unknown> {
    const { theme } = context
    const style = this.#readStyle()
    return {
      type: 'sankey',
      orient: this.orient,
      nodeAlign: this.nodeAlign,
      nodeWidth: style.nodeWidth,
      nodeGap: style.nodeGap,
      // Dragging has no keyboard equivalent, and a dragged node would not go back when the highlight changes.
      draggable: false,
      layoutIterations: 32,
      ...this.#margins(context),
      itemStyle: { borderWidth: 0, borderRadius: style.radius },
      lineStyle: { color: this.linkColor, opacity: style.linkOpacity, curveness: style.curveness },
      label: {
        show: this.labels !== 'none',
        distance: LABEL_DISTANCE,
        color: theme.color,
        fontSize: theme.fontSize,
        fontFamily: theme.fontFamily === 'inherit' ? undefined : theme.fontFamily,
        // A label drawn over the links keeps a halo of the chart surface, so it reads on any band.
        textBorderColor: theme.surface,
        textBorderWidth: 2,
      },
      labelLayout: { hideOverlap: true },
      emphasis: { focus: this.emphasis, lineStyle: { opacity: style.hoverOpacity } },
      // The engine's own blur is how hover dims the rest; match it to the documented dimmed opacity.
      blur: { itemStyle: { opacity: theme.dimmedOpacity }, lineStyle: { opacity: theme.dimmedOpacity * style.linkOpacity } },
      // Nodes and links travel together: a link naming a node the engine does not have yet would be dropped.
      data: this.#nodes(context),
      links: this.#links(context),
    }
  }

  /** One series, so the series list is always exactly the sankey. */
  protected override buildOptions(context: ChartBuildContext): unknown {
    const options = super.buildOptions(context) as { series?: Record<string, unknown>[] }
    // The base class dims every series but the highlighted one; a sankey's highlight is a node, handled per datum.
    return { ...options, series: [{ name: 'sankey', ...this.seriesOption(0, context) }] }
  }

  /** The nodes are the series' data. The links ride on the series option, which every data change rebuilds. */
  protected override projectData(_frame: ChartFrame, context: ChartBuildContext): unknown {
    // `updateData()` and a data source reach the engine through here alone, without rebuilding the options: the links
    // go with the nodes, or the engine would draw the new nodes against the old links.
    this.#model = undefined
    const nodes = this.#nodes(context)
    this.adapter?.setOptions({ series: [{ data: nodes, links: this.#links(context) }] }, 'merge')
    // That path also skips Lit's update, so the flow table is refreshed here too.
    this.#renderAccessibleSummary()
    return [nodes]
  }

  /** A highlight names a node; nothing else on the chart is highlighted by a click. */
  protected override highlightKeyAt(): string | undefined {
    return undefined
  }

  /** A node or a link is not a point on a series: the node and link events fire instead. */
  protected override pointAt(): ChartPointEventDetail | undefined {
    return undefined
  }

  protected override tooltipContextAt(detail: { index: number; seriesIndex: number; px: number; py: number; dataType?: string }): SankeyTooltipContext {
    const base = { index: detail.index, x: detail.index, entries: [], px: detail.px, py: detail.py }
    if (detail.dataType === 'edge') {
      const link = this.#linkAt(detail.index)
      return link ? { ...base, formattedX: this.msg.t('flowName', this.#labelOf(link.source), this.#labelOf(link.target)), link } : { ...base, formattedX: '' }
    }
    const node = this.#computeModel().nodes[detail.index]
    return node ? { ...base, formattedX: node.label, node: { ...node } } : { ...base, formattedX: '' }
  }

  protected override handleEngineHover(detail: { index: number; seriesIndex: number; px: number; py: number; dataType?: string } | null): void {
    const previous = this.#hoverKind
    const kind = detail ? (detail.dataType === 'edge' ? 'link' : 'node') : null
    const node = kind === 'node' && detail ? this.#computeModel().nodes[detail.index] : undefined
    const link = kind === 'link' && detail ? this.#linkAt(detail.index) : undefined
    // Straight from a node to a link, or back, with no leave in between: the first one is left before the second is entered.
    if (previous === 'node' && kind !== 'node') this.dispatchEvent(new CustomEvent<SankeyNodeDetail | null>('node-hover', { detail: null }))
    if (previous === 'link' && kind !== 'link') this.dispatchEvent(new CustomEvent<SankeyLinkDetail | null>('link-hover', { detail: null }))
    this.#hoverKind = node ? 'node' : link ? 'link' : null
    super.handleEngineHover(node || link ? detail : null)
    if (node) this.dispatchEvent(new CustomEvent<SankeyNodeDetail | null>('node-hover', { detail: { ...node } }))
    if (link) this.dispatchEvent(new CustomEvent<SankeyLinkDetail | null>('link-hover', { detail: link }))
  }

  protected override handleEngineClick(detail: { index: number; seriesIndex: number; dataType?: string }): void {
    if (detail.dataType === 'edge') {
      const link = this.#linkAt(detail.index)
      if (link) this.dispatchEvent(new CustomEvent<SankeyLinkDetail>('link-click', { detail: link }))
      return
    }
    const node = this.#computeModel().nodes[detail.index]
    if (node) this.#activate(node)
  }

  protected override defaultTooltip(context: SankeyTooltipContext): TemplateResult {
    const row = (label: string, value: string, color?: string) => html`
      <div class="tooltip-row">
        ${color ? html`<span class="tooltip-marker" style="background:${color}"></span>` : nothing}
        <span class="tooltip-label">${label}</span>
        <span class="tooltip-value">${value}</span>
      </div>
    `
    const { node, link } = context
    if (node) {
      return html`
        <div class="tooltip-title">${node.label}</div>
        ${node.incoming > 0 ? row(this.msg.t('incoming'), this.#formatFlow(node.incoming)) : nothing}
        ${node.outgoing > 0 ? row(this.msg.t('outgoing'), this.#formatFlow(node.outgoing)) : nothing} ${row(this.msg.t('share'), this.#formatShare(node.share))}
      `
    }
    if (link) {
      const source = this.#labelOf(link.source)
      return html`
        ${row(this.msg.t('flowName', source, this.#labelOf(link.target)), this.#formatFlow(link.value), this.#colorOf(this.linkColor === 'target' ? link.target : link.source))}
        ${row(this.msg.t('shareOfSource', source), this.#formatShare(link.shareOfSource))} ${row(this.msg.t('share'), this.#formatShare(link.share))}
      `
    }
    return super.defaultTooltip(context)
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
  }

  protected override updated(changed: PropertyValues): void {
    super.updated(changed)
    this.#renderAccessibleSummary()
    const plot = this.plotElement
    if (!plot) return
    const label = this.msg.t(
      'summary',
      this.#computeModel()
        .nodes.map((node) => node.label)
        .join(', '),
    )
    if (plot.getAttribute('aria-label') !== label) plot.setAttribute('aria-label', label)
    const roleDescription = this.msg.t('roleDescription')
    if (plot.getAttribute('aria-roledescription') !== roleDescription) plot.setAttribute('aria-roledescription', roleDescription)
  }

  /**
   * The flow table and the live announcement are rendered into a static container after each update rather than in
   * this template, for the reason the legend is: a server cannot see the rows' meaning, and hydration would keep
   * whatever it rendered.
   */
  protected override render(): TemplateResult {
    return html`${super.render()}
      <div class="sankey-a11y-root"></div>`
  }

  // ------------------------------------------------------------ internals ---

  #activate(node: SankeyNodeDetail): void {
    const event = new CustomEvent<SankeyNodeDetail>('node-click', { detail: { ...node }, cancelable: true })
    this.dispatchEvent(event)
    if (event.defaultPrevented) return
    this.highlight(this.highlighted === node.key ? null : node.key)
  }

  #handleKeydown = (event: KeyboardEvent): void => {
    const model = this.#computeModel()
    if (model.nodes.length === 0 || model.cycle) return
    // Reading order: column by column, each top to bottom as the engine placed it (it reorders a column to keep the
    // bands from crossing), or in data order before it has.
    const across = (node: SankeyNodeDetail) => {
      const layout = this.adapter?.itemLayout?.(0, model.nodes.indexOf(node))
      return layout ? (this.orient === 'vertical' ? layout.x : layout.y) : model.nodes.indexOf(node)
    }
    const walk = [...model.nodes].sort((a, b) => a.column - b.column || across(a) - across(b))
    const current = model.nodes.find((node) => node.key === this.focusedNode)
    let next: SankeyNodeDetail | undefined
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        if (!current) {
          next = walk[0]
          break
        }
        const column = walk.filter((node) => node.column === current.column)
        const at = column.indexOf(current)
        next = column[(at + (event.key === 'ArrowDown' ? 1 : column.length - 1)) % column.length]
        break
      }
      case 'ArrowRight':
      case 'ArrowLeft': {
        if (!current) {
          next = walk[0]
          break
        }
        next = this.#neighbour(current, event.key === 'ArrowRight' ? 1 : -1, walk)
        // At the first or last column there is nowhere to go; the focus stays.
        if (!next) next = current
        break
      }
      case 'Home':
        next = walk[0]
        break
      case 'End':
        next = walk[walk.length - 1]
        break
      case 'Enter':
      case ' ': {
        if (!current) return
        event.preventDefault()
        this.#activate(current)
        return
      }
      case 'Escape':
        if (this.focusedNode === null && this.highlighted === null) return
        event.preventDefault()
        this.#focusNode(null)
        this.highlight(null)
        return
      default:
        return
    }
    event.preventDefault()
    this.#focusNode(next ?? null)
  }

  /** The node along the largest flow in `direction`, or else the first node of the nearest column that way. */
  #neighbour(node: SankeyNodeDetail, direction: 1 | -1, walk: SankeyNodeDetail[]): SankeyNodeDetail | undefined {
    const model = this.#computeModel()
    let best: { key: string; value: number } | undefined
    for (const link of model.links) {
      const key = direction === 1 ? (link.source === node.key ? link.target : null) : link.target === node.key ? link.source : null
      if (key !== null && (!best || link.value > best.value)) best = { key, value: link.value }
    }
    if (best) return model.nodes.find((item) => item.key === best.key)
    const candidates = walk.filter((item) => (direction === 1 ? item.column > node.column : item.column < node.column))
    if (candidates.length === 0) return undefined
    const column = direction === 1 ? candidates[0].column : candidates[candidates.length - 1].column
    return candidates.find((item) => item.column === column)
  }

  #handleBlur = (): void => this.#focusNode(null)

  /** Moves the keyboard focus to a node and emphasises it through the engine, as a hover would. */
  #focusNode(node: SankeyNodeDetail | null): void {
    this.focusedNode = node?.key ?? null
    this.#renderAccessibleSummary()
    this.adapter?.dispatchAction?.({ type: 'downplay', seriesIndex: 0 })
    if (!node) return
    const dataIndex = this.#computeModel().nodes.findIndex((item) => item.key === node.key)
    this.adapter?.dispatchAction?.({ type: 'highlight', seriesIndex: 0, dataType: 'node', dataIndex })
  }

  #renderAccessibleSummary(): void {
    const root = this.renderRoot?.querySelector<HTMLElement>('.sankey-a11y-root')
    if (!root) return
    const model = this.#computeModel()
    const focused = model.nodes.find((node) => node.key === this.focusedNode)
    const announcement = focused ? this.msg.t('nodeAnnouncement', focused.label, this.#formatFlow(focused.incoming), this.#formatFlow(focused.outgoing)) : ''
    render(
      html`
        ${
          model.links.length > 0 && !model.cycle
            ? html`
                <table class="sankey-a11y">
                  <caption>
                    ${this.msg.t('summary', model.nodes.map((node) => node.label).join(', '))}
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">${this.msg.t('from')}</th>
                      <th scope="col">${this.msg.t('to')}</th>
                      <th scope="col">${this.msg.t('flow')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${this.flows.map(
                      (link) => html`
                        <tr>
                          <th scope="row">${this.#labelOf(link.source)}</th>
                          <td>${this.#labelOf(link.target)}</td>
                          <td>${this.#formatFlow(link.value)}</td>
                        </tr>
                      `,
                    )}
                  </tbody>
                </table>
              `
            : nothing
        }
        <div class="sankey-a11y" aria-live="polite">${announcement}</div>
      `,
      root,
      { host: this },
    )
  }

  /** Every scalar input the model reads, so a change of any of them recomputes it and nothing else does. */
  #signature(): string {
    return [this.revision, this.sourceField, this.targetField, this.valueField, this.nodeAlign, [...this.hiddenNodes].join('\u0000')].join('|')
  }

  #computeModel(): SankeyModel {
    const signature = this.#signature()
    if (this.#model && this.#model.signature === signature && this.#modelData === this.data && this.#modelNodes === this.nodes) return this.#model
    this.#modelData = this.data
    this.#modelNodes = this.nodes
    this.#model = this.#buildModel(this.hiddenNodes, signature)
    return this.#model
  }

  #buildModel(hidden: ReadonlySet<string>, signature?: string): SankeyModel {
    return buildSankeyModel(Array.isArray(this.data) ? (this.data as unknown[]) : [], {
      sourceField: this.sourceField,
      targetField: this.targetField,
      valueField: this.valueField,
      nodeAlign: this.nodeAlign,
      nodes: this.nodes,
      hidden,
      signature,
    })
  }

  #nodes(context: ChartBuildContext): SankeyEngineNode[] {
    const model = this.#computeModel()
    if (model.cycle) return []
    const lit = this.#litByHighlight()
    const widths = this.#labelWidths(context)
    return model.nodes.map((node) => {
      const itemStyle: SankeyEngineNode['itemStyle'] = { color: this.#colorOf(node.key, context) }
      if (lit && !lit.nodes.has(node.key)) itemStyle.opacity = context.theme.dimmedOpacity
      const text = node.label
      const position = this.#labelPosition(node.column, model.columns)
      const label: SankeyEngineNode['label'] = { position, formatter: () => text }
      // An outside label longer than the room kept for it is cut with an ellipsis rather than clipped by the plot; the
      // tooltip and the flow table still carry the whole name.
      const width = position === 'left' && node.column === 0 ? widths.start : position === 'right' && node.column === model.columns - 1 ? widths.end : undefined
      if (width !== undefined) Object.assign(label, { width: Math.max(16, width), overflow: 'truncate', ellipsis: '…' })
      return { name: node.key, depth: node.column, itemStyle, label }
    })
  }

  #links(context: ChartBuildContext): SankeyEngineLink[] {
    const model = this.#computeModel()
    if (model.cycle) return []
    const lit = this.#litByHighlight()
    const opacity = this.#readStyle().linkOpacity
    return model.links.map((flow, index) => {
      const link: SankeyEngineLink = { ...flow }
      if (lit && !lit.links.has(index)) link.lineStyle = { opacity: opacity * context.theme.dimmedOpacity }
      return link
    })
  }

  /** What the highlighted node lights up under the current `emphasis`, or `undefined` when nothing is highlighted. */
  #litByHighlight(): { nodes: Set<string>; links: Set<number> } | undefined {
    const key = this.highlighted
    const model = this.#computeModel()
    if (key === null || !model.nodes.some((node) => node.key === key)) return undefined
    return litBy(model, key, this.emphasis)
  }

  /** Which side of its node a label sits on: outside the plot for the end columns under `outside`, towards the middle otherwise. */
  #labelPosition(column: number, columns: number): string {
    const outside = this.labels === 'outside'
    const first = column === 0
    const last = column === columns - 1 && columns > 1
    if (this.orient === 'vertical') {
      if (first) return outside ? 'top' : 'bottom'
      if (last) return outside ? 'bottom' : 'top'
      return 'right'
    }
    if (first) return outside ? 'left' : 'right'
    if (last) return outside ? 'right' : 'left'
    return 'right'
  }

  /** The room kept around the nodes: outside labels get the width (or height) the longest of them needs, up to a quarter of the plot. */
  #margins(context: ChartBuildContext): { left: number; right: number; top: number; bottom: number } {
    const model = this.#computeModel()
    const { theme } = context
    const half = Math.ceil(theme.fontSize / 2) + EDGE
    if (this.labels === 'none') return { left: EDGE, right: EDGE, top: EDGE, bottom: EDGE }
    const font = `${theme.fontSize}px ${theme.fontFamily === 'inherit' ? (typeof getComputedStyle === 'function' ? getComputedStyle(this).fontFamily : '') || 'sans-serif' : theme.fontFamily}`
    const widest = (nodes: SankeyNodeDetail[]) => Math.max(0, ...nodes.map((node) => measureText(node.label, font, theme.fontSize)))
    const room = (nodes: SankeyNodeDetail[], size: number) => (nodes.length === 0 ? EDGE : Math.min(size * 0.3, widest(nodes) + LABEL_DISTANCE + EDGE))
    const first = model.nodes.filter((node) => node.column === 0)
    const last = model.columns > 1 ? model.nodes.filter((node) => node.column === model.columns - 1) : []
    const middle = model.nodes.filter((node) => node.column > 0 && node.column < model.columns - 1)
    if (this.orient === 'vertical') {
      const line = theme.fontSize * 1.4 + LABEL_DISTANCE
      const outside = this.labels === 'outside'
      return { left: EDGE, right: room(middle, context.width), top: outside && first.length ? line : EDGE, bottom: outside && last.length ? line : EDGE }
    }
    if (this.labels === 'inside') return { left: EDGE, right: EDGE, top: half, bottom: half }
    return { left: room(first, context.width), right: room(last, context.width), top: half, bottom: half }
  }

  /**
   * How wide an outside label may be: the room kept for it, which is capped. Labels between columns are left whole:
   * cut to the gap between two columns they would often read as a bare ellipsis, and they keep a halo over the bands.
   */
  #labelWidths(context: ChartBuildContext): { start?: number; end?: number } {
    if (this.orient === 'vertical' || this.labels !== 'outside' || context.width <= 0) return {}
    const margins = this.#margins(context)
    return { start: margins.left - LABEL_DISTANCE - EDGE, end: margins.right - LABEL_DISTANCE - EDGE }
  }

  #linkAt(index: number): SankeyLinkDetail | undefined {
    const flow = this.#computeModel().links[index]
    return flow ? this.#linkDetail(flow.source, flow.target) : undefined
  }

  #linkDetail(source: string, target: string): SankeyLinkDetail | undefined {
    const model = this.#computeModel()
    const flow = model.links.find((item) => item.source === source && item.target === target)
    if (!flow) return undefined
    const from = model.nodes.find((node) => node.key === source)
    return {
      source,
      target,
      value: flow.value,
      shareOfSource: from && from.outgoing > 0 ? flow.value / from.outgoing : 0,
      share: model.total > 0 ? flow.value / model.total : 0,
    }
  }

  #labelOf(key: string): string {
    const label = this.#lookups().config.get(key)?.label
    return label === undefined || label === null || label === '' ? key : String(label)
  }

  /** A node's colour: its `nodes` colour, or else its palette slot in order of first appearance, so hiding never recolours it. */
  #colorOf(key: string, context?: ChartBuildContext): string {
    const palette = (context?.theme ?? this.themeController.theme).palette
    const { config, slots } = this.#lookups()
    const fallback = palette[(slots.get(key) ?? 0) % palette.length]
    const color = config.get(key)?.color
    return color ? this.themeController.resolveColor(color, fallback) : fallback
  }

  /** The `nodes` entries and the palette slots by key, built once per model and `nodes` list rather than searched per node. */
  #lookups(): { config: Map<string, SankeyNodeConfig>; slots: Map<string, number> } {
    const model = this.#computeModel()
    if (this.#lookupCache?.model !== model || this.#lookupCache.nodes !== this.nodes) {
      const config = new Map<string, SankeyNodeConfig>()
      for (const entry of this.nodes ?? []) if (entry && typeof entry === 'object' && entry.id !== undefined) config.set(String(entry.id), entry)
      this.#lookupCache = { model, nodes: this.nodes, config, slots: new Map(model.keys.map((key, index) => [key, index])) }
    }
    return this.#lookupCache
  }

  #lookupCache?: { model: SankeyModel; nodes: unknown; config: Map<string, SankeyNodeConfig>; slots: Map<string, number> }

  #readStyle(): { nodeWidth: number; nodeGap: number; radius: number; linkOpacity: number; hoverOpacity: number; curveness: number } {
    const style = typeof getComputedStyle === 'function' ? getComputedStyle(this) : undefined
    const read = (name: string, fallback: number) => {
      const value = parseFloat(style?.getPropertyValue(name) ?? '')
      return Number.isFinite(value) ? value : fallback
    }
    const unit = (value: number) => Math.min(1, Math.max(0, value))
    return {
      nodeWidth: Math.max(1, read('--c2-chart__node--width', 12)),
      nodeGap: Math.max(0, read('--c2-chart__node--gap', 8)),
      radius: Math.max(0, read('--c2-chart__node--border-radius', 2)),
      linkOpacity: unit(read('--c2-chart__link--opacity', 0.35)),
      hoverOpacity: unit(read('--c2-chart__link__hover--opacity', 0.7)),
      curveness: unit(read('--c2-chart__link--curveness', 0.5)),
    }
  }

  #formatFlow(value: number): string {
    return this.format?.(value) ?? this.formatValue(value)
  }

  #formatShare(share: number): string {
    return new Intl.NumberFormat(this.msg.locale || undefined, { style: 'percent', maximumFractionDigits: 1 }).format(share)
  }
}

/**
 * The nodes and links a node lights up. `adjacency`: the node, its own links and the nodes at their other ends.
 * `trajectory`: every flow upstream and downstream of the node, and the nodes along them.
 */
export function litBy(model: Pick<SankeyModel, 'links'>, key: string, emphasis: SankeyEmphasis): { nodes: Set<string>; links: Set<number> } {
  const nodes = new Set([key])
  const links = new Set<number>()
  const walk = (start: string, end: 'source' | 'target') => {
    const other = end === 'source' ? 'target' : 'source'
    const queue = [start]
    const seen = new Set([start])
    while (queue.length > 0) {
      const current = queue.shift() as string
      model.links.forEach((link, index) => {
        if (link[end] !== current) return
        links.add(index)
        nodes.add(link[other])
        if (emphasis === 'trajectory' && !seen.has(link[other])) {
          seen.add(link[other])
          queue.push(link[other])
        }
      })
    }
  }
  walk(key, 'source')
  walk(key, 'target')
  return { nodes, links }
}

/** The options `buildSankeyModel` reads, besides the rows. */
export interface SankeyModelOptions {
  sourceField: string
  targetField: string
  valueField: string
  nodeAlign: SankeyNodeAlign
  nodes?: readonly SankeyNodeConfig[]
  hidden: ReadonlySet<string>
  signature?: string
}

/**
 * Sums the rows into one flow per source and target pair, finds a loop if the flows form one, and places every node
 * in a column. A row without both keys or with a value that is not a positive number is left out. A flow from a
 * node to itself is a loop.
 */
export function buildSankeyModel(rows: readonly unknown[], options: SankeyModelOptions): SankeyModel {
  const keys: string[] = []
  const seen = new Set<string>()
  const sums = new Map<string, Map<string, number>>()
  const order: [string, string][] = []
  let selfLoop: string | null = null
  const key = (value: unknown) => (value === null || value === undefined || value === '' ? null : String(value))
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue
    const source = key(getFieldValue(row, options.sourceField))
    const target = key(getFieldValue(row, options.targetField))
    const value = Number(getFieldValue(row, options.valueField))
    if (source === null || target === null || !Number.isFinite(value) || value <= 0) continue
    for (const name of [source, target]) {
      if (seen.has(name)) continue
      seen.add(name)
      keys.push(name)
    }
    if (source === target) {
      if (selfLoop === null && !options.hidden.has(source)) selfLoop = source
      continue
    }
    let targets = sums.get(source)
    if (!targets) sums.set(source, (targets = new Map()))
    if (!targets.has(target)) order.push([source, target])
    targets.set(target, (targets.get(target) ?? 0) + value)
  }

  const links = order
    .filter(([source, target]) => !options.hidden.has(source) && !options.hidden.has(target))
    .map(([source, target]) => ({ source, target, value: sums.get(source)?.get(target) ?? 0 }))

  const incoming = new Map<string, number>()
  const outgoing = new Map<string, number>()
  const inLinks = new Map<string, string[]>()
  const outLinks = new Map<string, string[]>()
  for (const link of links) {
    outgoing.set(link.source, (outgoing.get(link.source) ?? 0) + link.value)
    incoming.set(link.target, (incoming.get(link.target) ?? 0) + link.value)
    outLinks.set(link.source, [...(outLinks.get(link.source) ?? []), link.target])
    inLinks.set(link.target, [...(inLinks.get(link.target) ?? []), link.source])
  }
  const visible = keys.filter((name) => !options.hidden.has(name) && (outgoing.has(name) || incoming.has(name)))

  // Kahn's algorithm: the topological order the columns are computed in, and what is left over when there is a loop.
  const indegree = new Map(visible.map((name) => [name, inLinks.get(name)?.length ?? 0]))
  const queue = visible.filter((name) => indegree.get(name) === 0)
  const topo: string[] = []
  while (queue.length > 0) {
    const name = queue.shift() as string
    topo.push(name)
    for (const next of outLinks.get(name) ?? []) {
      const left = (indegree.get(next) ?? 0) - 1
      indegree.set(next, left)
      if (left === 0) queue.push(next)
    }
  }
  let cycle: string[] | null = selfLoop === null ? null : [selfLoop, selfLoop]
  if (cycle === null && topo.length < visible.length) {
    const loop = findCycle(new Set(visible.filter((name) => !topo.includes(name))), inLinks)
    // Start the loop at the node the rows name first, which is where a reader looking for it will start too.
    if (loop) {
      const steps = loop.slice(0, -1)
      const first = steps.reduce((best, name) => (visible.indexOf(name) < visible.indexOf(best) ? name : best), steps[0])
      const at = steps.indexOf(first)
      cycle = [...steps.slice(at), ...steps.slice(0, at), first]
    }
  }

  const total = visible.filter((name) => !incoming.has(name)).reduce((sum, name) => sum + (outgoing.get(name) ?? 0), 0)

  // Longest path from a start, and longest path to an end, in topological order.
  const fromStart = new Map<string, number>()
  for (const name of topo) fromStart.set(name, Math.max(0, ...(inLinks.get(name) ?? []).map((source) => (fromStart.get(source) ?? 0) + 1)))
  const toEnd = new Map<string, number>()
  for (const name of [...topo].reverse()) toEnd.set(name, Math.max(0, ...(outLinks.get(name) ?? []).map((target) => (toEnd.get(target) ?? 0) + 1)))
  const maxDepth = Math.max(0, ...fromStart.values())

  const config = new Map<string, SankeyNodeConfig>()
  for (const entry of options.nodes ?? []) if (entry && typeof entry === 'object' && entry.id !== undefined) config.set(String(entry.id), entry)

  const columnOf = (name: string): number => {
    const fixed = config.get(name)?.column
    if (typeof fixed === 'number' && Number.isInteger(fixed) && fixed >= 0) return fixed
    if (cycle) return 0
    if (options.nodeAlign === 'right') return maxDepth - (toEnd.get(name) ?? 0)
    if (options.nodeAlign === 'justify' && !outgoing.has(name)) return maxDepth
    return fromStart.get(name) ?? 0
  }

  const nodes = visible.map((name): SankeyNodeDetail => {
    const inc = incoming.get(name) ?? 0
    const out = outgoing.get(name) ?? 0
    const value = Math.max(inc, out)
    const label = config.get(name)?.label
    return {
      key: name,
      label: label === undefined || label === null || label === '' ? name : String(label),
      incoming: inc,
      outgoing: out,
      value,
      column: columnOf(name),
      share: total > 0 ? value / total : 0,
    }
  })
  const columns = nodes.length === 0 ? 0 : Math.max(...nodes.map((node) => node.column)) + 1

  return { signature: options.signature ?? '', keys, nodes, links, total, columns, cycle }
}

/**
 * One loop among `remaining`, the nodes Kahn's algorithm could not order. Each of them still has a flow coming in
 * from another of them (its count never reached zero), so walking those flows backwards never runs out and must
 * come back to a node it has seen: the steps since then are a loop, read forwards.
 */
function findCycle(remaining: ReadonlySet<string>, inLinks: ReadonlyMap<string, string[]>): string[] | null {
  const path: string[] = []
  const at = new Map<string, number>()
  let current = remaining.values().next().value
  while (current !== undefined && !at.has(current)) {
    at.set(current, path.length)
    path.push(current)
    current = (inLinks.get(current) ?? []).find((source) => remaining.has(source))
  }
  if (current === undefined) return null
  const loop = path.slice(at.get(current)).reverse()
  return [...loop, loop[0]]
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-sankey-chart': SankeyChart
  }
}
