import { html, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { classMap } from 'lit/directives/class-map.js'
import { ifDefined } from 'lit/directives/if-defined.js'
import { styleMap } from 'lit/directives/style-map.js'
import { customElement } from '@c2n/core/element-helper.js'
import { defaultCompare } from '@c2n/core/data-helper.js'
import { property } from '@c2n/core/lit-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import type { Checkbox } from '@c2n/checkbox'
import styles from './group-table.scss?inline'
import { Table, type TableEventMap } from './table.js'
import { aggregate, CHEVRON, columnKey, hierarchyColumn, keyListConverter, SELECTION_FIELD, type PinPlacement, type TableRowLevel } from './table-shared.js'
import {
  getFieldValue,
  groupByConverter,
  type TableColumnConfig,
  type TableGroupBy,
  type TableGroupContext,
  type TableGroupDisplay,
  type TableGroupRenderer,
  type TableGroupToggleEventDetail,
  type TableRow,
} from './table-types.js'

/** One group of the row tree, built from the sorted rows whenever they or `groupBy` change. */
interface GroupNode {
  key: string
  level: number
  field: string
  value: unknown
  /** Indices of the group's rows, sub-groups included, in the array the tree was built from. */
  rowIndices: number[]
  children: GroupNode[]
  parent?: GroupNode
  /** Where the group's own row sits in the display list; -1 while a closed parent hides it. */
  position: number
  /** The rows, their keys and the aggregates, computed on first use: the tree is rebuilt whenever the rows change. */
  rows?: TableRow[]
  keys?: string[]
  selection?: { value: string[]; count: number }
  summary?: { inputs: unknown[]; values: Map<string, unknown> }
}

/** One line of a grouped body: a group row, or a data row pointing into the array the tree was built from. */
type DisplayItem = { kind: 'group'; node: GroupNode } | { kind: 'row'; rowIndex: number; parent: GroupNode }

interface Grouping {
  levels: TableGroupBy[]
  /** The rows the tree indexes into: the sorted rows, or the transition rows while an update animates. */
  source: TableRow[]
  roots: GroupNode[]
  nodes: Map<string, GroupNode>
  items: DisplayItem[]
}

/** Group keys are `field=value` pairs joined by `/`, so those characters (and `;`, the list separator) are escaped. */
function encodeGroupPart(value: string): string {
  return value.replace(/[%/=;]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)
}

/** Groups rows by the string form of their value: `1` and `"1"` share a group, and an empty value is its own. */
function groupBucketId(value: unknown): string {
  if (value === null || value === undefined || value === '') return ''
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

/** Events fired by {@link GroupTable}: those of `c2-table`, and the opening and closing of groups. */
export interface GroupTableEventMap extends TableEventMap {
  'group-toggle': CustomEvent<TableGroupToggleEventDetail>
}

export interface GroupTable {
  addEventListener: TypedAddEventListener<GroupTable, GroupTableEventMap>
  removeEventListener: TypedRemoveEventListener<GroupTable, GroupTableEventMap>
}

/**
 * `c2-table` with groups: the same grid, columns, sorting, selection, pinning, windowing, paging, summary row, editing
 * and realtime updates, plus collapsible groups of rows (`group-by`). Every attribute, property, event, part and CSS
 * variable of `c2-table` works here as well; what follows is what the groups add. Use `c2-table` when the rows are
 * flat, and `c2-tree-table` when they nest: each leaves this code out.
 *
 * ```html
 * <c2-group-table row-key="id" group-by="region" selection="multiple" checkbox-selection>
 *   <c2-table-column field="customer" header="Customer"></c2-table-column>
 *   <c2-table-column field="region" hidden></c2-table-column>
 *   <c2-table-column field="amount" format="currency" align="end" summary="sum"></c2-table-column>
 * </c2-group-table>
 * ```
 *
 * `group-by="region,status"` gathers the rows into collapsible groups, outermost level first; the grid becomes a
 * `treegrid`. With the default `group-display="row"` each group is a row of the grid: its label and row count in the
 * first column (or the one marked `group-column`), and under every column with a `summary` that aggregate over the
 * group's rows, formatted like the column. `group-display="band"` draws one full-width band per group instead. A group
 * is named by its path, `region=EMEA/status=Paid`: `expanded-groups` lists the open ones (every group is open until
 * then, or closed with `groups-collapsed`), `group-toggle` reports a click, and a group's checkbox selects its rows.
 * The groups of the rows at the top stay under the header while their rows scroll, and a page that starts inside a
 * group repeats its headers; pages count display lines, so a closed group takes one. Grouping is done on the client
 * and does not apply to a `dataSource`.
 *
 * @tag c2-group-table
 *
 * @slot group:{groupKey} - Label of one group, e.g. `slot="group:region=EMEA"`, in place of its formatted value and row count. The copy of the group kept under the header while its rows scroll shows the built-in label.
 *
 * @event {CustomEvent<TableGroupToggleEventDetail>} group-toggle - Fired after the user opens or closes a group, with its `key`, whether it is now `expanded`, and the `group` itself (its rows and aggregates). `expandedGroups` already holds the new state. Does not bubble.
 *
 * @csspart group-row - Every group row. Also `group-row-level-<n>` (0 for the outermost level), `group-band` with `group-display="band"`, and `group-row-echo` on a copy kept under the header.
 * @csspart group-cell - Every cell of a group row. Each also carries `group-cell-<id>`, named after its column.
 * @csspart group-toggle - The chevron of a group row.
 * @csspart group-label - The group's value, or what `renderGroup` returned.
 * @csspart group-count - The number of rows in the group.
 *
 * @cssproperty {color} [--c2-table__group-row--background=#fafafa]
 * @cssproperty {color} [--c2-table__group-row--color=#18181b]
 * @cssproperty {font-weight} [--c2-table__group-row--font-weight=600]
 * @cssproperty {color} [--c2-table__group-row__hover--background=#f4f4f5]
 * @cssproperty {box-shadow} [--c2-table__group-row__echo--box-shadow=0 1px 0 0 #e4e4e7] - Separator under a group row kept under the header.
 * @cssproperty {color} [--c2-table__group-band--background=#f4f4f5] - Background of a group with `group-display="band"`.
 * @cssproperty {pixel} [--c2-table__group--indent=24px] - Indentation per group level; the default lines rows up with their group's label.
 * @cssproperty {color} [--c2-table__group-count--background=#f4f4f5]
 * @cssproperty {color} [--c2-table__group-count--color=#52525b]
 * @cssproperty {font-size} [--c2-table__group-count--font-size=12px]
 * @cssproperty {font-weight} [--c2-table__group-count--font-weight=600]
 * @cssproperty {padding} [--c2-table__group-count--padding=1px 7px]
 * @cssproperty {border-radius} [--c2-table__group-count--border-radius=999px]
 */
@customElement('c2-group-table')
export class GroupTable extends Table {
  static override styles = [Table.styles, unsafeCSS(styles)]

  /**
   * Groups the rows by these fields, outermost first: `group-by="region,status"` in the attribute, and field names or
   * {@link TableGroupBy} objects in the property. Not applied to a `dataSource`, which only holds the rows it fetched.
   */
  @property({ converter: groupByConverter, attribute: 'group-by' }) groupBy: (string | TableGroupBy)[] = []

  /** `row` gives each group a row of the grid with its column aggregates; `band` draws a full-width band per group. */
  @property({ type: String, attribute: 'group-display' }) groupDisplay: TableGroupDisplay = 'row'

  /**
   * Keys of the open groups (`region=EMEA/status=Paid`). While unset, every group follows `groups-collapsed`; the
   * first toggle writes the full list here, so it can be read, stored and handed back. `;`-separated in the attribute.
   */
  @property({ converter: keyListConverter, attribute: 'expanded-groups' }) expandedGroups?: string[]

  /** Starts every group closed while `expandedGroups` is unset. */
  @property({ type: Boolean, attribute: 'groups-collapsed' }) groupsCollapsed = false

  /** Renders a group's label in place of its formatted value. The slot `group:<key>` wins over both. */
  @property({ attribute: false }) renderGroup?: TableGroupRenderer

  /** Label of the group of rows whose value is empty. Unset, `No value` in the table's language. */
  @property({ type: String, attribute: 'empty-group-label' }) emptyGroupLabel = ''

  #groupingCache?: { treeInputs: unknown[]; itemInputs: unknown[]; grouping: Grouping }

  #warnedGroupedSource = false
  #warnedDetail = false

  #headerHeightPx = 0

  /** Keys of the group rows stuck under the header at the last render, to re-render only when they change. */
  #echoSignature = ''

  /** Whether the rows are currently grouped: `groupBy` names a level and the rows are the table's own. */
  get grouped(): boolean {
    return this.#grouping() !== undefined
  }

  /** Every group, outermost first and each followed by its sub-groups, whether its parent is open or not. */
  getGroups(): TableGroupContext[] {
    const grouping = this.#grouping()
    if (!grouping) return []
    const groups: TableGroupContext[] = []
    const visit = (node: GroupNode) => {
      groups.push(this.#groupContext(node, grouping))
      node.children.forEach(visit)
    }
    grouping.roots.forEach(visit)
    return groups
  }

  /** Opens the group with `key`. Does not fire `group-toggle`, which reports what the user did. */
  expandGroup(key: string) {
    this.#setGroupExpanded(key, true)
  }

  /** Closes the group with `key`. */
  collapseGroup(key: string) {
    this.#setGroupExpanded(key, false)
  }

  /** Opens every group. */
  expandAll() {
    const grouping = this.#grouping()
    if (grouping) this.expandedGroups = [...grouping.nodes.keys()]
  }

  /** Closes every group. */
  collapseAll() {
    this.expandedGroups = []
  }

  #renderGroupLabel(node: GroupNode, grouping: Grouping, echo: boolean) {
    const column = this.#fieldColumn(node.field)
    const empty = node.value === null || node.value === undefined || node.value === ''
    const label = this.renderGroup
      ? this.renderGroup(this.#groupContext(node, grouping))
      : empty
        ? this.emptyGroupLabel || this.msg.t('emptyGroup')
        : column
          ? this.formatValue(column, node.value)
          : String(node.value)
    const content = html`<span class="group-label" part="group-label">${label}</span>
      <span class="group-count" part="group-count">${node.rowIndices.length}</span>`
    // Two slots of one name would split the slotted label between the row and its stuck copy; the copy shows the fallback.
    return echo ? content : html`<slot name=${`group:${node.key}`}>${content}</slot>`
  }

  #renderGroupCheckbox(node: GroupNode, grouping: Grouping) {
    if (this.selection !== 'multiple') return nothing
    const keys = this.#groupKeys(node, grouping)
    // Counted once per selection rather than on every scroll frame: a group can hold thousands of rows.
    if (node.selection?.value !== this.value) {
      const selected = new Set(this.value)
      node.selection = { value: this.value, count: keys.filter((key) => selected.has(key)).length }
    }
    const count = node.selection.count
    const all = count > 0 && count === keys.length
    return html`<c2-checkbox
      aria-label=${this.msg.t('selectGroupRows')}
      ?checked=${all}
      ?indeterminate=${count > 0 && !all}
      @click=${(event: Event) => event.stopPropagation()}
      @change=${(event: Event) => {
        event.stopPropagation()
        const own = new Set(keys)
        const rest = this.value.filter((key) => !own.has(key))
        this.commitSelection((event.target as Checkbox).checked ? [...rest, ...keys] : rest)
      }}
    ></c2-checkbox>`
  }

  /**
   * One group's row. `line` is its display line, or -1 for a copy stuck under the header ("echo"), which is hidden
   * from assistive technology — the real row is further up — holds nothing focusable, and toggles the real group.
   */
  #renderGroupRow(node: GroupNode, line: number, columns: TableColumnConfig[], pins: Map<string, PinPlacement>, grouping: Grouping, echo: boolean) {
    const expanded = this.#isGroupExpanded(node.key)
    const band = this.groupDisplay === 'band'
    const treeColumn = hierarchyColumn(columns)
    const focusable = (columnIndex: number) => (echo ? undefined : this.tabIndexFor(line, columnIndex))
    const toggle = html`<span class="group-toggle" part="group-toggle" style=${styleMap({ '--_group-level': String(node.level) })}>${CHEVRON}</span>`
    const rowParts = ['group-row', `group-row-level-${node.level}`, band ? 'group-band' : '', echo ? 'group-row-echo' : ''].filter(Boolean).join(' ')

    let cells: unknown
    if (band) {
      const selectionColumn = columns.findIndex((column) => column.field === SELECTION_FIELD)
      cells = html`<div
        class="cell cell--group cell--band"
        role="gridcell"
        part="group-cell"
        aria-colindex="1"
        aria-colspan=${columns.length}
        tabindex=${ifDefined(focusable(this.focusedCell.row === line ? this.focusedCell.column : 0))}
        @click=${() => this.focusLine(line)}
      >
        <span class="band-content">
          ${selectionColumn >= 0 && !echo ? this.#renderGroupCheckbox(node, grouping) : nothing} ${toggle} ${this.#renderGroupLabel(node, grouping, echo)}
        </span>
      </div>`
    } else {
      const values = this.#groupSummary(node, grouping)
      cells = columns.map((column, columnIndex) => {
        const pinClasses = this.pinClasses(column, pins)
        const style = styleMap(this.pinStyle(column, pins))
        if (column.field === SELECTION_FIELD) {
          return html`<div
            class=${classMap({ cell: true, 'cell--selection': true, ...pinClasses })}
            role="gridcell"
            part="group-cell selection-cell"
            aria-colindex=${columnIndex + 1}
            tabindex=${ifDefined(focusable(columnIndex))}
            style=${style}
          >
            ${echo ? nothing : this.#renderGroupCheckbox(node, grouping)}
          </div>`
        }
        const part = columnKey(column).replace(/[^\w-]/g, '-')
        if (column === treeColumn) {
          return html`<div
            class=${classMap({ cell: true, 'cell--group': true, 'cell--group-tree': true, ...pinClasses })}
            role="gridcell"
            part="group-cell group-cell-${part}"
            aria-colindex=${columnIndex + 1}
            tabindex=${ifDefined(focusable(columnIndex))}
            style=${style}
            @click=${() => this.focusLine(line, columnIndex)}
          >
            ${toggle} ${this.#renderGroupLabel(node, grouping, echo)}
          </div>`
        }
        const value = values.get(columnKey(column))
        const content = value === undefined || value === null || value === '' ? '' : this.formatAggregate(column, value, false)
        return html`<div
          class=${classMap({ cell: true, 'cell--group': true, [`cell--align-${column.summaryAlign ?? column.align ?? 'start'}`]: true, ...pinClasses, ...(column.cellClass ? { [column.cellClass]: true } : {}) })}
          role="gridcell"
          part="group-cell group-cell-${part}"
          aria-colindex=${columnIndex + 1}
          tabindex=${ifDefined(focusable(columnIndex))}
          style=${style}
          @click=${() => this.focusLine(line, columnIndex)}
        >
          <span class="cell-content">${content}</span>
        </div>`
      })
    }

    return html`
      <div
        class=${classMap({ row: true, 'row--group': true, 'row--band': band, 'row--group-echo': echo, 'row--group-collapsed': !expanded, [`row--group-level-${node.level}`]: true })}
        role=${ifDefined(echo ? undefined : 'row')}
        part=${rowParts}
        data-group-key=${node.key}
        aria-level=${ifDefined(echo ? undefined : node.level + 1)}
        aria-expanded=${ifDefined(echo ? undefined : String(expanded))}
        aria-rowindex=${ifDefined(echo ? undefined : line + 2)}
        aria-hidden=${ifDefined(echo ? 'true' : undefined)}
        @click=${() => this.#toggleGroup(node)}
      >
        ${cells}
      </div>
    `
  }

  /** The grouping levels, normalized from `groupBy`; empty when the table is not grouped. */
  #groupLevels(): TableGroupBy[] {
    if (!Array.isArray(this.groupBy)) return []
    return this.groupBy
      .map((entry) => (typeof entry === 'string' ? { field: entry.trim() } : entry))
      .filter((entry): entry is TableGroupBy => Boolean(entry && typeof entry.field === 'string' && entry.field))
  }

  /**
   * The group tree and the display list, or `undefined` when the rows are not grouped. Cached in two layers on their
   * inputs: the tree only depends on the rows and the levels, and opening a group should not re-bucket 10k rows.
   */
  #grouping(): Grouping | undefined {
    // Read per rendered row, so an ungrouped table leaves before allocating anything.
    if (!this.groupBy?.length) return undefined
    const levels = this.#groupLevels()
    if (this.dataSource || !levels.length) return undefined
    const source = this.displayRows
    const treeInputs = [source, this.groupBy, this.sortModel, this.columnElements, this.columns, this.rowKey, this.getRowKey]
    const itemInputs = [this.expandedGroups, this.groupsCollapsed]
    const cached = this.#groupingCache
    const sameTree = cached && cached.treeInputs.every((input, index) => input === treeInputs[index])
    if (sameTree && cached.itemInputs.every((input, index) => input === itemInputs[index])) return cached.grouping

    const tree = sameTree ? cached.grouping : this.#buildGroupTree(source, levels)
    const expanded = this.expandedGroups ? new Set(this.expandedGroups) : undefined
    const items: DisplayItem[] = []
    const flatten = (node: GroupNode) => {
      node.position = items.length
      items.push({ kind: 'group', node })
      if (expanded ? expanded.has(node.key) : !this.groupsCollapsed) {
        if (node.children.length) node.children.forEach(flatten)
        else for (const rowIndex of node.rowIndices) items.push({ kind: 'row', rowIndex, parent: node })
      }
    }
    for (const node of tree.nodes.values()) node.position = -1
    tree.roots.forEach(flatten)

    const grouping: Grouping = { ...tree, items }
    this.#groupingCache = { treeInputs, itemInputs, grouping }
    return grouping
  }

  /**
   * Buckets `source` level by level. Rows keep their order inside a bucket; the buckets of a level are ordered by
   * their value, following the level's `sort`, else the direction the table is sorted by that field, else ascending.
   */
  #buildGroupTree(source: TableRow[], levels: TableGroupBy[]): Omit<Grouping, 'items'> {
    const nodes = new Map<string, GroupNode>()
    const build = (indices: number[], level: number, parent: GroupNode | undefined): GroupNode[] => {
      const spec = levels[level]
      const comparator = this.#groupComparator(spec)
      const buckets = new Map<string, { value: unknown; indices: number[] }>()
      for (const index of indices) {
        const row = source[index]
        const value = spec.getValue ? spec.getValue(row) : getFieldValue(row, spec.field)
        const id = groupBucketId(value)
        const bucket = buckets.get(id)
        if (bucket) bucket.indices.push(index)
        else buckets.set(id, { value, indices: [index] })
      }
      const children = [...buckets].map(([id, bucket]) => {
        const part = `${encodeGroupPart(spec.field)}=${encodeGroupPart(id)}`
        const node: GroupNode = {
          key: parent ? `${parent.key}/${part}` : part,
          level,
          field: spec.field,
          value: bucket.value,
          rowIndices: bucket.indices,
          children: [],
          parent,
          position: -1,
        }
        nodes.set(node.key, node)
        if (level + 1 < levels.length) node.children = build(bucket.indices, level + 1, node)
        return node
      })
      return children.sort((left, right) => comparator(left.value, right.value))
    }
    const roots = build(
      source.map((_, index) => index),
      0,
      undefined,
    )
    return { levels, source, roots, nodes }
  }

  #groupComparator(spec: TableGroupBy): (a: unknown, b: unknown) => number {
    if (typeof spec.sort === 'function') return spec.sort
    const column = this.#fieldColumn(spec.field)
    const compare = column?.comparator ?? defaultCompare
    const direction = spec.sort ?? this.sortModel.find((entry) => entry.field === spec.field)?.direction ?? 'asc'
    return direction === 'desc' ? (a, b) => -compare(a, b) : compare
  }

  /** The column definition showing `field`, hidden ones included: a grouped column is usually hidden, but formats the label. */
  #fieldColumn(field: string): TableColumnConfig | undefined {
    const source: TableColumnConfig[] = this.columnElements.length ? this.columnElements : (this.columns ?? [])
    return source.find((column) => column.field === field)
  }

  #isGroupExpanded(key: string): boolean {
    return this.expandedGroups ? this.expandedGroups.includes(key) : !this.groupsCollapsed
  }

  #setGroupExpanded(key: string, expanded: boolean): boolean {
    const grouping = this.#grouping()
    if (!grouping?.nodes.has(key) || this.#isGroupExpanded(key) === expanded) return false
    // Until a group is toggled the list is implicit; write it out whole so it reads back as the state on screen.
    const current = this.expandedGroups ?? (this.groupsCollapsed ? [] : [...grouping.nodes.keys()])
    this.expandedGroups = expanded ? [...current, key] : current.filter((entry) => entry !== key)
    return true
  }

  #toggleGroup(node: GroupNode) {
    const expanded = !this.#isGroupExpanded(node.key)
    if (!this.#setGroupExpanded(node.key, expanded)) return
    const grouping = this.#grouping()
    if (!grouping) return
    this.dispatchEvent(
      new CustomEvent<TableGroupToggleEventDetail>('group-toggle', {
        detail: { key: node.key, expanded, group: this.#groupContext(node, grouping) },
        bubbles: false,
        composed: true,
      }),
    )
  }

  #groupRows(node: GroupNode, grouping: Grouping): TableRow[] {
    node.rows ??= node.rowIndices.map((index) => grouping.source[index])
    return node.rows
  }

  #groupKeys(node: GroupNode, grouping: Grouping): string[] {
    node.keys ??= node.rowIndices.map((index) => this.keyAt(index, grouping.source[index]))
    return node.keys
  }

  #groupContext(node: GroupNode, grouping: Grouping): TableGroupContext {
    return {
      key: node.key,
      level: node.level,
      field: node.field,
      value: node.value,
      rows: this.#groupRows(node, grouping),
      expanded: this.#isGroupExpanded(node.key),
      summary: Object.fromEntries(this.#groupSummary(node, grouping)),
    }
  }

  /** The column aggregates of a group's rows, keyed by column id; the same `summary` the totals row uses. */
  #groupSummary(node: GroupNode, grouping: Grouping): Map<string, unknown> {
    const columns = this.resolvedColumns
    const inputs = [this.columnElements, this.columns, ...columns.map((column) => column.summary)]
    const cached = node.summary
    if (cached && cached.inputs.length === inputs.length && cached.inputs.every((input, index) => input === inputs[index])) return cached.values
    const rows = this.#groupRows(node, grouping)
    const values = new Map<string, unknown>()
    for (const column of columns) {
      if (typeof column.summary === 'function') values.set(columnKey(column), column.summary({ column, rows }))
      else if (column.summary && (column.field || column.running || column.countValue !== undefined))
        values.set(
          columnKey(column),
          aggregate(
            column.summary,
            rows.map((row) => this.cellValue(row, column)),
          ),
        )
    }
    node.summary = { inputs, values }
    return values
  }

  /** The item on display line `line`: its group, or the group at `level` above it. */
  #groupAtLevel(item: DisplayItem | undefined, level: number): GroupNode | undefined {
    let node: GroupNode | undefined = item?.kind === 'group' ? item.node : item?.parent
    while (node && node.level > level) node = node.parent
    return node?.level === level ? node : undefined
  }

  /** How many group levels a line sits under: the number of groups that can be stuck above it. */
  #depthOf(item: DisplayItem | undefined): number {
    if (!item) return 0
    return item.kind === 'group' ? item.node.level : item.parent.level + 1
  }

  /**
   * Blank lines above a page that starts inside a group, where that group's headers are repeated. Every page counts
   * `pageSize` lines of its own; the repeated headers come on top.
   */
  #pagePrefix(grouping: Grouping): number {
    return this.paginated && this.pageStart > 0 ? this.#depthOf(grouping.items[this.pageStart]) : 0
  }

  /**
   * The groups whose own row has scrolled past the header (or sits on an earlier page) while lines of theirs are
   * still on screen, outermost first. They are drawn stuck under the header, one line per level, the way CSS sticky
   * would place them — the real rows cannot do it themselves, as the virtualizer drops them once off screen.
   */
  #stuckGroups(grouping: Grouping): GroupNode[] {
    const count = this.rowCount
    if (count === 0) return []
    const start = this.pageStart
    const end = start + count - 1
    const scrollTop = Math.max(0, this.viewport?.scrollTop ?? 0)
    // `base + level` is the line behind the level's slot under the header; the page's blank lines come first.
    const base = start + Math.floor(scrollTop / this.rowHeightPx) - this.#pagePrefix(grouping)
    const stuck: GroupNode[] = []
    for (let level = 0; level < grouping.levels.length; level++) {
      const line = Math.min(end, Math.max(start, base + level))
      const node = this.#groupAtLevel(grouping.items[line], level)
      if (!node || node.position >= Math.max(start, base + level)) break
      stuck.push(node)
    }
    return stuck
  }

  /** Where the stuck group rows start: right under the header, whose height is themed. */
  #measureHeaderHeight() {
    if (!this.#grouping()) return
    const height = this.headerHeight()
    if (height > 0 && Math.abs(height - this.#headerHeightPx) > 0.01) {
      this.#headerHeightPx = height
      this.requestUpdate()
    }
  }

  // ---- The hooks of `c2-table` ------------------------------------------------------------------------------------

  /** Sorts, then while grouped gathers the rows of each group together in the order of the groups. */
  protected override orderRows(rows: TableRow[]): TableRow[] {
    const sorted = this.sortBySortModel(rows)
    const levels = this.groupBy?.length ? this.#groupLevels() : []
    if (this.dataSource || !levels.length) return sorted
    const ordered: TableRow[] = []
    const visit = (node: GroupNode) => {
      if (node.children.length) node.children.forEach(visit)
      else for (const index of node.rowIndices) ordered.push(sorted[index])
    }
    this.#buildGroupTree(sorted, levels).roots.forEach(visit)
    return ordered
  }

  protected override needsSort(changed: PropertyValues): boolean {
    return changed.has('groupBy')
  }

  protected override get structured(): boolean {
    return Boolean(this.#grouping())
  }

  protected override lineCount(): number | undefined {
    return this.#grouping()?.items.length
  }

  protected override get rowTotal(): number {
    // While grouped every row counts, including those in closed groups: a group's checkbox selects them too.
    return this.#grouping()?.source.length ?? this.rowCount
  }

  protected override rowIndexAt(line: number): number {
    const grouping = this.#grouping()
    if (!grouping) return line
    const item = grouping.items[line]
    return item?.kind === 'row' ? item.rowIndex : -1
  }

  protected override lineOfRow(index: number): number {
    const grouping = this.#grouping()
    return grouping ? grouping.items.findIndex((item) => item.kind === 'row' && item.rowIndex === index) : index
  }

  protected override renderLine(line: number, columns: TableColumnConfig[], pins: Map<string, PinPlacement>): unknown {
    const grouping = this.#grouping()
    const item = grouping?.items[line]
    return item?.kind === 'group' ? this.#renderGroupRow(item.node, line, columns, pins, grouping!, false) : undefined
  }

  protected override lineKey(line: number): string | undefined {
    const item = this.#grouping()?.items[line]
    return item?.kind === 'group' ? `group:${item.node.key}` : undefined
  }

  protected override rowLevel(line: number, columns?: TableColumnConfig[]): TableRowLevel | undefined {
    const grouping = this.#grouping()
    const item = grouping?.items[line]
    if (item?.kind === 'row') {
      const depth = item.parent.level + 1
      return { level: depth + 1, indent: depth, column: this.groupDisplay !== 'band' && columns ? hierarchyColumn(columns) : undefined }
    }
    return undefined
  }

  protected override renderAbove(columns: TableColumnConfig[], pins: Map<string, PinPlacement>): unknown {
    const grouping = this.#grouping()
    if (!grouping) {
      this.#echoSignature = ''
      return nothing
    }
    const stuck = this.#stuckGroups(grouping)
    this.#echoSignature = stuck.map((node) => node.key).join('\n')
    const prefix = this.#pagePrefix(grouping) * this.rowHeightPx
    return html`${
      stuck.length
        ? html`<div class="group-echoes" style=${styleMap({ top: `${this.#headerHeightPx}px` })}>
            ${stuck.map((node) => this.#renderGroupRow(node, -1, columns, pins, grouping, true))}
          </div>`
        : nothing
    }${prefix > 0 ? html`<div class="spacer spacer--group-prefix" style="height:${prefix}px"></div>` : nothing}`
  }

  protected override onViewportScroll() {
    const grouping = this.#grouping()
    if (!grouping) return
    const signature = this.#stuckGroups(grouping)
      .map((node) => node.key)
      .join('\n')
    if (signature !== this.#echoSignature) this.requestUpdate()
  }

  protected override handleLineKey(event: KeyboardEvent, columns: TableColumnConfig[]): boolean {
    let { row, column } = this.focusedCell
    const first = this.pageStart
    const grouping = this.#grouping()
    const groupItem = grouping && row >= 0 ? grouping.items[row] : undefined
    const groupNode = groupItem?.kind === 'group' ? groupItem.node : undefined
    // The treegrid keys act on the cell holding the tree (the whole row in a band): elsewhere ←/→ keep moving between cells.
    const onTree = Boolean(groupNode && (this.groupDisplay === 'band' || columns[column] === hierarchyColumn(columns)))

    if (groupNode && onTree && (event.key === 'ArrowRight' || event.key === 'ArrowLeft')) {
      event.preventDefault()
      const expanded = this.#isGroupExpanded(groupNode.key)
      if (event.key === 'ArrowRight' && !expanded) this.#toggleGroup(groupNode)
      else if (event.key === 'ArrowLeft' && expanded) this.#toggleGroup(groupNode)
      else if (event.key === 'ArrowLeft' && groupNode.parent && groupNode.parent.position >= first) row = groupNode.parent.position
      else if (event.key === 'ArrowRight' && this.groupDisplay !== 'band') column = Math.min(columns.length - 1, column + 1)
      this.focusedCell = { row, column }
      this.pendingFocus = true
      this.scrollToLine(row)
      return true
    }
    // modern-web-ignore: ime-enter the table renders no text field; keys from controls inside a cell (renderCell inputs) are dropped before this grid handler
    if (groupNode && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault()
      this.#toggleGroup(groupNode)
      return true
    }
    return false
  }

  /** While grouped: below the header and the groups stuck under it, counting the repeated headers of a page. */
  protected override scrollToStructuredLine(line: number): boolean {
    const grouping = this.#grouping()
    if (!grouping) return false
    const viewport = this.viewport
    if (!viewport) return true
    const height = this.rowHeightPx
    const top = (line - this.pageStart + this.#pagePrefix(grouping)) * height
    const covered = this.#depthOf(grouping.items[line]) * height
    const visible = viewport.clientHeight - this.headerHeight() - this.footerHeight()
    if (top - covered < viewport.scrollTop) viewport.scrollTop = Math.max(0, top - covered)
    else if (top + height > viewport.scrollTop + visible) viewport.scrollTop = top + height - visible
    return true
  }

  protected override lineInputs(): unknown {
    return this.#grouping()?.items
  }

  protected override willUpdate(changed: PropertyValues) {
    super.willUpdate(changed)
    if (this.detailHeight > 0 && !this.#warnedDetail && this.#groupLevels().length) {
      this.#warnedDetail = true
      console.warn('[c2-group-table] detail-height is ignored while the rows are grouped (group-by).')
    }
    if (this.dataSource && this.#groupLevels().length && !this.#warnedGroupedSource) {
      this.#warnedGroupedSource = true
      console.warn(
        '[c2-group-table] group-by is ignored with a dataSource: the table only holds the rows it has fetched, so it cannot know every group. Group the rows yourself, or pass them in rows.',
      )
    }
  }

  protected override updated(changed: PropertyValues) {
    super.updated(changed)
    this.#measureHeaderHeight()
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-group-table': GroupTable
  }
}
