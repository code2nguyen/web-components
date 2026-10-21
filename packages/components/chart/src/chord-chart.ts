import { html, nothing, render, unsafeCSS, type CSSResultGroup, type PropertyValues, type TemplateResult } from 'lit'
import { state } from 'lit/decorators.js'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { getFieldValue } from '@c2n/core/data-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import chordStyles from './chord-chart.scss?inline'
import { ChartBase, type ChartEventMap, type ChartLegendItem } from './chart-base.js'
import { EchartsChartBase } from './echarts-chart-base.js'
import { measureText } from './chart-measure.js'
import { chordMessages } from './messages.js'
import type { ChartAdapter, ChartBuildContext } from './chart-adapter.js'
import type { EchartsFeature } from './engines/echarts-loader.js'
import type { ChartFrame, ChartPointEventDetail, ChartSeriesConfig, ChartTooltipContext } from './chart-types.js'

/** One group (an arc on the circle), as `group-hover` and `group-click` report it and the tooltip describes it. */
export interface ChordGroupDetail {
  /** The group's key: the value its rows carry in `source-field` or `target-field`. */
  key: string
  /** Sum of the flows leaving the group. */
  outgoing: number
  /** Sum of the flows reaching the group. */
  incoming: number
  /** `outgoing + incoming`, which is what the arc's length encodes. */
  total: number
  /** `total` as a share of every group's total, from 0 to 1. */
  share: number
}

/** One ribbon (a flow from one group to another), as `ribbon-hover` and `ribbon-click` report it. */
export interface ChordRibbonDetail {
  source: string
  target: string
  /** The flow from `source` to `target`, with duplicate rows summed. */
  value: number
  /** The flow the other way, from `target` to `source`, or `0`. */
  reverse: number
  /** `value` as a share of all visible flows, from 0 to 1. */
  share: number
}

/** What `renderTooltip`, the `tooltip-change` event and a linked `c2-chart-tooltip` receive. */
export interface ChordTooltipContext extends ChartTooltipContext {
  group?: ChordGroupDetail
  ribbon?: ChordRibbonDetail
}

/** Events of `c2-chord-chart`, keyed for `addEventListener`: the shared chart events plus the group and ribbon events. */
export interface ChordChartEventMap extends ChartEventMap {
  'group-hover': CustomEvent<ChordGroupDetail | null>
  'group-click': CustomEvent<ChordGroupDetail>
  'ribbon-hover': CustomEvent<ChordRibbonDetail | null>
  'ribbon-click': CustomEvent<ChordRibbonDetail>
}

export interface ChordChart {
  addEventListener: TypedAddEventListener<ChordChart, ChordChartEventMap>
  removeEventListener: TypedRemoveEventListener<ChordChart, ChordChartEventMap>
}

/** How the groups are placed around the circle. */
export type ChordLayout = 'circle' | 'bipartite'

/** One group as the engine receives it. */
interface ChordNode {
  name: string
  itemStyle: { color: string; opacity?: number }
}

/** One ribbon as the engine receives it. */
interface ChordLink {
  source: string
  target: string
  value: number
  lineStyle?: { opacity: number }
}

/** Everything the rows say once they are summed, filtered and ordered. Recomputed only when one of its inputs changes. */
interface ChordModel {
  signature: string
  /** Every key in order of first appearance, hidden ones included: a key's palette slot never moves. */
  keys: string[]
  /** The visible groups in drawing order. */
  groups: ChordGroupDetail[]
  /** The visible flows in row order, one per source and target pair. */
  flows: { source: string; target: string; value: number }[]
  /** Sum of the visible flows. */
  total: number
  /** Where the first group starts, in degrees counter-clockwise from three o'clock. */
  startAngle: number
}

/** Space between an arc and its label, in pixels. */
const LABEL_DISTANCE = 6

/**
 * A chord diagram: flows between groups, drawn by ECharts' chord series. One row is one flow, read through
 * `source-field`, `target-field` and `value-field`; each group is an arc whose length is the sum of the flows that
 * leave and reach it, and each flow is a ribbon between two arcs, as wide as the flow at both ends.
 *
 * `layout="bipartite"` puts the groups that send on the right half and the groups that receive on the left, facing
 * each other, for flows between two different kinds of thing (quarters and countries, channels and products).
 *
 * ```html
 * <c2-chord-chart source-field="from" target-field="to" value-field="amount"
 *   data='[{ "from": "EUR", "to": "USD", "amount": 42 }, { "from": "USD", "to": "EUR", "amount": 31 }]'>
 * </c2-chord-chart>
 * ```
 *
 * Hovering an arc or a ribbon emphasises it and the ribbons it touches. Clicking an arc highlights its group (the key
 * goes to `highlighted`, and `series-highlight` fires); a second click clears it. The plot is one tab stop: the arrow
 * keys move between groups, Enter highlights one and Escape clears.
 *
 * @tag c2-chord-chart
 *
 * @event {CustomEvent<ChordGroupDetail | null>} group-hover - Fired when the pointer enters a group's arc, and with `null` when it leaves. Does not bubble.
 * @event {CustomEvent<ChordGroupDetail>} group-click - Fired when a group's arc is clicked or Enter is pressed on it. Cancelable: `preventDefault()` keeps the highlight as it is. Does not bubble.
 * @event {CustomEvent<ChordRibbonDetail | null>} ribbon-hover - Fired when the pointer enters a ribbon, and with `null` when it leaves. Does not bubble.
 * @event {CustomEvent<ChordRibbonDetail>} ribbon-click - Fired when a ribbon is clicked. Does not bubble.
 *
 * @cssproperty {pixel} [--c2-chart__arc--width=12px] - Thickness of a group's arc.
 * @cssproperty {number} [--c2-chart__arc--gap=3] - Gap between two arcs, in degrees.
 * @cssproperty {opacity} [--c2-chart__ribbon--opacity=0.55] - Opacity of a ribbon at rest.
 * @cssproperty {opacity} [--c2-chart__ribbon__hover--opacity=0.85] - Opacity of the ribbons that touch the hovered arc, or of the hovered ribbon.
 * @cssproperty {opacity} [--c2-chart__series__dimmed--opacity=0.25] - Opacity the other series (or slices) keep while one is highlighted.
 * @cssproperty {border} [--c2-chart__plot__focus--outline=2px solid rgba(2, 101, 220, 0.4)] - Focus ring of the plot, the chart's tab stop.
 */
@customElement('c2-chord-chart')
export class ChordChart extends EchartsChartBase {
  static override styles: CSSResultGroup = [ChartBase.styles, unsafeCSS(chordStyles)]

  protected override readonly features: readonly EchartsFeature[] = ['chord']

  // A click highlight rebuilds the options under the pointer; the redraw must land in one step. See `createEchartsAdapter`.
  protected override readonly lazyEngineUpdates = false

  /** Row field holding the group a flow leaves; may be a dotted path. */
  @property({ type: String, attribute: 'source-field' }) sourceField = 'source'

  /** Row field holding the group a flow reaches; may be a dotted path. */
  @property({ type: String, attribute: 'target-field' }) targetField = 'target'

  /** Row field holding the size of a flow. Rows whose value is not a positive number are left out. */
  @property({ type: String, attribute: 'value-field' }) valueField = 'value'

  /**
   * `circle` (the default) keeps the groups in the order they first appear. `bipartite` puts the groups that send on
   * the right half of the circle and the ones that only receive on the left, so every ribbon crosses the middle.
   */
  @property({ type: String }) layout: ChordLayout = 'circle'

  /** Orders the groups by their total rather than keeping the data order. In a bipartite layout, each side is sorted. */
  @property({ type: String }) sort: 'none' | 'asc' | 'desc' = 'none'

  /**
   * What colours a ribbon: its `source` group's colour (the default), its `target` group's, or a `gradient` from one
   * to the other. It decides which end of a flow the reader can trace back, so it is behaviour, not decoration.
   */
  @property({ type: String, attribute: 'ribbon-color' }) ribbonColor: 'source' | 'target' | 'gradient' = 'source'

  /** Whether the groups are named outside their arcs. With `none`, pair the chart with a legend. */
  @property({ type: String }) labels: 'outside' | 'none' = 'outside'

  /** Formats the flows in the tooltip, the events' accessible text and the table. Falls back to the chart's number format. Property only. */
  @property({ attribute: false }) format?: (value: number) => string

  /** Groups the reader has switched off from the legend, by key. */
  @state() private hiddenGroups = new Set<string>()

  /**
   * The group the keyboard focus is on, by key. Not reactive: moving the focus only emphasises an arc through the
   * engine and updates the announcement, and a rebuild of the options would clear that emphasis again.
   */
  private focusedGroup: string | null = null

  private readonly msg = new LocalizeController(this, chordMessages, () => this.locale)

  /** What the last engine hover was on, so leaving it fires the matching `null` event. */
  #hoverKind: 'group' | 'ribbon' | null = null

  #model?: ChordModel

  constructor() {
    super()
    // An arc or a ribbon has no x position to follow, and the labels already name every group.
    this.tooltip = 'item'
    this.legend = 'none'
  }

  // ----------------------------------------------------------- public API ---

  /** The visible groups in drawing order, with their totals. For a table view or an export. */
  get groups(): ChordGroupDetail[] {
    return this.#computeModel().groups.map((group) => ({ ...group }))
  }

  /** The visible flows, one per source and target pair, largest first. */
  get flows(): ChordRibbonDetail[] {
    return this.#computeModel()
      .flows.map((flow) => this.#ribbonDetail(flow.source, flow.target))
      .filter((flow): flow is ChordRibbonDetail => flow !== undefined)
      .sort((a, b) => b.value - a.value)
  }

  /** Shows or hides one group and every flow that touches it, as the legend does. The last two groups stay on. */
  setGroupVisible(key: string, visible: boolean): void {
    const next = new Set(this.hiddenGroups)
    if (visible) next.delete(key)
    else if (this.#computeModel().groups.length > 2) next.add(key)
    else return
    this.hiddenGroups = next
    if (!visible && this.highlighted === key) this.highlight(null)
    if (!visible && this.focusedGroup === key) this.#focusGroup(null)
    this.notifyLegendChange()
  }

  // ------------------------------------------------------ chart overrides ---

  /** Groups are hidden by leaving them out of the data, and the radius follows the plot size. */
  protected override async createAdapter(): Promise<ChartAdapter> {
    const adapter = await super.createAdapter()
    return {
      ...adapter,
      setSeriesVisibility: () => undefined,
      // The radius is in pixels so the arc keeps its documented width; a resize does not rebuild the options, so it is pushed here.
      resize: (width, height) => {
        adapter.resize(width, height)
        if (width > 0 && height > 0) adapter.setOptions({ series: [{ radius: this.#radius(width, height) }] }, 'merge')
      },
    }
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

  /** One legend entry per group, as a pie lists its slices. */
  protected override legendItems(): ChartLegendItem[] {
    const model = this.#computeModel()
    const series = this.resolvedSeries[0] ?? { field: this.valueField }
    return model.keys.map((key, index) => {
      const visible = !this.hiddenGroups.has(key)
      return {
        label: key,
        color: this.#colorOf(key),
        visible,
        ...this.legendEntryState(key, visible, (next) => this.setGroupVisible(key, next)),
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
    const model = this.#computeModel()
    return {
      type: 'chord',
      radius: this.#radius(context.width, context.height),
      startAngle: model.startAngle,
      clockwise: true,
      padAngle: style.gap,
      minAngle: 0,
      itemStyle: { borderWidth: 0 },
      lineStyle: { color: this.ribbonColor, opacity: style.ribbonOpacity, width: 0 },
      label: {
        show: this.labels === 'outside',
        position: 'outside',
        distance: LABEL_DISTANCE,
        color: theme.color,
        fontSize: theme.fontSize,
        fontFamily: theme.fontFamily === 'inherit' ? undefined : theme.fontFamily,
      },
      labelLayout: { hideOverlap: true },
      emphasis: { focus: 'adjacency', lineStyle: { opacity: style.hoverOpacity } },
      // The engine's own blur is how hover dims the rest; match it to the documented dimmed opacity.
      blur: { itemStyle: { opacity: theme.dimmedOpacity }, lineStyle: { opacity: theme.dimmedOpacity * style.ribbonOpacity } },
      links: this.#links(context),
    }
  }

  /** One series, so the series list is always exactly the chord. */
  protected override buildOptions(context: ChartBuildContext): unknown {
    const options = super.buildOptions(context) as { series?: Record<string, unknown>[] }
    // The base class dims every series but the highlighted one; a chord's highlight is a group, handled per datum.
    return { ...options, series: [{ name: 'chord', ...this.seriesOption(0, context) }] }
  }

  /**
   * The nodes are the series' data; the links ride on the series option. A data-only change takes the base class's
   * fast path, which sends the data alone, so the links are pushed alongside it here.
   */
  protected override projectData(_frame: ChartFrame, context: ChartBuildContext): unknown {
    this.#model = undefined
    const nodes = this.#nodes(context)
    this.adapter?.setOptions({ series: [{ data: nodes, links: this.#links(context), startAngle: this.#computeModel().startAngle }] }, 'merge')
    // A data-only change skips Lit's update, so the flow table is refreshed on the data path too.
    this.#renderAccessibleSummary()
    return [nodes]
  }

  /** A highlight names a group; nothing else on the chart is highlighted by a click. */
  protected override highlightKeyAt(): string | undefined {
    return undefined
  }

  /** A group or a ribbon is not a point on a series: the group and ribbon events fire instead. */
  protected override pointAt(): ChartPointEventDetail | undefined {
    return undefined
  }

  protected override tooltipContextAt(detail: { index: number; seriesIndex: number; px: number; py: number; dataType?: string }): ChordTooltipContext {
    const base = { index: detail.index, x: detail.index, entries: [], px: detail.px, py: detail.py }
    if (detail.dataType === 'edge') {
      const flow = this.#computeModel().flows[detail.index]
      const ribbon = flow ? this.#ribbonDetail(flow.source, flow.target) : undefined
      return ribbon ? { ...base, formattedX: this.msg.t('flowName', ribbon.source, ribbon.target), ribbon } : { ...base, formattedX: '' }
    }
    const group = this.#computeModel().groups[detail.index]
    return group ? { ...base, formattedX: group.key, group: { ...group } } : { ...base, formattedX: '' }
  }

  protected override handleEngineHover(detail: { index: number; seriesIndex: number; px: number; py: number; dataType?: string } | null): void {
    const previous = this.#hoverKind
    const kind = detail ? (detail.dataType === 'edge' ? 'ribbon' : 'group') : null
    const group = kind === 'group' && detail ? this.#computeModel().groups[detail.index] : undefined
    const flow = kind === 'ribbon' && detail ? this.#computeModel().flows[detail.index] : undefined
    const ribbon = flow ? this.#ribbonDetail(flow.source, flow.target) : undefined
    // Straight from an arc to a ribbon, or back, with no leave in between: the first one is left before the second is entered.
    if (previous === 'group' && kind !== 'group') this.dispatchEvent(new CustomEvent<ChordGroupDetail | null>('group-hover', { detail: null }))
    if (previous === 'ribbon' && kind !== 'ribbon') this.dispatchEvent(new CustomEvent<ChordRibbonDetail | null>('ribbon-hover', { detail: null }))
    this.#hoverKind = group ? 'group' : ribbon ? 'ribbon' : null
    super.handleEngineHover(group || ribbon ? detail : null)
    if (group) this.dispatchEvent(new CustomEvent<ChordGroupDetail | null>('group-hover', { detail: { ...group } }))
    if (ribbon) this.dispatchEvent(new CustomEvent<ChordRibbonDetail | null>('ribbon-hover', { detail: ribbon }))
  }

  protected override handleEngineClick(detail: { index: number; seriesIndex: number; dataType?: string }): void {
    if (detail.dataType === 'edge') {
      const flow = this.#computeModel().flows[detail.index]
      const ribbon = flow ? this.#ribbonDetail(flow.source, flow.target) : undefined
      if (ribbon) this.dispatchEvent(new CustomEvent<ChordRibbonDetail>('ribbon-click', { detail: ribbon }))
      return
    }
    const group = this.#computeModel().groups[detail.index]
    if (group) this.#activate(group)
  }

  protected override defaultTooltip(context: ChordTooltipContext): TemplateResult {
    const row = (label: string, value: string, color?: string) => html`
      <div class="tooltip-row">
        ${color ? html`<span class="tooltip-marker" style="background:${color}"></span>` : nothing}
        <span class="tooltip-label">${label}</span>
        <span class="tooltip-value">${value}</span>
      </div>
    `
    const { group, ribbon } = context
    if (group) {
      return html`
        <div class="tooltip-title">${group.key}</div>
        ${row(this.msg.t('outgoing'), this.#formatFlow(group.outgoing))} ${row(this.msg.t('incoming'), this.#formatFlow(group.incoming))}
        ${row(this.msg.t('share'), this.#formatShare(group.share))}
      `
    }
    if (ribbon) {
      return html`
        ${row(this.msg.t('flowName', ribbon.source, ribbon.target), this.#formatFlow(ribbon.value), this.#colorOf(ribbon.source))}
        ${ribbon.reverse > 0 ? row(this.msg.t('flowName', ribbon.target, ribbon.source), this.#formatFlow(ribbon.reverse), this.#colorOf(ribbon.target)) : nothing}
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
    const groups = this.#computeModel().groups
    const label = this.msg.t('summary', groups.map((group) => group.key).join(', '))
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
      <div class="chord-a11y-root"></div>`
  }

  // ------------------------------------------------------------ internals ---

  #activate(group: ChordGroupDetail): void {
    const event = new CustomEvent<ChordGroupDetail>('group-click', { detail: { ...group }, cancelable: true })
    this.dispatchEvent(event)
    if (event.defaultPrevented) return
    this.highlight(this.highlighted === group.key ? null : group.key)
  }

  #handleKeydown = (event: KeyboardEvent): void => {
    const groups = this.#computeModel().groups
    if (groups.length === 0) return
    const current = groups.findIndex((group) => group.key === this.focusedGroup)
    let next: ChordGroupDetail | undefined
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = groups[(current + 1) % groups.length]
        break
      case 'ArrowLeft':
      case 'ArrowUp':
        next = groups[current < 0 ? groups.length - 1 : (current - 1 + groups.length) % groups.length]
        break
      case 'Home':
        next = groups[0]
        break
      case 'End':
        next = groups[groups.length - 1]
        break
      case 'Enter':
      case ' ': {
        const focused = groups[current]
        if (!focused) return
        event.preventDefault()
        this.#activate(focused)
        return
      }
      case 'Escape':
        if (this.focusedGroup === null && this.highlighted === null) return
        event.preventDefault()
        this.#focusGroup(null)
        this.highlight(null)
        return
      default:
        return
    }
    event.preventDefault()
    this.#focusGroup(next ?? null)
  }

  #handleBlur = (): void => this.#focusGroup(null)

  /** Moves the keyboard focus to a group and emphasises it through the engine, as a hover would. */
  #focusGroup(group: ChordGroupDetail | null): void {
    this.focusedGroup = group?.key ?? null
    this.#renderAccessibleSummary()
    this.adapter?.dispatchAction?.({ type: 'downplay', seriesIndex: 0 })
    if (!group) return
    const dataIndex = this.#computeModel().groups.findIndex((item) => item.key === group.key)
    this.adapter?.dispatchAction?.({ type: 'highlight', seriesIndex: 0, dataType: 'node', dataIndex })
  }

  #renderAccessibleSummary(): void {
    const root = this.renderRoot?.querySelector<HTMLElement>('.chord-a11y-root')
    if (!root) return
    const model = this.#computeModel()
    const focused = model.groups.find((group) => group.key === this.focusedGroup)
    const announcement = focused ? this.msg.t('groupAnnouncement', focused.key, this.#formatFlow(focused.outgoing), this.#formatFlow(focused.incoming)) : ''
    render(
      html`
        ${
          model.flows.length > 0
            ? html`
                <table class="chord-a11y">
                  <caption>
                    ${this.msg.t('summary', model.groups.map((group) => group.key).join(', '))}
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
                      (flow) => html`
                        <tr>
                          <th scope="row">${flow.source}</th>
                          <td>${flow.target}</td>
                          <td>${this.#formatFlow(flow.value)}</td>
                        </tr>
                      `,
                    )}
                  </tbody>
                </table>
              `
            : nothing
        }
        <div class="chord-a11y" aria-live="polite">${announcement}</div>
      `,
      root,
      { host: this },
    )
  }

  /** Every input the model reads, so a change of any of them recomputes it and nothing else does. */
  #signature(): string {
    return [this.revision, this.sourceField, this.targetField, this.valueField, this.layout, this.sort, [...this.hiddenGroups].join('\u0000')].join('|')
  }

  #computeModel(): ChordModel {
    const signature = this.#signature()
    if (this.#model && this.#model.signature === signature && this.#modelData === this.data) return this.#model
    this.#modelData = this.data
    this.#model = buildChordModel(Array.isArray(this.data) ? (this.data as unknown[]) : [], {
      sourceField: this.sourceField,
      targetField: this.targetField,
      valueField: this.valueField,
      layout: this.layout,
      sort: this.sort,
      hidden: this.hiddenGroups,
      signature,
    })
    return this.#model
  }

  #modelData: unknown

  #nodes(context: ChartBuildContext): ChordNode[] {
    const model = this.#computeModel()
    const highlighted = this.#highlightedGroup()
    const related = highlighted === null ? undefined : relatedGroups(model, highlighted)
    return model.groups.map((group) => {
      const itemStyle: ChordNode['itemStyle'] = { color: this.#colorOf(group.key, context) }
      if (related && !related.has(group.key)) itemStyle.opacity = context.theme.dimmedOpacity
      return { name: group.key, itemStyle }
    })
  }

  #links(context: ChartBuildContext): ChordLink[] {
    const model = this.#computeModel()
    const highlighted = this.#highlightedGroup()
    const opacity = this.#readStyle().ribbonOpacity
    return model.flows.map((flow) => {
      const link: ChordLink = { ...flow }
      if (highlighted !== null && flow.source !== highlighted && flow.target !== highlighted)
        link.lineStyle = { opacity: opacity * context.theme.dimmedOpacity }
      return link
    })
  }

  #highlightedGroup(): string | null {
    const key = this.highlighted
    return key !== null && this.#computeModel().groups.some((group) => group.key === key) ? key : null
  }

  #ribbonDetail(source: string, target: string): ChordRibbonDetail | undefined {
    const model = this.#computeModel()
    const flow = model.flows.find((item) => item.source === source && item.target === target)
    if (!flow) return undefined
    const reverse = model.flows.find((item) => item.source === target && item.target === source)?.value ?? 0
    return { source, target, value: flow.value, reverse, share: model.total > 0 ? flow.value / model.total : 0 }
  }

  /** A group's colour is its palette slot in order of first appearance, so hiding or sorting never recolours it. */
  #colorOf(key: string, context?: ChartBuildContext): string {
    const palette = (context?.theme ?? this.themeController.theme).palette
    const index = Math.max(0, this.#computeModel().keys.indexOf(key))
    return palette[index % palette.length]
  }

  /**
   * The inner and outer radius in pixels: the arc is `--c2-chart__arc--width` thick, and outside labels get the room
   * the longest one needs, up to a third of the radius.
   */
  #radius(width: number, height: number): [number, number] {
    const available = Math.max(0, Math.min(width, height) / 2 - 4)
    let outer = available
    if (this.labels === 'outside') {
      const theme = this.themeController.theme
      const font = theme.fontFamily === 'inherit' ? getComputedStyle(this).fontFamily || 'sans-serif' : theme.fontFamily
      const widest = Math.max(0, ...this.#computeModel().groups.map((group) => measureText(group.key, `${theme.fontSize}px ${font}`, theme.fontSize)))
      // Labels at the sides need their width; at the top and bottom only their height. The narrower box decides.
      const room = width <= height ? widest : theme.fontSize * 1.4
      outer = available - Math.min(available / 3, room + LABEL_DISTANCE + 2)
    }
    outer = Math.max(8, outer)
    const thickness = Math.min(this.#readStyle().arcWidth, outer / 2)
    return [Math.max(0, outer - thickness), outer]
  }

  #readStyle(): { arcWidth: number; gap: number; ribbonOpacity: number; hoverOpacity: number } {
    const style = typeof getComputedStyle === 'function' ? getComputedStyle(this) : undefined
    const read = (name: string, fallback: number) => {
      const value = parseFloat(style?.getPropertyValue(name) ?? '')
      return Number.isFinite(value) ? value : fallback
    }
    const unit = (value: number) => Math.min(1, Math.max(0, value))
    return {
      arcWidth: Math.max(1, read('--c2-chart__arc--width', 12)),
      gap: Math.max(0, read('--c2-chart__arc--gap', 3)),
      ribbonOpacity: unit(read('--c2-chart__ribbon--opacity', 0.55)),
      hoverOpacity: unit(read('--c2-chart__ribbon__hover--opacity', 0.85)),
    }
  }

  #formatFlow(value: number): string {
    return this.format?.(value) ?? this.formatValue(value)
  }

  #formatShare(share: number): string {
    return new Intl.NumberFormat(this.msg.locale || undefined, { style: 'percent', maximumFractionDigits: 1 }).format(share)
  }
}

/** The groups a highlighted group is connected to, itself included. */
function relatedGroups(model: ChordModel, key: string): Set<string> {
  const related = new Set([key])
  for (const flow of model.flows) {
    if (flow.source === key) related.add(flow.target)
    if (flow.target === key) related.add(flow.source)
  }
  return related
}

/** The options `buildChordModel` reads, besides the rows. */
export interface ChordModelOptions {
  sourceField: string
  targetField: string
  valueField: string
  layout: ChordLayout
  sort: 'none' | 'asc' | 'desc'
  hidden: ReadonlySet<string>
  signature?: string
}

/**
 * Sums the rows into one flow per source and target pair and orders the groups. A row without both keys, a flow from a
 * group to itself, and a value that is not a positive number are left out: none of them can be drawn as a ribbon.
 */
export function buildChordModel(rows: readonly unknown[], options: ChordModelOptions): ChordModel {
  const keys: string[] = []
  const seen = new Set<string>()
  const sums = new Map<string, Map<string, number>>()
  const order: [string, string][] = []
  const key = (value: unknown) => (value === null || value === undefined || value === '' ? null : String(value))
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue
    const source = key(getFieldValue(row, options.sourceField))
    const target = key(getFieldValue(row, options.targetField))
    const value = Number(getFieldValue(row, options.valueField))
    if (source === null || target === null || source === target || !Number.isFinite(value) || value <= 0) continue
    for (const name of [source, target]) {
      if (seen.has(name)) continue
      seen.add(name)
      keys.push(name)
    }
    let targets = sums.get(source)
    if (!targets) sums.set(source, (targets = new Map()))
    if (!targets.has(target)) order.push([source, target])
    targets.set(target, (targets.get(target) ?? 0) + value)
  }

  const flows = order
    .filter(([source, target]) => !options.hidden.has(source) && !options.hidden.has(target))
    .map(([source, target]) => ({ source, target, value: sums.get(source)?.get(target) ?? 0 }))

  const outgoing = new Map<string, number>()
  const incoming = new Map<string, number>()
  for (const flow of flows) {
    outgoing.set(flow.source, (outgoing.get(flow.source) ?? 0) + flow.value)
    incoming.set(flow.target, (incoming.get(flow.target) ?? 0) + flow.value)
  }
  const total = flows.reduce((sum, flow) => sum + flow.value, 0)
  // A group's arc carries every flow at both of its ends, so the arcs together span twice the total.
  const span = total * 2
  const visible = keys.filter((name) => !options.hidden.has(name) && (outgoing.has(name) || incoming.has(name)))
  const detail = (name: string): ChordGroupDetail => {
    const out = outgoing.get(name) ?? 0
    const inc = incoming.get(name) ?? 0
    return { key: name, outgoing: out, incoming: inc, total: out + inc, share: span > 0 ? (out + inc) / span : 0 }
  }
  const sorted = (list: ChordGroupDetail[]) =>
    options.sort === 'none' ? list : [...list].sort((a, b) => (options.sort === 'asc' ? a.total - b.total : b.total - a.total))

  let groups: ChordGroupDetail[]
  let startAngle = 90
  if (options.layout === 'bipartite') {
    const senders = sorted(visible.filter((name) => outgoing.has(name)).map(detail))
    // Reversed so that, clockwise, the receivers run back up the left side and face their senders.
    const receivers = sorted(visible.filter((name) => !outgoing.has(name)).map(detail)).reverse()
    groups = [...senders, ...receivers]
    // Centre the senders on three o'clock: they span their share of the circle, clockwise from the start angle.
    const senderShare = span > 0 ? senders.reduce((sum, group) => sum + group.total, 0) / span : 0.5
    startAngle = senderShare * 180
  } else {
    groups = sorted(visible.map(detail))
  }

  return { signature: options.signature ?? '', keys, groups, flows, total, startAngle }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-chord-chart': ChordChart
  }
}
