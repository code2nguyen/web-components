import { LitElement, html, nothing, unsafeCSS, type PropertyValues, type TemplateResult } from 'lit'
import { customElement, property, query, state } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { ifDefined } from 'lit/directives/if-defined.js'
import { styleMap } from 'lit/directives/style-map.js'
import styles from './table.scss?inline'
import { arrayPropertyConverter, jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import { VirtualScrollController } from '@c2n/core/controllers/virtual-scroll.js'
import { COLUMN_CHANGE_EVENT, TableColumn } from './table-column.js'
import {
  getFieldValue,
  sortModelConverter,
  type ColumnPin,
  type SortDirection,
  type SortModel,
  type TableCellEventDetail,
  type TableColumnConfig,
  type TableColumnResizeEventDetail,
  type TableDataSource,
  type TableRow,
  type TableRowEventDetail,
  type TableSelectionChangeEventDetail,
  type TableSortChangeEventDetail,
} from './table-types.js'

import '@c2n/checkbox'
import '@c2n/spinner'
import type { Checkbox } from '@c2n/checkbox'

export type TableSelectionMode = 'none' | 'single' | 'multiple'
export type TableVirtualMode = 'auto' | 'always' | 'never'

/** Field of the synthetic checkbox column, so it can live in the same render pipeline as the real columns. */
const SELECTION_FIELD = '__c2-selection'

interface PinPlacement {
  side: ColumnPin
  offset: number
  edge: boolean
}

const HEADER_ROW = -1

function defaultCompare(a: unknown, b: unknown): number {
  if (a === b) return 0
  if (a === null || a === undefined || a === '') return 1
  if (b === null || b === undefined || b === '') return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b)
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime()
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
}

function numberFormatOptions(base: Intl.NumberFormatOptions, extra: Record<string, unknown> | undefined): Intl.NumberFormatOptions {
  return Object.assign({}, base, extra ?? {})
}

function dateFormatOptions(base: Intl.DateTimeFormatOptions, extra: Record<string, unknown> | undefined): Intl.DateTimeFormatOptions {
  return Object.assign({}, base, extra ?? {})
}

function humanize(field: string): string {
  const last = field.split('.').pop() ?? field
  const spaced = last.replace(/[_-]+/g, ' ').replace(/([a-z\d])([A-Z])/g, '$1 $2')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

/**
 * A data grid: a scrolling, virtualized table built from a `rows` array (or an async `dataSource`) and a set of
 * `c2-table-column` definitions given as light-DOM children. Sorting, row selection, column pinning, column resizing
 * and keyboard navigation are built in; every cell can be rendered by a function, so a cell body can be any markup —
 * including other c2 components.
 *
 * Rows and columns are readable from markup as JSON attributes as well as from script as properties, so a table can be
 * authored without a build step:
 *
 * ```html
 * <c2-table row-key="id" selection="multiple" checkbox-selection sortable stripe style="height: 320px">
 *   <c2-table-column field="name" header="Name" width="2fr" pinned="start"></c2-table-column>
 *   <c2-table-column field="score" header="Score" width="120px" align="end" format="number"></c2-table-column>
 * </c2-table>
 * ```
 *
 * **Layout.** The table is one CSS grid: the header row and every body row are grid items using `grid-template-columns:
 * subgrid`, so columns stay aligned without any scroll syncing, and pinned columns are `position: sticky` cells rather
 * than separate containers. Give the host a height (or `--c2-table--max-height`) — the body scrolls inside it.
 *
 * **Virtualization** windows the rows to the visible range plus an overscan margin. It needs a uniform row height, which
 * it measures from the first rendered row, so theme the height with `--c2-table__row--height` (`row-height` is only the
 * estimate used for the first paint). It turns on automatically past `virtual-threshold` rows; `virtual="always"` and
 * `virtual="never"` force it.
 *
 * @tag c2-table
 *
 * @slot default - The column definitions: `c2-table-column` elements. They render nothing themselves.
 * @slot toolbar - Bar above the header, for a title, filters or a column menu. Hidden when empty.
 * @slot footer - Bar below the rows, for a pager or a row count. Hidden when empty.
 * @slot empty - Replaces the built-in "no rows" message.
 * @slot loading - Replaces the built-in spinner shown while the first rows load.
 * @slot error - Replaces the built-in message shown when `error` is set.
 *
 * @slotcomponent c2-table-column - One column definition.
 *
 * @event {CustomEvent<TableSelectionChangeEventDetail>} selection-change - Fired after the user changes the selection. `detail.value` is the array of selected row keys, `detail.rows` the matching rows.
 * @event {CustomEvent<TableSortChangeEventDetail>} sort-change - Fired after the user clicks a sortable header. `detail.sort` is the new sort model, in priority order.
 * @event {CustomEvent<TableRowEventDetail>} row-click - Fired when a row is clicked, before the selection is applied.
 * @event {CustomEvent<TableCellEventDetail>} cell-click - Fired when a cell is clicked; adds `detail.column` and `detail.value`.
 * @event {CustomEvent<TableColumnResizeEventDetail>} column-resize - Fired when the user releases a column's resize handle.
 *
 * @cssproperty {color} [--c2-table--background=#ffffff]
 * @cssproperty {color} [--c2-table--color=#18181b]
 * @cssproperty {font-size} [--c2-table--font-size=14px]
 * @cssproperty {pixel} [--c2-table--max-height=none] - Caps the height when the host is not sized itself; the body scrolls.
 *
 * @cssproperty {border} [--c2-table--border-top=1px solid #e4e4e7]
 * @cssproperty {border} [--c2-table--border-right=1px solid #e4e4e7]
 * @cssproperty {border} [--c2-table--border-bottom=1px solid #e4e4e7]
 * @cssproperty {border} [--c2-table--border-left=1px solid #e4e4e7]
 *
 * @cssproperty {border-radius} [--c2-table--border-top-left-radius=8px]
 * @cssproperty {border-radius} [--c2-table--border-top-right-radius=8px]
 * @cssproperty {border-radius} [--c2-table--border-bottom-left-radius=8px]
 * @cssproperty {border-radius} [--c2-table--border-bottom-right-radius=8px]
 *
 * @cssproperty {box-shadow} [--c2-table--box-shadow=none]
 *
 * @cssproperty {color} [--c2-table__header--background=#fafafa]
 * @cssproperty {color} [--c2-table__header--color=#71717a]
 * @cssproperty {pixel} [--c2-table__header--height=36px]
 * @cssproperty {font-size} [--c2-table__header--font-size=12px]
 * @cssproperty {font-weight} [--c2-table__header--font-weight=600]
 * @cssproperty {letter-spacing} [--c2-table__header--letter-spacing=0.02em]
 * @cssproperty {border} [--c2-table__header--border-bottom=1px solid #e4e4e7]
 *
 * @cssproperty {padding} [--c2-table__header-cell--padding=0 12px]
 * @cssproperty {pixel} [--c2-table__header-cell--gap=6px]
 * @cssproperty {color} [--c2-table__header-cell__hover--background=#f4f4f5]
 * @cssproperty {color} [--c2-table__header-cell__sorted--color=#18181b]
 *
 * @cssproperty {pixel} [--c2-table__sort-icon--width=14px]
 * @cssproperty {pixel} [--c2-table__sort-icon--height=14px]
 * @cssproperty {color} [--c2-table__sort-icon--color=#a1a1aa]
 * @cssproperty {color} [--c2-table__sort-icon__active--color=rgb(2, 101, 220)]
 *
 * @cssproperty {pixel} [--c2-table__resizer--width=5px]
 * @cssproperty {color} [--c2-table__resizer--color=transparent]
 * @cssproperty {color} [--c2-table__resizer__hover--color=rgb(2, 101, 220)]
 *
 * @cssproperty {pixel} [--c2-table__row--height=36px] - Row height; virtualization measures it, so keep it uniform.
 * @cssproperty {border} [--c2-table__row--border-bottom=1px solid #e4e4e7]
 * @cssproperty {color} [--c2-table__row__hover--background=#fafafa]
 * @cssproperty {color} [--c2-table__row__odd--background=#fafafa] - Applies with the `stripe` attribute.
 * @cssproperty {color} [--c2-table__row__selected--background=#edf1fe]
 * @cssproperty {color} [--c2-table__row__selected--color=#18181b]
 *
 * @cssproperty {padding} [--c2-table__cell--padding=0 12px]
 * @cssproperty {pixel} [--c2-table__cell--gap=8px]
 * @cssproperty {font-size} [--c2-table__cell--font-size=14px]
 * @cssproperty {color} [--c2-table__cell--color=#18181b]
 * @cssproperty {border} [--c2-table__cell--border-right=none] - Vertical grid lines; applies to header cells too.
 * @cssproperty {outline} [--c2-table__cell__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {pixel} [--c2-table__cell__focus--outline-offset=-2px]
 *
 * @cssproperty {box-shadow} [--c2-table__pinned-start--box-shadow=1px 0 0 0 #e4e4e7] - Separator on the last column pinned to the start.
 * @cssproperty {box-shadow} [--c2-table__pinned-end--box-shadow=-1px 0 0 0 #e4e4e7] - Separator on the first column pinned to the end.
 *
 * @cssproperty {pixel} [--c2-table__selection-cell--width=44px] - Width of the `checkbox-selection` column.
 *
 * @cssproperty {color} [--c2-table__skeleton--background=#f4f4f5] - Placeholder shown in cells whose `dataSource` block is still loading.
 * @cssproperty {border-radius} [--c2-table__skeleton--border-radius=4px]
 *
 * @cssproperty {color} [--c2-table__state--color=#71717a] - Colour of the empty and loading messages.
 * @cssproperty {padding} [--c2-table__state--padding=32px 12px]
 * @cssproperty {font-size} [--c2-table__state--font-size=14px]
 * @cssproperty {color} [--c2-table__state__error--color=rgb(211, 21, 16)]
 *
 * @cssproperty {color} [--c2-table__toolbar--background=transparent]
 * @cssproperty {padding} [--c2-table__toolbar--padding=8px 12px]
 * @cssproperty {border} [--c2-table__toolbar--border-bottom=1px solid #e4e4e7]
 *
 * @cssproperty {color} [--c2-table__footer--background=transparent]
 * @cssproperty {padding} [--c2-table__footer--padding=8px 12px]
 * @cssproperty {border} [--c2-table__footer--border-top=1px solid #e4e4e7]
 */
@customElement('c2-table')
export class Table extends LitElement {
  static override styles = unsafeCSS(styles)

  @query('.viewport') private viewport!: HTMLElement | null

  /** The rows to display. An array in the property, JSON in the attribute. */
  @property({ converter: jsonPropertyConverter }) rows: TableRow[] = []

  /** Column definitions, as an alternative to `c2-table-column` children. Children win when both are present. */
  @property({ converter: jsonPropertyConverter }) columns?: TableColumnConfig[]

  /** Field used as the identity of a row, for selection and DOM reuse. Falls back to the row index. */
  @property({ type: String, attribute: 'row-key' }) rowKey = ''

  /** `single` selects one row at a time, `multiple` supports ⌘/ctrl-click and shift-click ranges. */
  @property({ type: String }) selection: TableSelectionMode = 'none'

  /** Adds a leading checkbox column, pinned to the start. */
  @property({ type: Boolean, attribute: 'checkbox-selection' }) checkboxSelection = false

  /** Keys of the selected rows: an array in the property, `;`-separated in the attribute. */
  @property({ converter: arrayPropertyConverter, reflect: true }) value: string[] = []

  /** The sort, in priority order: `SortModel[]` in the property, `field:asc;other:desc` in the `sort` attribute. */
  @property({ converter: sortModelConverter, attribute: 'sort', reflect: true }) sortModel: SortModel[] = []

  /** Lets shift-click add a column to the sort instead of replacing it. */
  @property({ type: Boolean, attribute: 'multi-sort' }) multiSort = false

  /** Makes every column sortable; a column's own `sortable` still wins. */
  @property({ type: Boolean }) sortable = false

  /** Makes every column resizable; a column's own `resizable` still wins. */
  @property({ type: Boolean }) resizable = false

  /** Tints odd rows with `--c2-table__row__odd--background`. */
  @property({ type: Boolean, reflect: true }) stripe = false

  /** `auto` virtualizes past `virtual-threshold` rows; `always` and `never` force it. */
  @property({ type: String }) virtual: TableVirtualMode = 'auto'

  /** Row height in pixels used before the first row has been measured. */
  @property({ type: Number, attribute: 'row-height' }) rowHeight = 36

  /** Rows rendered above and below the viewport while virtualizing. */
  @property({ type: Number }) overscan = 6

  /** Row count past which `virtual="auto"` starts windowing. */
  @property({ type: Number, attribute: 'virtual-threshold' }) virtualThreshold = 100

  /** Lazy row source used instead of `rows`; the table requests one block at a time as rows scroll into view. */
  @property({ attribute: false }) dataSource?: TableDataSource

  /** Number of rows the table asks a `dataSource` for at a time. */
  @property({ type: Number, attribute: 'block-size' }) blockSize = 100

  /** Shows the loading state; implied while a `dataSource` resolves its first block. */
  @property({ type: Boolean, reflect: true }) loading = false

  /** Shows the error state with this message. */
  @property({ type: String }) error = ''

  /** Message shown when there are no rows. */
  @property({ type: String, attribute: 'empty-message' }) emptyMessage = 'No rows'

  @state() private columnElements: TableColumn[] = []
  @state() private widthOverrides: Record<string, number> = {}
  @state() private focusedCell: { row: number; column: number } = { row: HEADER_ROW, column: 0 }
  @state() private hasToolbar = false
  @state() private hasFooter = false
  @state() private remoteTotal = -1

  #sortedRows: TableRow[] = []
  #blocks = new Map<number, TableRow[]>()
  #pendingBlocks = new Set<number>()
  #measuredWidths = new Map<string, number>()
  #measuredRowHeight = 0
  #selectionAnchor = -1
  #pendingFocus = false
  #requestToken = 0

  #virtualizer = new VirtualScrollController(this, {
    scrollElement: () => this.viewport,
    itemCount: () => this.rowCount,
    itemHeight: () => this.#rowHeightPx,
    overscan: () => this.overscan,
    enabled: () => this.isVirtualized,
  })

  /** Number of rows the table knows about: `rows.length`, or the `dataSource` total. */
  get rowCount(): number {
    return this.dataSource ? Math.max(0, this.remoteTotal) : this.#sortedRows.length
  }

  /** Whether the rows are currently windowed. */
  get isVirtualized(): boolean {
    if (this.virtual === 'never') return false
    if (this.virtual === 'always') return true
    return this.rowCount > this.virtualThreshold
  }

  get #rowHeightPx(): number {
    return this.#measuredRowHeight || this.rowHeight
  }

  get #isBootstrapping(): boolean {
    return Boolean(this.dataSource) && this.remoteTotal < 0 && !this.error
  }

  /** The resolved, ordered, visible columns — children first, then the `columns` property, then one per key of the first row. */
  get resolvedColumns(): TableColumnConfig[] {
    const source: TableColumnConfig[] = this.columnElements.length ? this.columnElements : (this.columns ?? this.#autoColumns())
    const visible = source.filter((column) => column.field && !column.hidden)
    return [
      ...visible.filter((column) => column.pinned === 'start'),
      ...visible.filter((column) => !column.pinned),
      ...visible.filter((column) => column.pinned === 'end'),
    ]
  }

  /** The rows currently selected. Only the loaded ones when a `dataSource` is used. */
  getSelectedRows(): TableRow[] {
    const keys = new Set(this.value)
    const selected: TableRow[] = []
    for (let index = 0; index < this.rowCount; index++) {
      const row = this.#rowAt(index)
      if (row && keys.has(this.#keyAt(index, row))) selected.push(row)
    }
    return selected
  }

  /** Selects every loaded row. No-op unless `selection="multiple"`. */
  selectAll() {
    if (this.selection !== 'multiple') return
    const keys: string[] = []
    for (let index = 0; index < this.rowCount; index++) {
      const row = this.#rowAt(index)
      if (row) keys.push(this.#keyAt(index, row))
    }
    this.#commitSelection(keys)
  }

  /** Clears the selection. */
  clearSelection() {
    this.#commitSelection([])
  }

  /** Scrolls the row at `index` into view. */
  scrollToIndex(index: number) {
    this.#virtualizer.scrollToIndex(index, this.#headerHeight())
  }

  /** Drops the `dataSource` cache and reloads the visible rows. */
  refresh() {
    if (this.dataSource) this.#resetRemote()
    this.requestUpdate()
  }

  protected override willUpdate(changed: PropertyValues) {
    if (!this.hasUpdated || changed.has('rows') || changed.has('sortModel') || changed.has('columns') || changed.has('columnElements')) this.#applySort()
    if (changed.has('dataSource') || changed.has('blockSize') || (this.dataSource && changed.has('sortModel'))) this.#resetRemote()
    if (this.rowCount === 0 && this.focusedCell.row !== HEADER_ROW) this.focusedCell = { row: HEADER_ROW, column: this.focusedCell.column }
  }

  protected override updated(changed: PropertyValues) {
    super.updated(changed)
    this.#measureRowHeight()
    this.#measureColumnWidths()
    this.#syncFocusToWindow()
    if (this.#pendingFocus) {
      this.#pendingFocus = false
      this.renderRoot.querySelector<HTMLElement>('.cell[tabindex="0"]')?.focus()
    }
    if (this.dataSource) this.#ensureBlocks()
  }

  override render() {
    const columns = this.#renderColumns()
    const pins = this.#pinPlacements(columns)
    const range = this.#virtualizer.range
    const rowCount = this.rowCount

    return html`
      <div class="toolbar" part="toolbar" ?hidden=${!this.hasToolbar}>
        <slot name="toolbar" @slotchange=${(event: Event) => (this.hasToolbar = this.#slotHasContent(event))}></slot>
      </div>
      <div class="viewport" part="viewport">
        <div
          class="grid"
          role="grid"
          part="grid"
          aria-rowcount=${rowCount + 1}
          aria-colcount=${columns.length}
          aria-busy=${this.loading || this.#isBootstrapping ? 'true' : 'false'}
          style=${styleMap({ '--_grid-template': this.#gridTemplate(columns) })}
          @keydown=${this.#handleKeyDown}
        >
          ${this.#renderHeaderRow(columns, pins)} ${range.paddingTop > 0 ? html`<div class="spacer" style="height:${range.paddingTop}px"></div>` : nothing}
          ${this.#renderBody(columns, pins, range.start, range.end)}
          ${range.paddingBottom > 0 ? html`<div class="spacer" style="height:${range.paddingBottom}px"></div>` : nothing}
        </div>
      </div>
      <div class="footer" part="footer" ?hidden=${!this.hasFooter}>
        <slot name="footer" @slotchange=${(event: Event) => (this.hasFooter = this.#slotHasContent(event))}></slot>
      </div>
      <slot class="definitions" @slotchange=${this.#handleDefinitionsChange}></slot>
    `
  }

  #renderBody(columns: TableColumnConfig[], pins: Map<string, PinPlacement>, start: number, end: number): unknown {
    if (this.error) {
      return html`<div class="row row--state" role="row">
        <div class="cell cell--state cell--state-error" role="gridcell" part="state"><slot name="error">${this.error}</slot></div>
      </div>`
    }
    if (this.rowCount === 0) {
      const isLoading = this.loading || this.#isBootstrapping
      return html`<div class="row row--state" role="row">
        <div class="cell cell--state" role="gridcell" part="state">
          ${isLoading ? html`<slot name="loading"><c2-spinner></c2-spinner></slot>` : html`<slot name="empty">${this.emptyMessage}</slot>`}
        </div>
      </div>`
    }
    const rows: TemplateResult[] = []
    for (let index = start; index < end; index++) rows.push(this.#renderRow(index, columns, pins))
    return rows
  }

  #renderHeaderRow(columns: TableColumnConfig[], pins: Map<string, PinPlacement>) {
    return html`
      <div class="row row--header" role="row" aria-rowindex="1" part="header-row">
        ${columns.map((column, columnIndex) => this.#renderHeaderCell(column, columnIndex, pins))}
      </div>
    `
  }

  #renderHeaderCell(column: TableColumnConfig, columnIndex: number, pins: Map<string, PinPlacement>) {
    if (column.field === SELECTION_FIELD) {
      const total = this.rowCount
      const selected = this.value.length
      const allSelected = total > 0 && selected >= total
      return html`
        <div
          class=${classMap({ cell: true, 'cell--header': true, 'cell--selection': true, ...this.#pinClasses(column, pins) })}
          role="columnheader"
          part="header-cell selection-header-cell"
          data-field=${column.field}
          aria-colindex=${columnIndex + 1}
          tabindex=${this.#tabIndexFor(HEADER_ROW, columnIndex)}
          style=${styleMap(this.#pinStyle(column, pins))}
        >
          <c2-checkbox
            aria-label="Select all rows"
            ?checked=${allSelected}
            ?indeterminate=${selected > 0 && !allSelected}
            ?disabled=${this.selection !== 'multiple' || Boolean(this.dataSource)}
            @change=${this.#handleSelectAll}
          ></c2-checkbox>
        </div>
      `
    }

    const sortable = column.sortable ?? this.sortable
    const sortIndex = this.sortModel.findIndex((entry) => entry.field === column.field)
    const sort = sortIndex >= 0 ? this.sortModel[sortIndex] : undefined
    const resizable = column.resizable ?? this.resizable

    return html`
      <div
        class=${classMap({
          cell: true,
          'cell--header': true,
          'cell--sortable': sortable,
          'cell--sorted': Boolean(sort),
          [`cell--align-${column.align ?? 'start'}`]: true,
          ...this.#pinClasses(column, pins),
        })}
        role="columnheader"
        part="header-cell"
        data-field=${column.field}
        aria-colindex=${columnIndex + 1}
        aria-sort=${ifDefined(sortable ? (sort ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none') : undefined)}
        tabindex=${this.#tabIndexFor(HEADER_ROW, columnIndex)}
        style=${styleMap(this.#pinStyle(column, pins))}
        @click=${(event: MouseEvent) => {
          this.focusedCell = { row: HEADER_ROW, column: columnIndex }
          this.#toggleSort(column, event.shiftKey)
        }}
      >
        <span class="cell-content">${column.renderHeader ? column.renderHeader({ column }) : (column.header ?? humanize(column.field))}</span>
        ${sortable ? this.#renderSortIcon(sort?.direction) : nothing}
        ${sort && this.sortModel.length > 1 ? html`<span class="sort-order">${sortIndex + 1}</span>` : nothing}
        ${resizable ? html`<span class="resizer" part="resizer" @pointerdown=${(event: PointerEvent) => this.#startResize(event, column)}></span>` : nothing}
      </div>
    `
  }

  #renderSortIcon(direction: SortDirection | undefined) {
    return html`
      <svg
        class=${classMap({ 'sort-icon': true, 'sort-icon--active': Boolean(direction), 'sort-icon--desc': direction === 'desc' })}
        part="sort-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M12 19V5" />
        <path d="M5 12l7-7 7 7" />
      </svg>
    `
  }

  #renderRow(index: number, columns: TableColumnConfig[], pins: Map<string, PinPlacement>) {
    const row = this.#rowAt(index)
    const key = row ? this.#keyAt(index, row) : ''
    const selected = key !== '' && this.value.includes(key)
    const selectable = this.selection !== 'none'

    return html`
      <div
        class=${classMap({ row: true, 'row--odd': index % 2 === 1, 'row--selected': selected, 'row--clickable': selectable })}
        role="row"
        part=${selected ? 'row row-selected' : 'row'}
        aria-rowindex=${index + 2}
        aria-selected=${ifDefined(selectable ? String(selected) : undefined)}
        @click=${(event: MouseEvent) => this.#handleRowClick(event, index)}
      >
        ${columns.map((column, columnIndex) => this.#renderCell(row, index, column, columnIndex, pins))}
      </div>
    `
  }

  #renderCell(row: TableRow | undefined, rowIndex: number, column: TableColumnConfig, columnIndex: number, pins: Map<string, PinPlacement>) {
    const classes = {
      cell: true,
      [`cell--align-${column.align ?? 'start'}`]: true,
      'cell--selection': column.field === SELECTION_FIELD,
      ...this.#pinClasses(column, pins),
      ...(column.cellClass ? { [column.cellClass]: true } : {}),
    }
    const shared = {
      class: classMap(classes),
      tabindex: this.#tabIndexFor(rowIndex, columnIndex),
      style: styleMap(this.#pinStyle(column, pins)),
    }

    if (column.field === SELECTION_FIELD) {
      const key = row ? this.#keyAt(rowIndex, row) : ''
      return html`
        <div
          class=${shared.class}
          role="gridcell"
          part="cell selection-cell"
          aria-colindex=${columnIndex + 1}
          tabindex=${shared.tabindex}
          style=${shared.style}
        >
          ${
            row
              ? html`<c2-checkbox
                  aria-label="Select row"
                  ?checked=${this.value.includes(key)}
                  @click=${(event: Event) => event.stopPropagation()}
                  @change=${() => this.#handleCheckboxToggle(rowIndex)}
                ></c2-checkbox>`
              : nothing
          }
        </div>
      `
    }

    const value = getFieldValue(row, column.field)
    const content = row
      ? column.renderCell
        ? column.renderCell({ value, row, rowIndex, column })
        : this.#formatValue(column, value)
      : html`<span class="skeleton" part="skeleton"></span>`

    return html`
      <div
        class=${shared.class}
        role="gridcell"
        part="cell cell-${column.field.replace(/[^\w-]/g, '-')}"
        aria-colindex=${columnIndex + 1}
        tabindex=${shared.tabindex}
        style=${shared.style}
        @click=${() => this.#handleCellClick(rowIndex, columnIndex, column, value)}
      >
        <span class="cell-content">${content}</span>
      </div>
    `
  }

  #renderColumns(): TableColumnConfig[] {
    const columns = this.resolvedColumns
    if (!this.checkboxSelection) return columns
    const selectionColumn: TableColumnConfig = {
      field: SELECTION_FIELD,
      header: '',
      width: 'var(--c2-table__selection-cell--width, 44px)',
      minWidth: 32,
      align: 'center',
      pinned: 'start',
    }
    return [selectionColumn, ...columns]
  }

  #autoColumns(): TableColumnConfig[] {
    const first = Array.isArray(this.rows) ? this.rows[0] : undefined
    if (!first) return []
    return Object.keys(first).map((field) => ({ field, header: humanize(field) }))
  }

  #gridTemplate(columns: TableColumnConfig[]): string {
    return columns.map((column) => (this.widthOverrides[column.field] ? `${this.widthOverrides[column.field]}px` : column.width || '1fr')).join(' ')
  }

  #pinPlacements(columns: TableColumnConfig[]): Map<string, PinPlacement> {
    const placements = new Map<string, PinPlacement>()
    const startColumns = columns.filter((column) => column.pinned === 'start')
    const endColumns = columns.filter((column) => column.pinned === 'end')

    let offset = 0
    startColumns.forEach((column, index) => {
      placements.set(column.field, { side: 'start', offset, edge: index === startColumns.length - 1 })
      offset += this.#columnWidth(column)
    })

    offset = 0
    for (let index = endColumns.length - 1; index >= 0; index--) {
      const column = endColumns[index]
      placements.set(column.field, { side: 'end', offset, edge: index === 0 })
      offset += this.#columnWidth(column)
    }

    return placements
  }

  #columnWidth(column: TableColumnConfig): number {
    return this.widthOverrides[column.field] ?? this.#measuredWidths.get(column.field) ?? 0
  }

  #pinClasses(column: TableColumnConfig, pins: Map<string, PinPlacement>): Record<string, boolean> {
    const pin = pins.get(column.field)
    if (!pin) return {}
    return {
      'cell--pinned': true,
      'cell--pinned-edge-start': pin.side === 'start' && pin.edge,
      'cell--pinned-edge-end': pin.side === 'end' && pin.edge,
    }
  }

  #pinStyle(column: TableColumnConfig, pins: Map<string, PinPlacement>): Record<string, string> {
    const pin = pins.get(column.field)
    if (!pin) return {}
    return pin.side === 'start' ? { left: `${pin.offset}px` } : { right: `${pin.offset}px` }
  }

  #tabIndexFor(rowIndex: number, columnIndex: number): number {
    return this.focusedCell.row === rowIndex && this.focusedCell.column === columnIndex ? 0 : -1
  }

  #formatValue(column: TableColumnConfig, value: unknown): string {
    if (value === null || value === undefined || value === '') return ''
    const locale = column.locale
    const extra = column.formatOptions
    try {
      switch (column.format) {
        case 'number':
          return new Intl.NumberFormat(locale, numberFormatOptions({}, extra)).format(Number(value))
        case 'percent':
          return new Intl.NumberFormat(locale, numberFormatOptions({ style: 'percent' }, extra)).format(Number(value))
        case 'currency':
          return new Intl.NumberFormat(locale, numberFormatOptions({ style: 'currency', currency: column.currency ?? 'USD' }, extra)).format(Number(value))
        case 'date':
          return new Intl.DateTimeFormat(locale, dateFormatOptions({ dateStyle: 'medium' }, extra)).format(new Date(value as string))
        case 'datetime':
          return new Intl.DateTimeFormat(locale, dateFormatOptions({ dateStyle: 'medium', timeStyle: 'short' }, extra)).format(new Date(value as string))
        case 'time':
          return new Intl.DateTimeFormat(locale, dateFormatOptions({ timeStyle: 'short' }, extra)).format(new Date(value as string))
        default:
          return String(value)
      }
    } catch {
      return String(value)
    }
  }

  #rowAt(index: number): TableRow | undefined {
    if (this.dataSource) {
      const block = Math.floor(index / this.blockSize)
      return this.#blocks.get(block)?.[index % this.blockSize]
    }
    return this.#sortedRows[index]
  }

  #keyAt(index: number, row: TableRow): string {
    if (!this.rowKey) return String(index)
    const value = getFieldValue(row, this.rowKey)
    return value === null || value === undefined ? String(index) : String(value)
  }

  #applySort() {
    const rows = Array.isArray(this.rows) ? this.rows : []
    if (this.dataSource || this.sortModel.length === 0) {
      this.#sortedRows = rows
      return
    }
    const columns = this.resolvedColumns
    this.#sortedRows = [...rows].sort((left, right) => {
      for (const entry of this.sortModel) {
        const column = columns.find((candidate) => candidate.field === entry.field)
        const comparator = column?.comparator ?? defaultCompare
        const result = comparator(getFieldValue(left, entry.field), getFieldValue(right, entry.field))
        if (result !== 0) return entry.direction === 'desc' ? -result : result
      }
      return 0
    })
  }

  #resetRemote() {
    this.#requestToken++
    this.#blocks.clear()
    this.#pendingBlocks.clear()
    this.remoteTotal = -1
  }

  #ensureBlocks() {
    if (!this.dataSource || this.error) return
    if (this.remoteTotal < 0) {
      void this.#fetchBlock(0)
      return
    }
    const { start, end } = this.#virtualizer.range
    if (end <= start) return
    const firstBlock = Math.floor(start / this.blockSize)
    const lastBlock = Math.floor((end - 1) / this.blockSize)
    for (let block = firstBlock; block <= lastBlock; block++) void this.#fetchBlock(block)
  }

  async #fetchBlock(block: number) {
    const dataSource = this.dataSource
    if (!dataSource || this.#blocks.has(block) || this.#pendingBlocks.has(block)) return
    this.#pendingBlocks.add(block)
    const token = this.#requestToken
    try {
      const result = await dataSource.getRows({ start: block * this.blockSize, count: this.blockSize, sort: this.sortModel })
      if (token !== this.#requestToken) return
      this.#blocks.set(block, result.rows ?? [])
      if (typeof result.total === 'number') this.remoteTotal = result.total
      else if (this.remoteTotal < 0) this.remoteTotal = block * this.blockSize + (result.rows?.length ?? 0)
      this.requestUpdate()
    } catch (error) {
      if (token === this.#requestToken) {
        this.error = error instanceof Error ? error.message : String(error)
        if (this.remoteTotal < 0) this.remoteTotal = 0
      }
    } finally {
      this.#pendingBlocks.delete(block)
    }
  }

  override connectedCallback() {
    super.connectedCallback()
    this.addEventListener(COLUMN_CHANGE_EVENT, this.#handleColumnChange)
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    this.removeEventListener(COLUMN_CHANGE_EVENT, this.#handleColumnChange)
  }

  #handleDefinitionsChange = (event: Event) => {
    this.#collectColumns(event.target as HTMLSlotElement)
  }

  /** A column definition changed one of its own properties: re-read them all, keeping the event inside the table. */
  #handleColumnChange = (event: Event) => {
    event.stopPropagation()
    this.#collectColumns()
  }

  #collectColumns(slot?: HTMLSlotElement) {
    const target = slot ?? this.renderRoot.querySelector<HTMLSlotElement>('slot.definitions')
    if (!target) return
    // A definition may be wrapped: in the docs app every element of an example is an Astro island, so the assigned
    // child is the wrapper and the column is its first element child.
    this.columnElements = target
      .assignedElements({ flatten: true })
      .map((element) => (element instanceof TableColumn ? element : element.firstElementChild))
      .filter((element): element is TableColumn => element instanceof TableColumn)
  }

  #slotHasContent(event: Event): boolean {
    return (event.target as HTMLSlotElement)
      .assignedNodes({ flatten: true })
      .some((node) => node.nodeType !== Node.TEXT_NODE || Boolean(node.textContent?.trim()))
  }

  #toggleSort(column: TableColumnConfig, additive: boolean) {
    if (column.field === SELECTION_FIELD) return
    if (!(column.sortable ?? this.sortable)) return
    const existing = this.sortModel.find((entry) => entry.field === column.field)
    const direction: SortDirection | undefined = !existing ? 'asc' : existing.direction === 'asc' ? 'desc' : undefined
    const rest = additive && this.multiSort ? this.sortModel.filter((entry) => entry.field !== column.field) : []
    this.sortModel = direction ? [...rest, { field: column.field, direction }] : rest
    this.dispatchEvent(new CustomEvent<TableSortChangeEventDetail>('sort-change', { detail: { sort: this.sortModel }, bubbles: true, composed: true }))
  }

  #handleRowClick(event: MouseEvent, index: number) {
    const row = this.#rowAt(index)
    if (!row) return
    const key = this.#keyAt(index, row)
    this.dispatchEvent(new CustomEvent<TableRowEventDetail>('row-click', { detail: { row, rowIndex: index, key }, bubbles: true, composed: true }))
    if (this.selection === 'none') return
    this.#applySelection(index, { toggle: event.metaKey || event.ctrlKey, range: event.shiftKey })
  }

  #handleCellClick(rowIndex: number, columnIndex: number, column: TableColumnConfig, value: unknown) {
    const row = this.#rowAt(rowIndex)
    if (!row) return
    this.focusedCell = { row: rowIndex, column: columnIndex }
    this.dispatchEvent(
      new CustomEvent<TableCellEventDetail>('cell-click', {
        detail: { row, rowIndex, key: this.#keyAt(rowIndex, row), column, value },
        bubbles: true,
        composed: true,
      }),
    )
  }

  #handleCheckboxToggle(index: number) {
    this.#applySelection(index, { toggle: true, range: false })
  }

  #handleSelectAll = (event: Event) => {
    event.stopPropagation()
    if ((event.target as Checkbox).checked) this.selectAll()
    else this.clearSelection()
  }

  #applySelection(index: number, modifiers: { toggle: boolean; range: boolean }) {
    const row = this.#rowAt(index)
    if (!row) return
    const key = this.#keyAt(index, row)

    if (this.selection === 'single') {
      this.#selectionAnchor = index
      this.#commitSelection(modifiers.toggle && this.value.includes(key) ? [] : [key])
      return
    }

    if (modifiers.range && this.#selectionAnchor >= 0) {
      const from = Math.min(this.#selectionAnchor, index)
      const to = Math.max(this.#selectionAnchor, index)
      const keys = new Set(modifiers.toggle ? this.value : [])
      for (let cursor = from; cursor <= to; cursor++) {
        const rangeRow = this.#rowAt(cursor)
        if (rangeRow) keys.add(this.#keyAt(cursor, rangeRow))
      }
      this.#commitSelection([...keys])
      return
    }

    this.#selectionAnchor = index
    if (modifiers.toggle) {
      this.#commitSelection(this.value.includes(key) ? this.value.filter((entry) => entry !== key) : [...this.value, key])
      return
    }
    this.#commitSelection([key])
  }

  #commitSelection(keys: string[]) {
    this.value = keys
    this.dispatchEvent(
      new CustomEvent<TableSelectionChangeEventDetail>('selection-change', {
        detail: { value: keys, rows: this.getSelectedRows() },
        bubbles: true,
        composed: true,
      }),
    )
  }

  #startResize(event: PointerEvent, column: TableColumnConfig) {
    event.preventDefault()
    event.stopPropagation()
    const handle = event.currentTarget as HTMLElement
    const headerCell = handle.parentElement
    if (!headerCell) return
    const startWidth = headerCell.getBoundingClientRect().width
    const startX = event.clientX
    const minWidth = column.minWidth ?? 64
    let width = Math.round(startWidth)

    const move = (moveEvent: PointerEvent) => {
      width = Math.max(minWidth, Math.round(startWidth + moveEvent.clientX - startX))
      this.widthOverrides = { ...this.widthOverrides, [column.field]: width }
    }
    const finish = (upEvent: PointerEvent) => {
      handle.releasePointerCapture(upEvent.pointerId)
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('pointerup', finish)
      handle.removeEventListener('pointercancel', finish)
      handle.classList.remove('resizer--active')
      this.dispatchEvent(
        new CustomEvent<TableColumnResizeEventDetail>('column-resize', { detail: { field: column.field, width }, bubbles: true, composed: true }),
      )
    }

    handle.setPointerCapture(event.pointerId)
    handle.classList.add('resizer--active')
    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', finish)
    handle.addEventListener('pointercancel', finish)
  }

  #handleKeyDown = (event: KeyboardEvent) => {
    const columns = this.#renderColumns()
    if (columns.length === 0) return
    const rowCount = this.rowCount
    let { row, column } = this.focusedCell
    const pageSize = Math.max(1, Math.floor((this.viewport?.clientHeight ?? 0) / this.#rowHeightPx) - 1)

    switch (event.key) {
      case 'ArrowDown':
        row = Math.min(rowCount - 1, row + 1)
        break
      case 'ArrowUp':
        row = Math.max(HEADER_ROW, row - 1)
        break
      case 'ArrowRight':
        column = Math.min(columns.length - 1, column + 1)
        break
      case 'ArrowLeft':
        column = Math.max(0, column - 1)
        break
      case 'Home':
        if (event.ctrlKey || event.metaKey) row = HEADER_ROW
        column = 0
        break
      case 'End':
        if (event.ctrlKey || event.metaKey) row = rowCount - 1
        column = columns.length - 1
        break
      case 'PageDown':
        row = Math.min(rowCount - 1, Math.max(0, row) + pageSize)
        break
      case 'PageUp':
        row = Math.max(0, row - pageSize)
        break
      case 'Enter':
      case ' ': {
        event.preventDefault()
        if (row === HEADER_ROW) this.#toggleSort(columns[column], event.shiftKey)
        else if (this.selection !== 'none') this.#applySelection(row, { toggle: event.key === ' ' || event.ctrlKey || event.metaKey, range: event.shiftKey })
        return
      }
      default:
        return
    }

    event.preventDefault()
    this.focusedCell = { row, column }
    this.#pendingFocus = true
    if (row >= 0) this.scrollToIndex(row)
  }

  #headerHeight(): number {
    return this.renderRoot.querySelector('.row--header')?.getBoundingClientRect().height ?? 0
  }

  #measureRowHeight() {
    const first = this.renderRoot.querySelector('.row:not(.row--header):not(.row--state)')
    if (!first) return
    // Not rounded: the spacers model the whole list as `count * height`, so a fraction of a pixel per row turns into
    // thousands of pixels of drift between the scrollbar and the rendered window over a long list.
    const height = first.getBoundingClientRect().height
    if (height > 0 && Math.abs(height - this.#measuredRowHeight) > 0.01) {
      this.#measuredRowHeight = height
      this.requestUpdate()
    }
  }

  #measureColumnWidths() {
    const cells = this.renderRoot.querySelectorAll<HTMLElement>('.cell--header[data-field]')
    let pinnedChanged = false
    for (const cell of cells) {
      const field = cell.dataset.field
      if (!field) continue
      const width = Math.round(cell.getBoundingClientRect().width)
      if (width > 0 && this.#measuredWidths.get(field) !== width) {
        this.#measuredWidths.set(field, width)
        if (cell.classList.contains('cell--pinned')) pinnedChanged = true
      }
    }
    if (pinnedChanged) this.requestUpdate()
  }

  /** Keeps the roving tabindex on a rendered cell: follows the window when focused, falls back to the header otherwise. */
  #syncFocusToWindow() {
    const { row, column } = this.focusedCell
    if (row < 0) return
    const { start, end } = this.#virtualizer.range
    if (row >= start && row < end) return
    const shadowRoot = this.renderRoot as ShadowRoot
    if (shadowRoot.activeElement) {
      this.focusedCell = { row: Math.min(Math.max(row, start), Math.max(start, end - 1)), column }
      this.#pendingFocus = true
    } else {
      this.focusedCell = { row: HEADER_ROW, column }
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-table': Table
  }
}
