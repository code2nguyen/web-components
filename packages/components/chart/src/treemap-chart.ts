import { html, nothing, render, unsafeCSS, type CSSResultGroup, type PropertyValues, type TemplateResult } from 'lit'
import { state } from 'lit/decorators.js'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { getFieldValue } from '@c2n/core/data-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import treemapStyles from './treemap-chart.scss?inline'
import { ChartBase, type ChartEventMap, type ChartLegendItem } from './chart-base.js'
import { EchartsChartBase } from './echarts-chart-base.js'
import { readableOn } from './chart-contrast.js'
import { mixColors } from './map-scale.js'
import { measureText } from './chart-measure.js'
import { treemapMessages } from './messages.js'
import type { ChartBuildContext } from './chart-adapter.js'
import type { EchartsFeature } from './engines/echarts-loader.js'
import type { ChartFrame, ChartPointEventDetail, ChartSeriesConfig, ChartTooltipContext } from './chart-types.js'
import './chart-series.js'

/** One tile or group of the treemap, as the tooltip, the events and `nodes` describe it. */
export interface TreemapNode {
  /** The names from the top-level group down to this node. */
  path: string[]
  /** The node's own name: the last entry of `path`. */
  label: string
  /** The tile's value, or the sum of a group's tiles. */
  value: number
  /** The `color-field` value of a tile, or the value-weighted mean of a group's; `null` without `color-field`. */
  colorValue: number | null
  /** `1` for a top-level node, `2` for its children, and so on. */
  depth: number
  /** `value` as a share of the whole treemap, from 0 to 1. */
  share: number
  /** `value` as a share of the node's group, from 0 to 1; the same as `share` at the top level. */
  parentShare: number
  /** Whether the node is a tile rather than a group. */
  leaf: boolean
}

/** What `renderTooltip`, the `tooltip-change` event and a linked `c2-chart-tooltip` receive. */
export interface TreemapTooltipContext extends ChartTooltipContext {
  node?: TreemapNode
}

export interface TreemapChart {
  addEventListener: TypedAddEventListener<TreemapChart, ChartEventMap>
  removeEventListener: TypedRemoveEventListener<TreemapChart, ChartEventMap>
}

/** How {@link buildTreemap} reads the rows. */
export interface TreemapModelOptions {
  labelField: string
  valueField: string
  /** Fields naming the groups a row belongs to, outermost first. */
  groupFields: readonly string[]
  /** Field holding a row's nested rows. */
  childrenField: string
  colorField: string
  /** Top-level names to leave out, as the legend's toggle does. */
  hidden?: ReadonlySet<string>
}

/** A node of the built tree: the public description plus its children, largest first. */
export interface TreemapTreeNode extends TreemapNode {
  children: TreemapTreeNode[]
}

/**
 * Builds the tree a treemap draws from rows. A row is a tile named by `labelField` and sized by `valueField`; the
 * `groupFields` it carries put it into groups, outermost first, and rows under `childrenField` nest inside it (a row
 * with children is a group, sized by them). Rows without a positive value are left out, and so are the groups left
 * empty. Siblings are ordered largest first, which is how the tiles are laid out.
 */
export function buildTreemap(rows: readonly unknown[], options: TreemapModelOptions): TreemapTreeNode[] {
  interface Draft {
    label: string
    value: number
    weighted: number
    colored: number
    children: Map<string, Draft>
    leaf: boolean
  }
  const draft = (label: string, leaf: boolean): Draft => ({ label, value: 0, weighted: 0, colored: 0, children: new Map(), leaf })
  const root = draft('', false)

  const numberAt = (row: Record<string, unknown>, field: string): number | null => {
    if (!field) return null
    const raw = getFieldValue(row, field)
    const value = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN
    return Number.isFinite(value) ? value : null
  }
  const childAt = (parent: Draft, label: string, leaf: boolean): Draft => {
    // A tile and a group may share a name in one group: they are different nodes, so the key tells them apart.
    const key = `${leaf ? 'leaf' : 'group'}:${label}`
    let node = parent.children.get(key)
    if (!node) {
      node = draft(label, leaf)
      parent.children.set(key, node)
    }
    return node
  }
  const add = (parent: Draft, row: unknown, depth: number): void => {
    if (!row || typeof row !== 'object') return
    const record = row as Record<string, unknown>
    const name = getFieldValue(record, options.labelField)
    const label = name === undefined || name === null ? '' : String(name)
    const nested = options.childrenField ? getFieldValue(record, options.childrenField) : undefined
    let target = parent
    if (depth === 0) {
      for (const field of options.groupFields) {
        const group = getFieldValue(record, field)
        if (group === undefined || group === null || String(group) === '') continue
        target = childAt(target, String(group), false)
      }
    }
    if (Array.isArray(nested) && nested.length > 0) {
      const group = childAt(target, label, false)
      for (const child of nested) add(group, child, depth + 1)
      return
    }
    const value = numberAt(record, options.valueField)
    if (value === null || value <= 0) return
    const tile = childAt(target, label, true)
    tile.value += value
    const color = numberAt(record, options.colorField)
    if (color !== null) {
      tile.weighted += color * value
      tile.colored += value
    }
  }
  for (const row of rows) add(root, row, 0)

  // Sums the groups bottom-up, drops the empty ones and orders siblings largest first.
  const settle = (node: Draft): void => {
    for (const [key, child] of node.children) {
      if (!child.leaf) settle(child)
      if (child.value <= 0) node.children.delete(key)
    }
    if (node.leaf) return
    node.value = 0
    node.weighted = 0
    node.colored = 0
    for (const child of node.children.values()) {
      node.value += child.value
      node.weighted += child.weighted
      node.colored += child.colored
    }
  }
  settle(root)
  for (const name of options.hidden ?? []) {
    root.children.delete(`group:${name}`)
    root.children.delete(`leaf:${name}`)
  }
  const total = [...root.children.values()].reduce((sum, child) => sum + child.value, 0)

  const finish = (node: Draft, parentPath: string[], parentValue: number, depth: number): TreemapTreeNode => {
    const path = [...parentPath, node.label]
    const children = [...node.children.values()].sort((a, b) => b.value - a.value).map((child) => finish(child, path, node.value, depth + 1))
    return {
      path,
      label: node.label,
      value: node.value,
      colorValue: node.colored > 0 ? node.weighted / node.colored : null,
      depth,
      share: total > 0 ? node.value / total : 0,
      parentShare: parentValue > 0 ? node.value / parentValue : 0,
      leaf: node.leaf,
      children,
    }
  }
  return [...root.children.values()].sort((a, b) => b.value - a.value).map((child) => finish(child, [], total, 1))
}

/**
 * The name a node is handed to ECharts under: its path, and whether it is a tile, so two nodes never share one. The
 * labels are drawn from the model, so the engine never shows it.
 */
function engineName(node: TreemapNode): string {
  return `${node.leaf ? 'tile' : 'group'}\u001f${node.path.join('\u001f')}`
}

/** Every node in the order ECharts numbers them: depth first, a group before its children. */
function preorder(nodes: readonly TreemapTreeNode[], out: TreemapTreeNode[] = []): TreemapTreeNode[] {
  for (const node of nodes) {
    out.push(node)
    preorder(node.children, out)
  }
  return out
}

/** Space a tile's label keeps from the tile's edges, in pixels. */
const LABEL_INSET = 5

/** Space between a group's name and its edge, in pixels. */
const HEADER_PADDING = 8

/**
 * A treemap: a whole split into nested rectangles, each sized by its value, drawn by ECharts' treemap series. One row
 * is one tile, named by `label-field` and sized by the single series. `group-field` puts the tiles into groups (a
 * comma-separated list nests them, outermost first), and rows under `children-field` nest inside their row, as a
 * folder holds files. Each group carries its name in a header strip.
 *
 * Tiles take their top-level group's palette colour. With `color-field`, they are coloured by that field instead, on a
 * scale from `--c2-chart__negative--color` through a neutral grey to `--c2-chart__positive--color` around zero, the way
 * a market map shows the day's change.
 *
 * ```html
 * <c2-treemap-chart label-field="ticker" group-field="sector" color-field="change" color-suffix="%"
 *   data='[{ "sector": "Tech", "ticker": "AAPL", "cap": 3400, "change": 1.2 }, { "sector": "Energy", "ticker": "XOM", "cap": 480, "change": -0.8 }]'>
 *   <c2-chart-series field="cap" label="Market cap"></c2-chart-series>
 * </c2-treemap-chart>
 * ```
 *
 * The tooltip gives a tile's value with its share of the whole and of its group. A hidden table lists every tile for
 * assistive technology, and the plot is named by it. Clicking a tile highlights its top-level group.
 *
 * @tag c2-treemap-chart
 *
 * @slotcomponent c2-chart-series
 *
 * @cssproperty {pixel} [--c2-chart__tile--gap=1px] - Space between two tiles of the same group.
 * @cssproperty {pixel} [--c2-chart__tile--border-radius=2px] - Corner radius of a tile.
 * @cssproperty {pixel} [--c2-chart__group--gap=3px] - Space around a group, between it and its neighbours.
 * @cssproperty {color} [--c2-chart__neutral--color=#d4d4d8] - Colour of a tile whose `color-field` value is zero; the scale runs from it to the positive and negative colours.
 * @cssproperty {opacity} [--c2-chart__series__dimmed--opacity=0.25] - Opacity the other groups keep while one is highlighted.
 */
@customElement('c2-treemap-chart')
export class TreemapChart extends EchartsChartBase {
  static override styles: CSSResultGroup = [ChartBase.styles, unsafeCSS(treemapStyles)]

  protected override readonly features: readonly EchartsFeature[] = ['treemap']

  // A click highlight rebuilds the options under the pointer; the redraw must land in one step. See `createEchartsAdapter`.
  protected override readonly lazyEngineUpdates = false

  /** Row fields naming the groups a tile belongs to, outermost first, separated by commas; each may be a dotted path. */
  @property({ type: String, attribute: 'group-field' }) groupField = ''

  /** Row field holding a row's nested rows, which turns the row into a group of them. */
  @property({ type: String, attribute: 'children-field' }) childrenField = 'children'

  /** Row field that colours the tiles on a scale around zero, in place of their group's colour. */
  @property({ type: String, attribute: 'color-field' }) colorField = ''

  /** Value at which the colour scale reaches full strength on either side of zero. Defaults to the largest value either side. */
  @property({ type: Number, attribute: 'color-max' }) colorMax?: number

  /** Name of the `color-field` measure in the tooltip and the table, such as `Change`. */
  @property({ type: String, attribute: 'color-label' }) colorLabel = ''

  /** Text appended to the `color-field` value, such as `%`. */
  @property({ type: String, attribute: 'color-suffix' }) colorSuffix = ''

  /** What a tile prints: its name (the default), or its name over its value (the `color-field` value when there is one). */
  @property({ type: String, attribute: 'label-content' }) labelContent: 'name' | 'name-value' = 'name'

  /** Formats the `color-field` value. Falls back to a signed number with `color-suffix`. Property only. */
  @property({ attribute: false }) formatColor?: (value: number) => string

  /** Top-level groups the reader has switched off from the legend, by name. */
  @state() private hiddenGroups = new Set<string>()

  /** Bumped on every data change, so the options are rebuilt with the data. */
  @state() private dataRevision = 0

  private readonly msg = new LocalizeController(this, treemapMessages, () => this.locale)

  #model?: { key: string; data: unknown; tree: TreemapTreeNode[]; nodes: TreemapTreeNode[]; order: string[]; byName: Map<string, number> }

  constructor() {
    super()
    // A tile has no x position to follow, and the headers already name every group.
    this.tooltip = 'item'
    this.legend = 'none'
    // The tile labels are fitted to the laid-out tiles, which only exist once the engine has drawn: draw them again then.
    this.addEventListener('chart-ready', () => {
      if (this.frame) this.adapter?.setData(this.projectData(this.frame, this.buildContext()))
    })
  }

  /** Every group and tile, a group before its children and siblings largest first. For a table view or an export. */
  get nodes(): TreemapNode[] {
    return this.#computeModel().nodes.map(({ children: _children, ...node }) => ({ ...node, path: [...node.path] }))
  }

  /** Shows or hides one top-level group, or tile when there are no groups, as the legend does. */
  setGroupVisible(name: string, visible: boolean): void {
    const next = new Set(this.hiddenGroups)
    if (visible) next.delete(name)
    else next.add(name)
    this.hiddenGroups = next
    if (!visible && this.highlighted === name) this.highlight(null)
    this.notifyLegendChange()
  }

  // ------------------------------------------------------ chart overrides ---

  /** The base fast path sends the data alone; the tree's colours and labels ride on the options too. */
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

  protected override reshapesFrame(changed: PropertyValues): boolean {
    return super.reshapesFrame(changed) || changed.has('groupField') || changed.has('childrenField') || changed.has('colorField')
  }

  /** The value is the first numeric field that is not the colour measure. */
  protected override inferredSeries(): ChartSeriesConfig[] {
    return super
      .inferredSeries()
      .filter((series) => series.field !== this.colorField)
      .slice(0, 1)
  }

  /** One entry per top-level group, as a pie lists its slices. A treemap coloured by `color-field` has no group colours to list. */
  protected override legendItems(): ChartLegendItem[] {
    if (this.colorField) return []
    const names = this.#computeModel().order
    const series = this.resolvedSeries[0] ?? { field: '' }
    return names.map((name, index) => {
      const shown = !this.hiddenGroups.has(name)
      return {
        label: name,
        color: this.#groupColor(name),
        visible: shown,
        ...this.legendEntryState(name, shown, (next) => this.setGroupVisible(name, next)),
        series,
        index,
      }
    })
  }

  /** A treemap has no grid and no axes. */
  protected override coordinateSystem(): Record<string, unknown> {
    return {}
  }

  protected override seriesOption(_index: number, context: ChartBuildContext): Record<string, unknown> {
    const { theme } = context
    const layout = this.#layout()
    const headerHeight = Math.round(theme.fontSize + HEADER_PADDING)
    return {
      type: 'treemap',
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
      roam: false,
      nodeClick: false,
      breadcrumb: { show: false },
      animationDurationUpdate: 0,
      // The children arrive largest first already, which is the order the data index follows.
      sort: false,
      visibleMin: 1,
      label: {
        show: true,
        position: 'insideTopLeft',
        fontSize: theme.fontSize,
        overflow: 'truncate',
        lineHeight: Math.round(theme.fontSize * 1.3),
        formatter: (params: { dataIndex: number; name: string }) => this.#tileText(params.name, params.dataIndex),
      },
      upperLabel: {
        show: true,
        height: headerHeight,
        color: theme.color,
        fontSize: theme.fontSize,
        fontWeight: 600,
        overflow: 'truncate',
        formatter: (params: { name: string }) => this.#nodeNamed(params.name)?.label ?? '',
      },
      itemStyle: { borderWidth: 0, gapWidth: layout.tileGap, borderRadius: layout.radius },
      // ECharts' own root would draw an empty header strip across the top; only the groups below it carry names.
      // Its gaps between the groups are painted in its own colour, which would be ECharts' white in a dark theme.
      levels: [{ itemStyle: { gapWidth: layout.groupGap, color: theme.surface, borderColor: theme.surface }, upperLabel: { show: false } }],
      emphasis: { disabled: true },
      // A rebuild without the tree in it leaves ECharts' treemap laid out against nothing, so the data rides on every build.
      data: this.#engineNodes(this.#computeModel().tree, context),
    }
  }

  protected override projectData(_frame: ChartFrame, context: ChartBuildContext): unknown {
    this.#renderAccessibleSummary()
    return [this.#engineNodes(this.#computeModel().tree, context)]
  }

  protected override handleEngineHover(
    detail: { index: number; seriesIndex: number; px: number; py: number; name?: string; component?: string; dataType?: string } | null,
  ): void {
    super.handleEngineHover(detail && this.#fromEngine(detail))
  }

  protected override handleEngineClick(detail: { index: number; seriesIndex: number; name?: string; component?: string; dataType?: string }): void {
    const translated = this.#fromEngine(detail)
    if (translated) super.handleEngineClick(translated)
  }

  protected override highlightKeyAt(detail: { index: number; seriesIndex: number }): string | undefined {
    if (this.#computeModel().tree.length < 2) return undefined
    return this.#nodeAt(detail.index)?.path[0]
  }

  protected override pointAt(index: number): ChartPointEventDetail | undefined {
    const node = this.#nodeAt(index)
    const series = this.resolvedSeries[0]
    if (!node || !series) return undefined
    return { index, seriesIndex: 0, series, x: index, y: node.value, label: node.label }
  }

  protected override tooltipContextAt(detail: { index: number; seriesIndex: number; px: number; py: number }): TreemapTooltipContext {
    const node = this.#nodeAt(detail.index)
    const base = { index: detail.index, x: detail.index, px: detail.px, py: detail.py }
    if (!node) return { ...base, formattedX: '', entries: [] }
    const series = this.resolvedSeries[0] ?? { field: '' }
    const color = this.#tileColor(node)
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
    const name = node.path.reduce((text, part) => (text ? this.msg.t('path', text, part) : part), '')
    const { children: _children, ...described } = node
    return { ...base, formattedX: name, label: node.label, entries, node: { ...described, path: [...node.path] } }
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

  /** The tile table is rendered into a static container after each update, as the legend is. */
  protected override render(): TemplateResult {
    return html`${super.render()}
      <div class="treemap-a11y-root"></div>`
  }

  // ------------------------------------------------------------ internals ---

  #summary(): string {
    const series = this.resolvedSeries[0]
    const tiles = this.#computeModel().nodes.filter((node) => node.leaf).length
    return this.msg.t('summary', series?.label ?? series?.field ?? '', String(tiles))
  }

  #renderAccessibleSummary(): void {
    const root = this.renderRoot?.querySelector<HTMLElement>('.treemap-a11y-root')
    if (!root) return
    const tiles = this.#computeModel().nodes.filter((node) => node.leaf)
    const grouped = tiles.some((node) => node.depth > 1)
    const colored = Boolean(this.colorField)
    const series = this.resolvedSeries[0]
    render(
      tiles.length > 0
        ? html`
            <table class="treemap-a11y">
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
                </tr>
              </thead>
              <tbody>
                ${tiles.map(
                  (node) => html`
                    <tr>
                      ${grouped ? html`<td>${node.path.slice(0, -1).reduce((text, part) => (text ? this.msg.t('path', text, part) : part), '')}</td>` : nothing}
                      <th scope="row">${node.label}</th>
                      <td>${this.#format(node.value)}</td>
                      ${colored ? html`<td>${node.colorValue === null ? '—' : this.#formatColor(node.colorValue)}</td>` : nothing}
                      <td>${this.#percent(node.share)}</td>
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

  #computeModel(): { tree: TreemapTreeNode[]; nodes: TreemapTreeNode[]; order: string[]; byName: Map<string, number> } {
    const valueField = this.resolvedSeries[0]?.field ?? ''
    const key = [this.revision, this.labelField, valueField, this.groupField, this.childrenField, this.colorField, [...this.hiddenGroups].join('\u0000')].join(
      '|',
    )
    if (this.#model && this.#model.key === key && this.#model.data === this.data) return this.#model
    const rows = Array.isArray(this.data) ? (this.data as unknown[]) : []
    const options = {
      labelField: this.labelField,
      valueField,
      groupFields: this.groupField
        .split(',')
        .map((field) => field.trim())
        .filter(Boolean),
      childrenField: this.childrenField,
      colorField: this.colorField,
    }
    const tree = buildTreemap(rows, { ...options, hidden: this.hiddenGroups })
    // Every top-level name in its unhidden order: a group's palette slot and legend place stay put while others are hidden.
    const order = this.hiddenGroups.size === 0 ? tree.map((node) => node.label) : buildTreemap(rows, options).map((node) => node.label)
    const nodes = preorder(tree)
    this.#model = { key, data: this.data, tree, nodes, order, byName: new Map(nodes.map((node, index) => [engineName(node), index])) }
    return this.#model
  }

  /**
   * A node by the index the chart's events carry: its place in `nodes` plus one, as ECharts numbers a tree it has just
   * built (its own root takes `0`). ECharts' numbering is not kept once the options are rebuilt, so what the engine
   * reports is translated through each node's unique engine name first (`#fromEngine`).
   */
  #nodeAt(index: number): TreemapTreeNode | undefined {
    return this.#computeModel().nodes[index - 1]
  }

  /** The node ECharts drew under `name`, which is unique: see {@link engineName}. */
  #nodeNamed(name: string | undefined): TreemapTreeNode | undefined {
    const index = name === undefined ? undefined : this.#computeModel().byName.get(name)
    return index === undefined ? undefined : this.#computeModel().nodes[index]
  }

  /** An engine hover or click, re-indexed by the node's name; `null` when it names no node (ECharts' own root). */
  #fromEngine<T extends { index: number; name?: string }>(detail: T): T | null {
    if (detail.name === undefined) return detail
    const index = this.#computeModel().byName.get(detail.name)
    return index === undefined ? null : { ...detail, index: index + 1 }
  }

  #engineNodes(nodes: readonly TreemapTreeNode[], context: ChartBuildContext): Record<string, unknown>[] {
    const { theme } = context
    const highlighted = this.highlighted
    return nodes.map((node) => {
      const opacity =
        highlighted !== null && node.path[0] !== highlighted && this.#computeModel().tree.some((top) => top.label === highlighted) ? theme.dimmedOpacity : 1
      if (!node.leaf) {
        // A group is drawn as its header strip and the gaps between its tiles, in the surface colour.
        return {
          name: engineName(node),
          value: node.value,
          itemStyle: { color: theme.surface, borderColor: theme.surface, opacity },
          upperLabel: { opacity },
          children: this.#engineNodes(node.children, context),
        }
      }
      const color = this.#tileColor(node)
      // ECharts' treemap ignores an item's opacity, so a dimmed tile is drawn faded into the surface instead.
      const fill = opacity < 1 ? mixColors(theme.surface, color, opacity) : color
      return { name: engineName(node), value: node.value, itemStyle: { color: fill }, label: { color: readableOn(color), opacity } }
    })
  }

  /**
   * A tile's label, fitted to the tile: its name and value when both fit, its name alone when only that does, and
   * nothing on a tile too small for its name, rather than a clipped fragment that reads as another value.
   */
  #tileText(name: string, dataIndex: number): string {
    const node = this.#nodeNamed(name)
    if (!node) return ''
    const lines = [node.label]
    if (this.labelContent === 'name-value')
      lines.push(this.colorField && node.colorValue !== null ? this.#formatColor(node.colorValue) : this.#format(node.value))
    const box = this.adapter?.itemLayout?.(0, dataIndex)
    if (box?.width === undefined || box.height === undefined) return lines.join('\n')
    const theme = this.themeController.theme
    const font = `${theme.fontSize}px ${theme.fontFamily === 'inherit' ? 'system-ui, sans-serif' : theme.fontFamily}`
    const lineHeight = Math.round(theme.fontSize * 1.3)
    const room = { width: box.width - LABEL_INSET * 2, height: box.height - LABEL_INSET * 2 }
    const fits = (count: number) =>
      count * lineHeight <= room.height && lines.slice(0, count).every((line) => measureText(line, font, theme.fontSize) <= room.width)
    for (let count = lines.length; count > 0; count -= 1) if (fits(count)) return lines.slice(0, count).join('\n')
    return ''
  }

  #tileColor(node: TreemapNode): string {
    const theme = this.themeController.theme
    if (this.colorField) {
      if (node.colorValue === null) return this.#neutral()
      const limit = this.#colorLimit()
      const strength = limit > 0 ? Math.min(1, Math.abs(node.colorValue) / limit) : 0
      return mixColors(this.#neutral(), node.colorValue < 0 ? theme.negative : theme.positive, strength)
    }
    return this.#groupColor(node.path[0] ?? node.label)
  }

  /** A top-level group's palette colour, which stays with its name when others are hidden. */
  #groupColor(name: string): string {
    const theme = this.themeController.theme
    const series = this.resolvedSeries[0]
    const index = Math.max(0, this.#computeModel().order.indexOf(name))
    // A single tree with one top-level group takes the series colour, as a one-series chart does.
    if (index === 0 && series?.color) return series.color
    return theme.palette[index % theme.palette.length]
  }

  #colorLimit(): number {
    if (this.colorMax !== undefined && Number.isFinite(this.colorMax) && this.colorMax > 0) return this.colorMax
    let largest = 0
    for (const node of this.#computeModel().nodes) if (node.leaf && node.colorValue !== null) largest = Math.max(largest, Math.abs(node.colorValue))
    return largest
  }

  #neutral(): string {
    return getComputedStyle(this).getPropertyValue('--c2-chart__neutral--color').trim() || '#d4d4d8'
  }

  #layout(): { tileGap: number; groupGap: number; radius: number } {
    const style = getComputedStyle(this)
    const read = (name: string, fallback: number) => {
      const value = parseFloat(style.getPropertyValue(name))
      return Number.isFinite(value) && value >= 0 ? value : fallback
    }
    return { tileGap: read('--c2-chart__tile--gap', 1), groupGap: read('--c2-chart__group--gap', 3), radius: read('--c2-chart__tile--border-radius', 2) }
  }

  #format(value: number): string {
    return this.resolvedSeries[0]?.format?.(value) ?? this.formatValue(value)
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
    'c2-treemap-chart': TreemapChart
  }
}
