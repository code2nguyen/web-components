import { html, unsafeCSS, type PropertyValues } from 'lit'
import { classMap } from 'lit/directives/class-map.js'
import { styleMap } from 'lit/directives/style-map.js'
import { customElement } from '@c2n/core/element-helper.js'
import { property } from '@c2n/core/lit-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import styles from './tree-table.scss?inline'
import { Table, type TableEventMap } from './table.js'
import { aggregate, CHEVRON, columnKey, hierarchyColumn, rowKeyListConverter, type TableRowLevel } from './table-shared.js'
import {
  getFieldValue,
  type TableChildrenErrorEventDetail,
  type TableChildrenLoader,
  type TableColumnConfig,
  type TableRow,
  type TableRowToggleEventDetail,
} from './table-types.js'

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

/** Events fired by {@link TreeTable}: those of `c2-table`, and the opening and closing of rows and their loading. */
export interface TreeTableEventMap extends TableEventMap {
  'row-toggle': CustomEvent<TableRowToggleEventDetail>
  'children-error': CustomEvent<TableChildrenErrorEventDetail>
}

export interface TreeTable {
  addEventListener: TypedAddEventListener<TreeTable, TreeTableEventMap>
  removeEventListener: TypedRemoveEventListener<TreeTable, TreeTableEventMap>
}

/**
 * `c2-table` with nested rows: the same grid, columns, sorting, selection, pinning, windowing, paging, summary row,
 * editing and realtime updates, plus rows nested to any depth (`children-field`). Every attribute, property, event,
 * part and CSS variable of `c2-table` works here as well; what follows is what the tree adds. Use `c2-table` when the
 * rows are flat and `c2-group-table` to gather flat rows into groups: each leaves this code out.
 *
 * `children-field="children"` reads each row's child rows from that field, nested to any depth, and the grid becomes a
 * `treegrid`: every row is a row of the grid, and the first column (or the one marked `group-column`) gets a chevron
 * and an indentation per level. Rows open with a click on the chevron, ←/→ on that column, `expandRow()` or
 * `expanded-rows` (the keys of the open rows; all closed until then, or open with `tree-expanded`), and `row-toggle`
 * reports a click. Sorting orders each level among its siblings, and a filter keeps a row that passes it with the
 * rows above it. A column with `rollup="sum"` (or `avg`, `min`, `max`, `count`, or a function) shows in a parent row
 * the aggregate of the leaf rows under it, and the summary row counts leaves only. With `selection="multiple"` a row
 * is selected with the rows under it, and a parent is selected when all its children are; its checkbox shows the
 * mixed state in between. A row whose field holds `true` loads its children from `loadChildren` when it first opens.
 * Give the rows a `row-key`. The tree is built on the client and does not apply to a `dataSource`.
 *
 * ```html
 * <c2-tree-table row-key="id" children-field="children" tree-expanded>
 *   <c2-table-column field="name" header="Account"></c2-table-column>
 *   <c2-table-column field="amount" format="currency" align="end" rollup="sum"></c2-table-column>
 * </c2-tree-table>
 * ```
 *
 * @tag c2-tree-table
 *
 * @event {CustomEvent<TableRowToggleEventDetail>} row-toggle - Fired after the user opens or closes a row, with its `key`, the `row` and whether it is now `expanded`. `expandedRows` already holds the new state. Does not bubble.
 * @event {CustomEvent<TableChildrenErrorEventDetail>} children-error - Fired when `loadChildren` rejects, with the row's `key`, the `row` and the `error`. The row has closed again. Does not bubble.
 *
 * @csspart row-toggle - The chevron of a row, in the tree column; kept as an empty space on a leaf so labels line up. Turns into a spinner while `loadChildren` runs.
 *
 * @cssproperty {pixel} [--c2-table__group--indent=24px] - Indentation per level of the tree.
 */
@customElement('c2-tree-table')
export class TreeTable extends Table {
  static override styles = [Table.styles, unsafeCSS(styles)]

  /**
   * Turns the rows into a tree: the field (a dotted path is fine) holding each row's child rows, nested to any depth.
   * A row whose field holds `true` has children `loadChildren` delivers when it is first opened. Not applied to a `dataSource`.
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

  #warnedTreeSource = false

  #warnedDetail = false

  #tree?: TreeRows

  #treeCache?: { inputs: unknown[]; lines: TreeNode[]; wanted: TreeNode[] }

  #partialCache?: { inputs: unknown[]; keys: Set<string> }

  #openRows?: { source: string[]; keys: Set<string> }

  #loadedChildren = new Map<string, TableRow[]>()

  #pendingChildren = new Set<string>()

  /** Opens the tree row with `key`, loading its children if needed. Does not fire `row-toggle`. */
  expandRow(key: string) {
    this.#setRowExpanded(key, true)
  }

  /** Closes the tree row with `key`. */
  collapseRow(key: string) {
    this.#setRowExpanded(key, false)
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
  #buildTree(rows: TableRow[], test = this.filterTest()): TreeRows {
    const columns = this.resolvedColumns.filter((column) => column.rollup)
    const build = (list: TableRow[], level: number, parent?: TreeNode): TreeNode[] =>
      list
        .filter((row) => row && typeof row === 'object')
        .flatMap((row) => {
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
          // A filter keeps a row that passes it and the rows above one that does, so a match is never orphaned.
          return !test || test(row) || node.children?.length ? [node] : []
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

  /** Opens every row whose children are loaded. */
  expandAll() {
    if (this.#tree) this.expandedRows = this.#tree.nodes.filter((node) => node.children?.length).map((node) => node.key)
  }

  /** Closes every row. */
  collapseAll() {
    this.expandedRows = []
  }

  // ---- The hooks of `c2-table` ------------------------------------------------------------------------------------

  /** The flattened tree, depth first, each level sorted among its siblings. */
  protected override buildRows(rows: TableRow[]): TableRow[] {
    this.#tree = this.childrenField && !this.dataSource ? this.#buildTree(rows) : undefined
    return this.#tree ? this.#tree.nodes.map((node) => node.row) : this.orderRows(rows)
  }

  /** A tree filters while it is built (`#buildTree`): a parent stays while one of its descendants passes. */
  protected override filterRows(rows: TableRow[], skip?: string): TableRow[] {
    return this.childrenField && !this.dataSource ? rows : super.filterRows(rows, skip)
  }

  /** A column's values are counted over every row the other filters keep, at every level. */
  protected override filterValueRows(skip: string): TableRow[] {
    if (!this.childrenField || this.dataSource) return super.filterValueRows(skip)
    return this.#buildTree(this.sourceRows(), this.filterTest(skip)).nodes.map((node) => node.row)
  }

  protected override needsSort(changed: PropertyValues): boolean {
    // A tree's keys, rollups and loaded children depend on the key too.
    return changed.has('childrenField') || Boolean(this.childrenField && (changed.has('rowKey') || changed.has('getRowKey')))
  }

  protected override get structured(): boolean {
    return Boolean(this.#tree)
  }

  protected override get childField(): string {
    return this.childrenField
  }

  protected override lineCount(): number | undefined {
    return this.#treeLines()?.length
  }

  protected override get rowTotal(): number {
    // Every row counts, including those under closed rows: a parent's checkbox selects them too.
    return this.#tree ? this.sortedRows.length : this.rowCount
  }

  protected override rowIndexAt(line: number): number {
    const tree = this.#treeLines()
    return tree ? (tree[line]?.index ?? -1) : line
  }

  protected override lineOfRow(index: number): number {
    const tree = this.#treeLines()
    return tree ? tree.findIndex((node) => node.index === index) : index
  }

  protected override rowLevel(line: number, columns?: TableColumnConfig[]): TableRowLevel | undefined {
    const node = this.#treeLines()?.[line]
    if (!node) return undefined
    return {
      level: node.level + 1,
      indent: 0,
      expanded: this.#isParent(node) ? this.#isRowExpanded(node.key) : undefined,
      busy: this.#pendingChildren.has(node.key),
      column: columns ? hierarchyColumn(columns) : undefined,
      toggle: () => this.#renderRowToggle(node),
      rollup: node.rollup,
    }
  }

  protected override isPartial(key: string): boolean {
    return Boolean(this.#tree) && this.#partialKeys().has(key)
  }

  /** Turns row `key` on or off in `keys` with the rows under it, and settles its ancestors. */
  protected override cascade(keys: Set<string>, key: string, on: boolean) {
    this.#cascade(keys, key, on)
  }

  protected override selectRange(keys: Set<string>, range: string[]) {
    // The parents are settled once at the end, deepest first, rather than after every row of the range.
    const parents = new Set<TreeNode>()
    for (const key of range) {
      this.#cascade(keys, key, true, false)
      const parent = this.#tree?.byKey.get(key)?.parent
      if (parent) parents.add(parent)
    }
    for (const parent of [...parents].sort((a, b) => b.level - a.level)) this.#settle(keys, parent, true)
  }

  /** ← closes an open row, then climbs to its parent; → opens a closed one; elsewhere the arrows move between cells. */
  protected override handleLineKey(event: KeyboardEvent, columns: TableColumnConfig[]): boolean {
    let { row, column } = this.focusedCell
    const lines = this.#treeLines()
    const node = lines && row >= 0 ? lines[row] : undefined
    if (!node || columns[column] !== hierarchyColumn(columns) || (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft')) return false
    event.preventDefault()
    const open = this.#isParent(node) && this.#isRowExpanded(node.key)
    const parentLine = node.parent ? lines!.indexOf(node.parent) : -1
    if (event.key === 'ArrowRight' && this.#isParent(node) && !open) this.#toggleRow(node)
    else if (event.key === 'ArrowLeft' && open) this.#toggleRow(node)
    else if (event.key === 'ArrowLeft' && parentLine >= this.pageStart) row = parentLine
    else column = Math.min(columns.length - 1, Math.max(0, column + (event.key === 'ArrowRight' ? 1 : -1)))
    this.focusedCell = { row, column }
    this.pendingFocus = true
    this.scrollToLine(row)
    return true
  }

  /** Only the leaves count: a parent's figures are its children's, and would be counted twice. */
  protected override inSummary(index: number): boolean {
    return !this.#tree?.nodes[index]?.children?.length
  }

  protected override lineInputs(): unknown {
    return this.#treeLines()
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
      console.warn('[c2-tree-table] children-field is ignored with a dataSource. Pass the rows in rows, and load children with loadChildren.')
    }
    if (this.detailHeight > 0 && this.childrenField && !this.#warnedDetail) {
      this.#warnedDetail = true
      console.warn('[c2-tree-table] detail-height is ignored while the rows are a tree (children-field).')
    }
  }

  protected override updated(changed: PropertyValues) {
    super.updated(changed)
    // Open rows whose children `loadChildren` still owes: opened by a click, `expandRow` or `expanded-rows` alike.
    if (this.#tree) for (const node of this.#treeCache?.wanted ?? []) void this.#fetchChildren(node)
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-tree-table': TreeTable
  }
}
