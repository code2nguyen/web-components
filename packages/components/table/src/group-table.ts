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
import { aggregate, CHEVRON, columnKey, keyListConverter, rowKeyListConverter, SELECTION_FIELD, type PinPlacement, type TableRowLevel } from './table-shared.js'
import {
  getFieldValue,
  groupByConverter,
  type TableChildrenErrorEventDetail,
  type TableChildrenLoader,
  type TableColumnConfig,
  type TableGroupBy,
  type TableGroupContext,
  type TableGroupDisplay,
  type TableGroupRenderer,
  type TableGroupToggleEventDetail,
  type TableRow,
  type TableRowToggleEventDetail,
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

/** One row of a tree (`children-field`). */
interface TreeNode {
  row: TableRow
  /** Position in the flattened rows (`sortedRows`): every row of the tree, depth first, sorted among its siblings. */
  index: number
  key: string
  level: number
  parent?: TreeNode
  /** The child rows, sorted; undefined for a leaf and for a parent `loadChildren` has not answered yet. */
  children?: TreeNode[]
  /** The children field holds `true`: the children come from `loadChildren`. */
  lazy: boolean
  /** The leaf rows under the row, the inputs of its `rollup` columns. */
  leaves: TableRow[]
  rollup?: Map<string, unknown>
}

interface TreeRows {
  roots: TreeNode[]
  /** Indexed like the flattened rows. */
  nodes: TreeNode[]
  byKey: Map<string, TreeNode>
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

/** Events fired by {@link GroupTable}: those of `c2-table`, and the opening and closing of groups and tree rows. */
export interface GroupTableEventMap extends TableEventMap {
  'group-toggle': CustomEvent<TableGroupToggleEventDetail>
  'row-toggle': CustomEvent<TableRowToggleEventDetail>
  'children-error': CustomEvent<TableChildrenErrorEventDetail>
}

export interface GroupTable {
  addEventListener: TypedAddEventListener<GroupTable, GroupTableEventMap>
  removeEventListener: TypedRemoveEventListener<GroupTable, GroupTableEventMap>
}

/**
 * `c2-table` with groups and a tree: the same grid, columns, sorting, selection, pinning, windowing, paging, summary
 * row, editing and realtime updates, plus collapsible groups of rows (`group-by`) and nested rows (`children-field`).
 * Every attribute, property, event, part and CSS variable of `c2-table` works here as well; what follows is what the
 * groups and the tree add. Use `c2-table` when the rows have neither: it leaves this code out.
 *
 * ```html
 * <c2-group-table row-key="id" group-by="region" selection="multiple" checkbox-selection>
 *   <c2-table-column field="customer" header="Customer"></c2-table-column>
 *   <c2-table-column field="region" hidden></c2-table-column>
 *   <c2-table-column field="amount" format="currency" align="end" summary="sum"></c2-table-column>
 * </c2-group-table>
 * ```
 *
 * **Grouping.** `group-by="region,status"` gathers the rows into collapsible groups, outermost level first; the grid
 * becomes a `treegrid`. With the default `group-display="row"` each group is a row of the grid: its label and row
 * count in the first column (or the one marked `group-column`), and under every column with a `summary` that
 * aggregate over the group's rows, formatted like the column. `group-display="band"` draws one full-width band per
 * group instead. A group is named by its path, `region=EMEA/status=Paid`: `expanded-groups` lists the open ones
 * (every group is open until then, or closed with `groups-collapsed`), `group-toggle` reports a click, and a group's
 * checkbox selects its rows. The groups of the rows at the top stay under the header while their rows scroll, and
 * a page that starts inside a group repeats its headers; pages count display lines, so a closed group takes one.
 * Grouping is done on the client and does not apply to a `dataSource`.
 *
 * **Tree.** `children-field="children"` reads each row's child rows from that field, nested to any depth, and the grid
 * becomes a `treegrid`: every row is a row of the grid, and the first column (or the one marked `group-column`) gets
 * a chevron and an indentation per level. Rows open with a click on the chevron, ←/→ on that column, `expandRow()` or
 * `expanded-rows` (the keys of the open rows; all closed until then, or open with `tree-expanded`), and `row-toggle`
 * reports a click. Sorting orders each level among its siblings. A column with `rollup="sum"` (or `avg`, `min`, `max`,
 * `count`, or a function) shows in a parent row the aggregate of the leaf rows under it, and the summary row counts
 * leaves only. With `selection="multiple"` a row is selected with the rows under it, and a parent is selected when
 * all its children are; its checkbox shows the mixed state in between. A row whose field holds `true` loads its
 * children from `loadChildren` when it first opens. Give the rows a `row-key`. The tree is built on the client and
 * does not apply to a `dataSource`.
 *
 * ```html
 * <c2-group-table row-key="id" children-field="children" tree-expanded>
 *   <c2-table-column field="name" header="Account"></c2-table-column>
 *   <c2-table-column field="amount" format="currency" align="end" rollup="sum"></c2-table-column>
 * </c2-group-table>
 * ```
 *
 * @tag c2-group-table
 *
 * @slot group:{groupKey} - Label of one group, e.g. `slot="group:region=EMEA"`, in place of its formatted value and row count. The copy of the group kept under the header while its rows scroll shows the built-in label.
 *
 * @event {CustomEvent<TableGroupToggleEventDetail>} group-toggle - Fired after the user opens or closes a group, with its `key`, whether it is now `expanded`, and the `group` itself (its rows and aggregates). `expandedGroups` already holds the new state. Does not bubble.
 * @event {CustomEvent<TableRowToggleEventDetail>} row-toggle - Fired after the user opens or closes a row of a tree, with its `key`, the `row` and whether it is now `expanded`. `expandedRows` already holds the new state. Does not bubble.
 * @event {CustomEvent<TableChildrenErrorEventDetail>} children-error - Fired when `loadChildren` rejects, with the row's `key`, the `row` and the `error`. The row has closed again. Does not bubble.
 *
 * @csspart group-row - Every group row. Also `group-row-level-<n>` (0 for the outermost level), `group-band` with `group-display="band"`, and `group-row-echo` on a copy kept under the header.
 * @csspart group-cell - Every cell of a group row. Each also carries `group-cell-<id>`, named after its column.
 * @csspart group-toggle - The chevron of a group row.
 * @csspart row-toggle - The chevron of a tree row (`children-field`), in the tree column; kept as an empty space on a leaf so labels line up. Turns into a spinner while `loadChildren` runs.
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

  /**
   * Turns the rows into a tree: the field (a dotted path is fine) holding each row's child rows, nested to any depth.
   * A row whose field holds `true` has children `loadChildren` delivers when it is first opened. Wins over `group-by`;
   * not applied to a `dataSource`.
   */
  @property({ type: String, attribute: 'children-field' }) childrenField = ''

  /**
   * Keys of the open rows of a tree. While unset, every row follows `tree-expanded`; the first toggle writes the full
   * list here. `;`-separated in the attribute.
   */
  @property({ converter: rowKeyListConverter, attribute: 'expanded-rows' }) expandedRows?: string[]

  /** Starts every parent row of a tree open while `expandedRows` is unset. */
  @property({ type: Boolean, attribute: 'tree-expanded' }) treeExpanded = false

  /**
   * Loads the children of a tree row whose `children-field` holds `true`, the first time it opens. A rejection closes
   * the row again and fires `children-error`; the next open asks again. Needs `row-key`. Property only.
   */
  @property({ attribute: false }) loadChildren?: TableChildrenLoader

  #groupingCache?: { treeInputs: unknown[]; itemInputs: unknown[]; grouping: Grouping }

  #warnedGroupedSource = false

  #warnedTreeSource = false
  #warnedDetail = false

  #tree?: TreeRows

  #treeCache?: { inputs: unknown[]; lines: TreeNode[]; wanted: TreeNode[] }

  #partialCache?: { inputs: unknown[]; keys: Set<string> }

  #openRows?: { source: string[]; keys: Set<string> }

  #loadedChildren = new Map<string, TableRow[]>()

  #pendingChildren = new Set<string>()

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

  /** Opens every group, or in a tree every row whose children are loaded. */
  expandAll() {
    const grouping = this.#grouping()
    if (grouping) this.expandedGroups = [...grouping.nodes.keys()]
    else if (this.#tree) this.expandedRows = this.#tree.nodes.filter((node) => node.children?.length).map((node) => node.key)
  }

  /** Closes every group, or every row of a tree. */
  collapseAll() {
    if (this.#tree) this.expandedRows = []
    else this.expandedGroups = []
  }

  /** Opens the tree row with `key`, loading its children if needed. Does not fire `row-toggle`. */
  expandRow(key: string) {
    this.#setRowExpanded(key, true)
  }

  /** Closes the tree row with `key`. */
  collapseRow(key: string) {
    this.#setRowExpanded(key, false)
  }

  /** The column holding the group tree: the one marked `group-column`, else the first data column. */
  #groupTreeColumn(columns: TableColumnConfig[]): TableColumnConfig | undefined {
    return columns.find((column) => column.groupColumn && column.field !== SELECTION_FIELD) ?? columns.find((column) => column.field !== SELECTION_FIELD)
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
    const treeColumn = this.#groupTreeColumn(columns)
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

  /** The chevron of a tree row, indented by its depth; a leaf keeps the room empty so labels line up across levels. */
  #renderRowToggle(node: TreeNode) {
    const parent = this.#isParent(node)
    return html`<span
      class=${classMap({ 'group-toggle': true, 'row-toggle': true, 'row-toggle--leaf': !parent })}
      part="row-toggle"
      style=${styleMap({ '--_group-level': String(node.level) })}
      @click=${(event: Event) => {
        if (!parent) return
        event.stopPropagation()
        this.#toggleRow(node)
      }}
      >${this.#pendingChildren.has(node.key) ? html`<c2-spinner></c2-spinner>` : CHEVRON}</span
    >`
  }

  /**
   * Builds the tree of `children-field`: nodes and their rollups first, from the leaves up, then every level sorted
   * (by the rolled-up values where a column has them) and numbered depth first — the order of the flattened rows.
   */
  #buildTree(rows: TableRow[]): TreeRows {
    const columns = this.resolvedColumns.filter((column) => column.rollup)
    const build = (list: TableRow[], level: number, parent?: TreeNode): TreeNode[] =>
      list
        .filter((row) => row && typeof row === 'object')
        .map((row) => {
          const node: TreeNode = { row, index: -1, key: '', level, parent, lazy: false, leaves: [row] }
          const value = getFieldValue(row, this.childrenField)
          const identity = this.identityOf(row)
          const children = Array.isArray(value) ? value : identity === undefined ? undefined : this.#loadedChildren.get(identity)
          if (children) {
            node.children = build(children, level + 1, node)
            if (node.children.length) {
              node.leaves = node.children.flatMap((child) => child.leaves)
              node.rollup = new Map()
              for (const column of columns) {
                const rollup = column.rollup!
                node.rollup.set(
                  columnKey(column),
                  typeof rollup === 'function'
                    ? rollup({ column, rows: node.leaves })
                    : column.running
                      ? // A running total follows the order of the rows, which is only known once the tree is built.
                        undefined
                      : aggregate(
                          rollup,
                          node.leaves.map((leaf) => this.cellValue(leaf, column)),
                        ),
                )
              }
            }
          } else node.lazy = value === true && identity !== undefined
          return node
        })
    const nodes: TreeNode[] = []
    const byKey = new Map<string, TreeNode>()
    const number = (list: TreeNode[]): TreeNode[] =>
      this.sortBySortModel(list, (node, field, column) => {
        const id = column && columnKey(column)
        // The value the cell shows, so a parent sorts by its rollup even when that is empty.
        return id && node.rollup?.has(id) ? node.rollup.get(id) : getFieldValue(node.row, field)
      }).map((node) => {
        node.index = nodes.push(node) - 1
        node.key = this.keyAt(node.index, node.row)
        byKey.set(node.key, node)
        if (node.children) node.children = number(node.children)
        return node
      })
    return { roots: number(build(rows, 0)), nodes, byKey }
  }

  /** The tree rows on display, depth first, skipping the children of closed rows; undefined unless the rows are a tree. */
  #treeLines(): TreeNode[] | undefined {
    const tree = this.#tree
    if (!tree) return undefined
    const inputs = [tree, this.expandedRows, this.treeExpanded]
    const cached = this.#treeCache
    if (cached && cached.inputs.every((input, index) => input === inputs[index])) return cached.lines
    const lines: TreeNode[] = []
    const wanted: TreeNode[] = []
    const visit = (list: TreeNode[]) => {
      for (const node of list) {
        lines.push(node)
        if (!this.#isParent(node) || !this.#isRowExpanded(node.key)) continue
        if (node.children) visit(node.children)
        else wanted.push(node)
      }
    }
    visit(tree.roots)
    this.#treeCache = { inputs, lines, wanted }
    return lines
  }

  #isParent(node: TreeNode): boolean {
    return node.lazy || Boolean(node.children?.length)
  }

  #isRowExpanded(key: string): boolean {
    const open = this.expandedRows
    if (!open) return this.treeExpanded
    if (this.#openRows?.source !== open) this.#openRows = { source: open, keys: new Set(open) }
    return this.#openRows.keys.has(key)
  }

  #setRowExpanded(key: string, expanded: boolean): boolean {
    const tree = this.#tree
    const node = tree?.byKey.get(key)
    if (!node || !this.#isParent(node) || this.#isRowExpanded(key) === expanded) return false
    // Until a row is toggled the list is implicit; write it out whole so it reads back as the state on screen.
    const current = this.expandedRows ?? (this.treeExpanded ? tree!.nodes.filter((entry) => this.#isParent(entry)).map((entry) => entry.key) : [])
    this.expandedRows = expanded ? [...current, key] : current.filter((entry) => entry !== key)
    return true
  }

  #toggleRow(node: TreeNode) {
    const expanded = !this.#isRowExpanded(node.key)
    if (!this.#setRowExpanded(node.key, expanded)) return
    this.dispatchEvent(
      new CustomEvent<TableRowToggleEventDetail>('row-toggle', { detail: { key: node.key, row: node.row, expanded }, bubbles: false, composed: true }),
    )
  }

  /** Asks `loadChildren` for the children of an open row, once at a time; a selected parent passes its selection on. */
  async #fetchChildren({ key, row, level }: TreeNode) {
    const loaded = this.#loadedChildren
    if (!this.loadChildren || this.#pendingChildren.has(key)) return
    this.#pendingChildren.add(key)
    this.requestUpdate()
    try {
      const children = await this.loadChildren({ row, key, level })
      if (loaded !== this.#loadedChildren) return
      loaded.set(key, Array.isArray(children) ? children : [])
      this.applySort()
      if (this.selection === 'multiple' && this.value.includes(key)) {
        const keys = new Set(this.value)
        this.#cascade(keys, key, true)
        this.commitSelection([...keys])
      }
    } catch (error) {
      if (loaded !== this.#loadedChildren) return
      this.#setRowExpanded(key, false)
      this.dispatchEvent(new CustomEvent<TableChildrenErrorEventDetail>('children-error', { detail: { key, row, error }, bubbles: false, composed: true }))
    } finally {
      this.#pendingChildren.delete(key)
      this.requestUpdate()
    }
  }

  /**
   * Turns row `key` on or off in `selected`. In a tree the rows under it go with it, and unless `settle` is false its
   * ancestors are settled: a parent is selected exactly when all its children are.
   */
  #cascade(selected: Set<string>, key: string, on: boolean, settle = true) {
    const node = this.#tree?.byKey.get(key)
    if (on) selected.add(key)
    else selected.delete(key)
    if (!node) return
    const visit = (entry: TreeNode) => {
      if (on) selected.add(entry.key)
      else selected.delete(entry.key)
      entry.children?.forEach(visit)
    }
    node.children?.forEach(visit)
    if (settle) this.#settle(selected, node.parent, on)
  }

  /** Selects `parent` and the ancestors above it whose children are now all selected, or clears them when `on` is false. */
  #settle(selected: Set<string>, parent: TreeNode | undefined, on: boolean) {
    for (; parent; parent = parent.parent) {
      if (!on) selected.delete(parent.key)
      else if (parent.children!.every((child) => selected.has(child.key))) selected.add(parent.key)
      else break
    }
  }

  /** Keys of the unselected tree rows with a selected row under them: their checkbox shows the mixed state. */
  #partialKeys(): Set<string> {
    const inputs = [this.#tree, this.value]
    const cached = this.#partialCache
    if (cached && cached.inputs.every((input, index) => input === inputs[index])) return cached.keys
    const selected = new Set(this.value)
    const keys = new Set<string>()
    for (const key of this.value) {
      for (let parent = this.#tree?.byKey.get(key)?.parent; parent && !selected.has(parent.key) && !keys.has(parent.key); parent = parent.parent) {
        keys.add(parent.key)
      }
    }
    this.#partialCache = { inputs, keys }
    return keys
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
    // Read per rendered row, so an ungrouped table leaves before allocating anything. A tree wins over grouping.
    if (!this.groupBy?.length || this.#tree) return undefined
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

  /** The flattened tree while `children-field` is set, otherwise the rows in group order. */
  protected override buildRows(rows: TableRow[]): TableRow[] {
    this.#tree = this.childrenField && !this.dataSource ? this.#buildTree(rows) : undefined
    return this.#tree ? this.#tree.nodes.map((node) => node.row) : this.orderRows(rows)
  }

  protected override needsSort(changed: PropertyValues): boolean {
    // A tree's keys, rollups and loaded children depend on the key too; a grouping on its levels.
    return changed.has('groupBy') || changed.has('childrenField') || Boolean(this.childrenField && (changed.has('rowKey') || changed.has('getRowKey')))
  }

  protected override get structured(): boolean {
    return Boolean(this.#tree || this.#grouping())
  }

  protected override get childField(): string {
    return this.childrenField
  }

  protected override lineCount(): number | undefined {
    return this.#grouping()?.items.length ?? this.#treeLines()?.length
  }

  protected override get rowTotal(): number {
    // While grouped or in a tree every row counts, including those in closed groups and under closed rows: a
    // parent's checkbox selects them too.
    return this.#grouping()?.source.length ?? (this.#tree ? this.sortedRows.length : this.rowCount)
  }

  protected override rowIndexAt(line: number): number {
    const tree = this.#treeLines()
    if (tree) return tree[line]?.index ?? -1
    const grouping = this.#grouping()
    if (!grouping) return line
    const item = grouping.items[line]
    return item?.kind === 'row' ? item.rowIndex : -1
  }

  protected override lineOfRow(index: number): number {
    const grouping = this.#grouping()
    const tree = this.#treeLines()
    return grouping
      ? grouping.items.findIndex((item) => item.kind === 'row' && item.rowIndex === index)
      : tree
        ? tree.findIndex((node) => node.index === index)
        : index
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
      return { level: depth + 1, indent: depth, column: this.groupDisplay !== 'band' && columns ? this.#groupTreeColumn(columns) : undefined }
    }
    const node = this.#treeLines()?.[line]
    if (!node) return undefined
    return {
      level: node.level + 1,
      indent: 0,
      expanded: this.#isParent(node) ? this.#isRowExpanded(node.key) : undefined,
      busy: this.#pendingChildren.has(node.key),
      column: columns ? this.#groupTreeColumn(columns) : undefined,
      toggle: () => this.#renderRowToggle(node),
      rollup: node.rollup,
    }
  }

  protected override isPartial(key: string): boolean {
    return Boolean(this.#tree) && this.#partialKeys().has(key)
  }

  /**
   * Turns row `key` on or off in `keys`. In a tree the rows under it go with it, and its ancestors are settled: a
   * parent is selected exactly when all its children are.
   */
  protected override cascade(keys: Set<string>, key: string, on: boolean) {
    this.#cascade(keys, key, on)
  }

  protected override selectRange(keys: Set<string>, range: string[]) {
    // In a tree the parents are settled once at the end, deepest first, rather than after every row of the range.
    const parents = new Set<TreeNode>()
    for (const key of range) {
      this.#cascade(keys, key, true, false)
      const parent = this.#tree?.byKey.get(key)?.parent
      if (parent) parents.add(parent)
    }
    for (const parent of [...parents].sort((a, b) => b.level - a.level)) this.#settle(keys, parent, true)
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
    const onTree = Boolean(groupNode && (this.groupDisplay === 'band' || columns[column] === this.#groupTreeColumn(columns)))

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
    // The same keys in a tree: ← closes an open row, then climbs to its parent; → opens a closed one.
    const lines = this.#treeLines()
    const node = lines && row >= 0 ? lines[row] : undefined
    if (node && columns[column] === this.#groupTreeColumn(columns) && (event.key === 'ArrowRight' || event.key === 'ArrowLeft')) {
      event.preventDefault()
      const open = this.#isParent(node) && this.#isRowExpanded(node.key)
      const parentLine = node.parent ? lines!.indexOf(node.parent) : -1
      if (event.key === 'ArrowRight' && this.#isParent(node) && !open) this.#toggleRow(node)
      else if (event.key === 'ArrowLeft' && open) this.#toggleRow(node)
      else if (event.key === 'ArrowLeft' && parentLine >= first) row = parentLine
      else column = Math.min(columns.length - 1, Math.max(0, column + (event.key === 'ArrowRight' ? 1 : -1)))
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

  /** In a tree only the leaves count: a parent's figures are its children's, and would be counted twice. */
  protected override inSummary(index: number): boolean {
    return !this.#tree?.nodes[index]?.children?.length
  }

  protected override lineInputs(): unknown {
    return this.#grouping()?.items ?? this.#treeLines()
  }

  protected override hiddenAutoField(): string {
    return this.childrenField
  }

  protected override willUpdate(changed: PropertyValues) {
    // Replaced rather than cleared, so a load still in flight for the old tree knows to drop its answer. A new
    // `loadChildren` keeps what is loaded: a framework may pass a fresh closure on every render.
    if (changed.has('childrenField')) this.#loadedChildren = new Map()
    super.willUpdate(changed)
    if (this.dataSource && this.childrenField && !this.#warnedTreeSource) {
      this.#warnedTreeSource = true
      console.warn('[c2-group-table] children-field is ignored with a dataSource. Pass the rows in rows, and load children with loadChildren.')
    }
    if (this.detailHeight > 0 && !this.#warnedDetail && (this.childrenField || this.#groupLevels().length)) {
      this.#warnedDetail = true
      console.warn('[c2-group-table] detail-height is ignored while the rows are grouped (group-by) or a tree (children-field).')
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
    // Open rows whose children `loadChildren` still owes: opened by a click, `expandRow` or `expanded-rows` alike.
    if (this.#tree) for (const node of this.#treeCache?.wanted ?? []) void this.#fetchChildren(node)
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-group-table': GroupTable
  }
}
