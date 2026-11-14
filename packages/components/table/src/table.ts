import { LitElement, html, nothing, unsafeCSS, type CSSResultGroup, type PropertyValues } from 'lit'
import { query, state } from 'lit/decorators.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { classMap } from 'lit/directives/class-map.js'
import { ifDefined } from 'lit/directives/if-defined.js'
import { guard } from 'lit/directives/guard.js'
import { live } from 'lit/directives/live.js'
import { repeat } from 'lit/directives/repeat.js'
import { styleMap } from 'lit/directives/style-map.js'
import styles from './table.scss?inline'
import { property, jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import { VirtualScrollController, type VirtualScrollRange } from '@c2n/core/controllers/virtual-scroll.js'
import { SlotPresenceController } from '@c2n/core/dom-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import { tableMessages } from './messages.js'
import { defaultCompare } from '@c2n/core/data-helper.js'
import { provideContextMenuData } from '@c2n/core/context-menu-helper.js'
import { provide } from '@lit/context'
import { PAGER_CONNECT_EVENT, pagerContext, type PagerConnectEventDetail, type PagerContext } from '@c2n/core/contexts/pager.js'
import { COLUMN_CHANGE_EVENT, TableColumn } from './table-column.js'
import {
  getFieldValue,
  sortModelConverter,
  type SortDirection,
  type SortModel,
  type TableCellChangeEventDetail,
  type TableCellContext,
  type TableCellError,
  type TableCellEventDetail,
  type TableCellOption,
  type TableChanges,
  type TableCellFlag,
  type TableColumnConfig,
  type TableColumnResizeEventDetail,
  type TableFilterChangeEventDetail,
  type TableFilters,
  type TableDataSource,
  type TableDetailRenderer,
  type TableDetailToggleEventDetail,
  type TableRangeChangeEventDetail,
  type TableRenderedRow,
  type TableRow,
  type TableRowEventDetail,
  type TableRowPartResolver,
  type TableRowRule,
  type TableRowsChangeEventDetail,
  type TableRowStyler,
  type TableSelectionChangeEventDetail,
  type TableSortChangeEventDetail,
} from './table-types.js'

import {
  aggregate,
  CHEVRON,
  columnKey,
  filterText,
  rowKeyListConverter,
  rowKeysConverter,
  SELECTION_FIELD,
  toNumber,
  type PinPlacement,
  type TableRowLevel,
} from './table-shared.js'
import '@c2n/checkbox'
import '@c2n/spinner'
import type { Checkbox } from '@c2n/checkbox'
import type { EditTrigger, TableEditing } from './table-editing.js'
import type { RowsAnimation } from './table-animation.js'
import type { TableFilter } from './table-filter.js'

// Framework-free: `useRenderedRows` in `@c2n/components/react` and `@c2n/components/vue` is built on it, and any other framework
// (Svelte, Solid, Angular, plain DOM) subscribes with it directly. It imports nothing at runtime.
export { subscribeRenderedRows, type RenderedRowsListener } from './rendered-rows.js'

export type TableSelectionMode = 'none' | 'single' | 'multiple'
export type TableVirtualMode = 'auto' | 'always' | 'never'

/** Floor of a flexible track and of a column being resized, unless the column sets `minWidth`. */
const DEFAULT_MIN_WIDTH = 64
/** A plain flexible track such as `1fr` or `2.5fr`. */
const FLEX_TRACK = /^\s*\d*\.?\d+fr\s*$/

const HEADER_ROW = -1
/** Row index of the summary row in `focusedCell`; body rows are numbered from 0 and the header is `HEADER_ROW`. */
const SUMMARY_ROW = -2
/** No detail panel is open: the one value `#detailLines` returns for it, so the windowing takes its short path. */
const NO_LINES: number[] = []
/** No rows: one array, so a cache keyed on the rows keeps hitting while there are none. */
const NO_ROWS: TableRow[] = []
/** Whether the browser can keep a closed panel findable (`hidden="until-found"`), which it tells by firing `beforematch`. */
const FINDABLE = typeof HTMLElement !== 'undefined' && 'onbeforematch' in HTMLElement.prototype

export type TableSummaryScope = 'all' | 'page'

const FUNNEL = html`<svg
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  <path d="M3 5h18l-7 8.5V19l-4 2v-7.5z" />
</svg>`

/**
 * The attributes of the variants, with the property that marks an element owning them and the variant that does. An
 * element given one it does not own (`children-field` on `c2-group-table`) says where it went, once per attribute.
 */
const VARIANT_ATTRIBUTES: [attribute: string, property: string, variant: string][] = [
  ['group-by', 'groupBy', 'group-table'],
  ['expanded-groups', 'expandedGroups', 'group-table'],
  ['children-field', 'childrenField', 'tree-table'],
  ['expanded-rows', 'expandedRows', 'tree-table'],
  ['tree-expanded', 'treeExpanded', 'tree-table'],
]
const warnedVariants = new Set<string>()

interface SummaryCell {
  column: TableColumnConfig
  index: number
  span: number
}

/**
 * The legend entry of `value` in a column's `options`. Compared as text, as `count-value` does: JSON in an attribute
 * makes `"4"` and `4` easy to mix between the rows and the legend.
 */
function optionOf(column: TableColumnConfig, value: unknown): TableCellOption | undefined {
  const text = String(value)
  return column.options?.find((entry) => String(typeof entry === 'object' ? entry.value : entry) === text)
}

export interface TablePageChangeEventDetail {
  /** The page now shown, 1-based. */
  page: number
  /** The page shown before. */
  previousPage: number
  /** Rows per page. */
  pageSize: number
  /** Total number of pages. */
  pageCount: number
  /** Index of the first row of the page, and how many were asked for — the `getRows` request that follows. */
  start: number
  count: number
  /** Total rows the data source reports. */
  totalRows: number
}

function numberFormatOptions(base: Intl.NumberFormatOptions, extra: Record<string, unknown> | undefined): Intl.NumberFormatOptions {
  return Object.assign({}, base, extra ?? {})
}

/**
 * The column's default style for `format`, and the same written as parts. `Intl` refuses `dateStyle` or `timeStyle`
 * next to any part, so `format-options` naming one get the parts instead: a date part (`year`, `month`, `day`)
 * replaces the date's, a time part the time's, and `weekday`, `era` or `timeZoneName` add to them.
 */
const DATE_PARTS = { year: 'numeric', month: 'short', day: 'numeric' } as const
const TIME_PARTS = { hour: 'numeric', minute: '2-digit' } as const

function dateFormatOptions(base: Intl.DateTimeFormatOptions, extra: Record<string, unknown> | undefined): Intl.DateTimeFormatOptions {
  const keys = Object.keys(extra ?? {})
  const has = (parts: string[]) => keys.some((key) => parts.includes(key))
  if (!has(['weekday', 'era', 'year', 'month', 'day', 'dayPeriod', 'hour', 'minute', 'second', 'fractionalSecondDigits', 'timeZoneName']))
    return Object.assign({}, base, extra ?? {})
  return Object.assign(
    {},
    base.dateStyle && !has(['year', 'month', 'day']) ? DATE_PARTS : {},
    base.timeStyle && !has(['hour', 'minute', 'second', 'dayPeriod', 'fractionalSecondDigits']) ? TIME_PARTS : {},
    extra,
  )
}

function humanize(field: string): string {
  const last = field.split('.').pop() ?? field
  const spaced = last.replace(/[_-]+/g, ' ').replace(/([a-z\d])([A-Z])/g, '$1 $2')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

/** Events fired by {@link Table}, keyed for `addEventListener`. */
export interface TableEventMap {
  'selection-change': CustomEvent<TableSelectionChangeEventDetail>
  'sort-change': CustomEvent<TableSortChangeEventDetail>
  'row-click': CustomEvent<TableRowEventDetail>
  'row-activate': CustomEvent<TableRowEventDetail>
  'cell-click': CustomEvent<TableCellEventDetail>
  'column-resize': CustomEvent<TableColumnResizeEventDetail>
  'page-change': CustomEvent<TablePageChangeEventDetail>
  'range-change': CustomEvent<TableRangeChangeEventDetail>
  'detail-toggle': CustomEvent<TableDetailToggleEventDetail>
  'cell-change': CustomEvent<TableCellChangeEventDetail>
  'filter-change': CustomEvent<TableFilterChangeEventDetail>
  'rows-change': CustomEvent<TableRowsChangeEventDetail>
}

export interface Table {
  addEventListener: TypedAddEventListener<Table, TableEventMap>
  removeEventListener: TypedRemoveEventListener<Table, TableEventMap>
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
 * **Styling one column.** Every cell carries two parts named after its column — `cell-<field>` on the cell box and
 * `cell-content-<field>` on the text inside it — so a single column can be given its own colour, alignment or pill
 * shape from outside: `::part(cell-content-status) { border-radius: 999px; background: #f4f4f5 }`. Rows are
 * `::part(row)` and `::part(row-selected)`.
 *
 * **Styling renderer output.** What `renderCell` returns is placed in the table's own shadow root,
 * so a page stylesheet cannot select it — but a `part` it carries is exposed as-is: return
 * `` html`<span part="badge badge-${row.status}">…</span>` `` (or a node with that attribute) and style it with
 * `c2-table::part(badge)`. A part cannot be combined with an attribute or class selector, so encode the variant in the
 * part name itself. Content slotted through a `cell-slot` column stays in the light DOM and takes page styles directly.
 *
 * **Styling one row.** `::part(row)` cannot be conditioned on row data (`::part()` takes no attribute selector), so
 * `rowPart` adds part names of your own to a row from its data: `` table.rowPart = ({ row }) => row.failed ?
 * 'row-failed' : undefined `` makes `c2-table::part(row-failed) { background: #fef2f2 }` work. `rowStyle` sets inline
 * styles from the same context instead.
 *
 * **Virtualization** windows the rows to the visible range plus an overscan margin. It needs a uniform row height, which
 * it measures from the first rendered row, so theme the height with `--c2-table__row--height` (`row-height` is only the
 * estimate used for the first paint). It turns on automatically past `virtual-threshold` rows; `virtual="always"` and
 * `virtual="never"` force it. `range-change` reports the rows in the window and `renderedRange` holds the last one.
 *
 * **Wrapping cells.** Cells clip their text to one line by default, which is what a windowed grid of uniform rows needs.
 * `wrap` lets body cells grow instead: text wraps, rows take the height of their tallest cell (at least
 * `--c2-table__row--height`), cell content is top-aligned with `--c2-table__cell__wrap--padding` and no longer
 * clipped. Variable row heights cannot be windowed, so **`wrap` turns virtualization off** whatever `virtual` says and
 * every row is rendered — keep it for tables of a few hundred rows, or page them with `page-size`.
 *
 * **Realtime updates.** Add `animate-updates` when replacing `rows` with successive snapshots. Matching rows are found
 * by `row-key` (or index), and their finite numeric fields are interpolated over `update-duration`. With a stable key,
 * added rows expand in and deleted rows collapse out. Nested numbers in arrays and objects animate too, so a custom
 * `renderCell` such as a sparkline receives the same transient row as the formatted cells around it. Add
 * `highlight-updates` to pulse row backgrounds, and optionally choose its numeric direction with
 * `update-highlight-field`. Only rendered rows are interpolated, and reduced-motion preferences are respected. The
 * code loads once `animate-updates` is set; a snapshot assigned before it arrives waits for it, so it animates too.
 *
 * **Row keys.** Selection, `value` and events name a row by its key: the `row-key` field of the row (or
 * `getRowKey(row)`) as a string, so `{ id: 7 }` is `"7"`. Without a `row-key` the key is the row's position, which
 * points at another row after a sort, so set one on any selectable table. `keyOf(row)`, `isSelected(row)`,
 * `selectRows(rows)` and `deselectRows(rows)` work from the rows themselves when the key rule is beside the point.
 *
 * **Summary row.** Give a column `summary="sum"` (or `avg`, `min`, `max`, `count`, or a function of the rows) and the
 * table adds a totals row below the body. It is a row of the same grid, so every value sits under its own column
 * whatever the order, width or pinning, is formatted with the column's `format`, and stays in view while the body
 * scrolls. Values are keyed by the column's `id`, which defaults to its `field`; `summary-label` puts text such as
 * `Total` in a column with no value and `summary-span` stretches it across the columns after it. Aggregates cover
 * every row (`summary-scope="page"` limits them to the page on show). A `dataSource` only holds the rows it has
 * fetched, so give it the server's totals through `summaryValues` instead, which also overrides any computed value:
 *
 * ```html
 * <c2-table summary-values='{"amount": 128450.5}'>
 *   <c2-table-column field="name" summary-label="Total"></c2-table-column>
 *   <c2-table-column field="amount" format="currency" align="end"></c2-table-column>
 *   <c2-table-column field="qty" align="end" summary="sum"></c2-table-column>
 * </c2-table>
 * ```
 *
 * **Row detail.** `detail-height="240"` gives every row a chevron in the first column that opens a panel of that
 * height under the row (master/detail). The panel is filled by `renderDetail` (`{ row, rowIndex, key }`), which runs
 * when the row opens, or, without it, from a child in the row's slot (`slot="detail:{key}"`), which find-in-page
 * reaches while the row is closed and opens. Keys pressed inside a panel belong to its content. Rows open with a click on the chevron,
 * Alt+↓ and Alt+↑ on the row, `expandDetail()` or `expanded-details` (the keys of the open rows), and `detail-toggle`
 * reports a click or a key. The height is declared so the table keeps windowing its rows: an open panel adds a known
 * offset. Give the rows a `row-key`. `c2-group-table` ignores it while its rows are grouped, `c2-tree-table` while they are a tree.
 *
 * **Editing.** `editable` lets the user change the cells of every column with an `editor` (`text`, `number`, `date`,
 * `url`, `select` with its `options`, or `checkbox`), or a `renderEditor` of its own. Enter, F2, a double click or
 * typing opens one editor over the cell (never one input per cell, so a long table scrolls as fast as before); Enter
 * commits and moves down, Tab across, Escape cancels, Delete clears. A block copied from a spreadsheet pastes from the
 * focused cell, adding rows past the last. Each change fires the cancelable `cell-change`, goes through `rowRule`, and
 * replaces the row with a copy and `rows` with a new array (`rows-change`): the application's objects are never
 * mutated. Changed cells are marked (`cell-dirty`), invalid ones too (`required`, the editor's type, the column's
 * `validate`; `cell-invalid`), and `getChanges()`, `acceptChanges()`, `revertChanges()`, `validate()`, `addRow()`,
 * `duplicateRow()` and `deleteRows()` are what a toolbar's buttons call. `isCellEditable` locks cells by row. The
 * editing code loads on the first edit. Not applied to a `dataSource`.
 *
 * ```html
 * <c2-table row-key="id" editable>
 *   <c2-table-column field="item" editor="text" required></c2-table-column>
 *   <c2-table-column field="qty" editor="number" align="end" summary="sum"></c2-table-column>
 *   <c2-table-column field="status" editor="select" options='["Open","Done"]'></c2-table-column>
 * </c2-table>
 * ```
 *
 * **Filters and comparisons.** `filterable` (on the table or a column) puts a filter in a column's header: a click,
 * or Alt+↓ on the header, opens the column's values with their counts, a search, the sort buttons and Clear, loaded
 * on first use. The choice lands in `filters` (`{ "status": { "include": ["Paid"] } }`, settable from markup too) and
 * `filter-change`; a `dataSource` receives it in `getRows`. `baseline` takes the rows to compare with, such as the last
 * payroll run: a column with `compare="delta"` (or `percent`) shows each cell's change, the previous value as its
 * tooltip, and `variance-threshold="0.1"` marks a cell that moved by more than 10% (`cell-variance`).
 *
 * **Range flags.** `reference-range="low,high"` on a column flags a value outside its row's normal range with `L` or
 * `H`, and `critical-range` with `LL` or `HH`, as a lab report does: each limit is a number or the row field holding
 * it. `c2-flowsheet` (`@c2n/table/flowsheet.js`) builds on them: a measure per row and a column per reading time.
 *
 * **Statuses and ledgers.** `format="status"` draws each value as a mark and a label from the column's `options`
 * (`{ "value": "fail", "label": "Failed", "color": "#dc2626", "glyph": "✕" }`), so a grid of controls or skills
 * reads as a status matrix; `summary="tally"` counts each status under its column, and a column with `count-value`
 * counts the statuses of a row that hold that value. `running="credit,-debit"` makes a running total, such as an
 * account balance, from `opening` and the fields named, over the rows in their sorted order, and `summary="last"`
 * puts the closing balance in the summary row. Both are computed once when the rows change, not while scrolling.
 *
 * Wrapped in a `c2-context-menu`, a right-clicked or long-pressed body cell answers the menu's request with the same
 * detail as `cell-click` (`row`, `rowIndex`, `key`, `column`, `value`), which the menu passes on as `context.data`
 * with this table as `context.source`, so `renderContextMenu` can build the rows for that cell. The cell also takes
 * the keyboard focus.
 *
 * @tag c2-table
 *
 * @slot default - The column definitions: `c2-table-column` elements. They render nothing themselves.
 * @slot toolbar - Bar above the header, for a title, filters or a column menu. Hidden when empty.
 * @slot footer - Bar below the rows, for a row count or a `c2-pagination`. Hidden when empty.
 * @slot empty - Replaces the built-in "no rows" message.
 * @slot loading - Replaces the built-in spinner shown while the first rows load.
 * @slot error - Replaces the built-in message shown when `error` is set.
 * @slot fallback - Meaningful server-rendered table content. It remains visible before custom-element upgrade and is
 * retained in the light DOM but hidden after the interactive grid mounts, avoiding duplicate client content.
 * @slot detail:{key} - Detail panel of one row (`detail-height`), e.g. `slot="detail:ORD-7"`, shown while that row is open and `renderDetail` is unset.
 * @slot cell:{line}:{field} - Body of one cell of a column marked `cell-slot`, e.g. `slot="cell:0:change"` for the first displayed row. `line` is the cell's display line, counted across the whole dataset after sort, filter and grouping with the page offset included — the numbering of `range-change`. Lets a framework render a cell with its own template language instead of a `renderCell` function; the column's `renderCell` or formatted value stays as the fallback. Children are needed only for the lines `range-change` reports (map `detail.rows`, or `renderedRange.rows`, each `{ line, key, row }`); a child whose line is outside the rendered window is left unassigned. After a sort, filter or page change the same line holds a different row, so re-render the children from the next `range-change`.
 *
 * @slotcomponent c2-table-column
 * @slotcomponent c2-pagination
 *
 * @event {CustomEvent<TableSelectionChangeEventDetail>} selection-change - Fired after the user changes the selection. `detail.value` is the array of selected row keys, `detail.rows` the matching rows. Does not bubble: several components fire `selection-change`, so a listener belongs on the element itself rather than on an ancestor.
 * @event {CustomEvent<TableSortChangeEventDetail>} sort-change - Fired after the user clicks a sortable header. `detail.sort` is the new sort model, in priority order.
 * @event {CustomEvent<TableRowEventDetail>} row-click - Fired when a row is clicked, before the selection is applied.
 * @event {CustomEvent<TableRowEventDetail>} row-activate - Fired when the user opens a row: a pointer click on it, or Enter on one of its focused cells — so one listener serves a table used for navigation from the mouse and the keyboard alike. Not fired by a click or Enter that belongs to a control inside a cell (a button, link or input), and fired before the selection is applied. Does not bubble: a table nested in another table's cell would otherwise open the outer row too, so the listener belongs on the element itself.
 * @event {CustomEvent<TableCellEventDetail>} cell-click - Fired when a cell is clicked; adds `detail.column` and `detail.value`.
 * @event {CustomEvent<TableColumnResizeEventDetail>} column-resize - Fired when the user releases a column's resize handle.
 * @event {CustomEvent<TableRangeChangeEventDetail>} range-change - Fired after the rendered body rows change — the window scrolled, or the rows, sort, page or grouping changed. `detail.start`/`detail.end` are the display lines rendered (end exclusive), `detail.rows` one `{ line, key, row }` entry per rendered data row in display order (group rows and rows a `dataSource` has not delivered are left out) and `detail.keys` their keys. Those lines are the only ones whose `cell:{line}:{field}` slots exist. Fires again when the same keys move to other lines. Does not bubble.
 * @event {CustomEvent<TableDetailToggleEventDetail>} detail-toggle - Fired after the user opens or closes a row's detail panel (`detail-height`), with its `key`, the `row` and whether it is now open. Does not bubble.
 * @event {CustomEvent<TableCellChangeEventDetail>} cell-change - Fired when the user commits a new value to a cell of an `editable` table (typed, toggled, cleared or pasted), before the table stores it: `detail.row` is the row as it was, with `key`, `column`, `field`, `value` and `previousValue`. Cancelable: `preventDefault()` keeps the old value. Does not bubble.
 * @event {CustomEvent<TableFilterChangeEventDetail>} filter-change - Fired after the user changes a column's filter. `detail.filters` is every column's filter, as `filters` now holds them, and `detail.column` the id of the column that changed.
 * @event {CustomEvent<TableRowsChangeEventDetail>} rows-change - Fired after the table replaced `rows` itself: a cell edited or pasted, a row added, duplicated or deleted, changes reverted. `detail.rows` is the new array and `detail.reason` says why. Does not bubble.
 * @event {CustomEvent<TablePageChangeEventDetail>} page-change - Fired after the shown page changes, while `paginated`. `detail.start` and `detail.count` are the slice of the whole dataset now shown — with a `dataSource`, the `getRows` request that follows. A pager slotted in the footer does not fire its own: the table speaks for it.
 *
 * @csspart toolbar - Row above the grid containing the `toolbar` slot.
 * @csspart viewport - Scrollable container around the grid.
 * @csspart grid - The ARIA grid containing the header and body rows.
 * @csspart footer - Row below the grid containing the `footer` slot.
 * @csspart state - Shared cell containing the `empty`, `loading`, or `error` slot and its fallback state.
 * @csspart header-row - The grid header row.
 * @csspart header-cell - Every column header cell.
 * @csspart selection-header-cell - The header cell containing the select-all checkbox.
 * @csspart resizer - The pointer target used to resize a column.
 * @csspart sort-icon - The sort-direction indicator in a sortable header.
 * @csspart cell - Every body grid cell.
 * @csspart selection-cell - A body cell containing a row-selection checkbox.
 * @csspart skeleton - Placeholder displayed while a remote row is loading.
 * @csspart cell-content - The content wrapper inside a body cell.
 * @csspart row - Every rendered body row. Also carries the names `rowPart` returns for it, such as `row-failed`.
 * @csspart row-selected - A body row while it is selected; exposed in addition to `row`.
 * @csspart summary-row - The totals row kept at the bottom of the grid.
 * @csspart summary-cell - Every cell of the summary row. Each also carries `summary-cell-<id>`, named after its column.
 * @csspart summary-cell-off-target - A summary cell whose value misses its column's `summary-target`; exposed in addition to `summary-cell`.
 * @csspart summary-content - The content wrapper inside a summary cell; also `summary-content-<id>`.
 * @csspart detail-toggle - The chevron button that opens a row's detail panel (`detail-height`).
 * @csspart detail - The detail panel under an open row. It wraps the row's `detail:{key}` slot: assigned content fills the panel, and a `renderDetail` function draws it in place of the slot.
 * @csspart filter-button - The filter button of a `filterable` column's header. Also `filter-button-active` while the column is filtered.
 * @csspart filter - The popover of a column's filter: its values with their counts, the sort buttons and Clear.
 * @csspart delta - A cell's change from the `baseline` (`compare`). Also `delta-up`, `delta-down` or `delta-flat`.
 * @csspart flag - The mark of a value outside its row's range. Also `flag-low`, `flag-high`, `flag-critical-low` or `flag-critical-high`.
 * @csspart cell-flag - A body cell with a flag; exposed in addition to `cell`, with `cell-flag-low`, `cell-flag-high`, `cell-flag-critical-low` or `cell-flag-critical-high`.
 * @csspart cell-variance - A body cell whose change from the `baseline` passes its column's `variance-threshold`; exposed in addition to `cell`.
 * @csspart status - A value of a `status` column: its mark and label. Also `status-<value>`, so one value can be styled.
 * @csspart status-mark - The dot, or the square holding the `glyph`, of a status.
 * @csspart status-label - The label of a status.
 * @csspart cell-dirty - A body cell whose value was edited since the rows were given or `acceptChanges()` ran; exposed in addition to `cell`.
 * @csspart cell-invalid - A body cell whose value failed its check (`required`, the editor's type, `validate`); exposed in addition to `cell`.
 * @csspart row-new - A body row added by `addRow`, `duplicateRow` or a paste, until `acceptChanges()`; exposed in addition to `row`.
 * @csspart editor - The box holding the editor of the cell being edited.
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
 * @cssproperty {pixel} [--c2-table__resizer--width=9px] - Width of the grab area, not of the visible line.
 * @cssproperty {pixel} [--c2-table__resizer--height=56%] - Height of the resting divider, as a share of the header.
 * @cssproperty {pixel} [--c2-table__resizer--line-width=1px]
 * @cssproperty {color} [--c2-table__resizer--color=#e4e4e7] - The divider drawn at a resizable column's edge.
 * @cssproperty {pixel} [--c2-table__resizer__hover--height=100%]
 * @cssproperty {pixel} [--c2-table__resizer__hover--line-width=2px]
 * @cssproperty {color} [--c2-table__resizer__hover--color=rgb(2, 101, 220)]
 *
 * @cssproperty {pixel} [--c2-table__row--height=36px] - Row height; virtualization measures it, so keep it uniform.
 * @cssproperty {border} [--c2-table__row--border-bottom=1px solid #e4e4e7]
 * @cssproperty {color} [--c2-table__row__hover--background=#f4f4f5]
 * @cssproperty {color} [--c2-table__row__odd--background=#fafafa] - Applies with the `stripe` attribute.
 * @cssproperty {color} [--c2-table__row__selected--background=#edf1fe]
 * @cssproperty {color} [--c2-table__row__selected--color=#18181b]
 * @cssproperty {color} [--c2-table__row__selected__hover--background=#e2e9fd] - A selected row under the pointer.
 * @cssproperty {color} [--c2-table__row__added--background=rgba(22,163,74,0.16)] - Highlight used while a realtime row expands into the table.
 * @cssproperty {color} [--c2-table__row__removed--background=rgba(220,38,38,0.14)] - Highlight used while a realtime row collapses out of the table.
 * @cssproperty {color} [--c2-table__row__increased--background=rgba(22,163,74,0.14)] - Pulse used when the watched numeric value increases.
 * @cssproperty {color} [--c2-table__row__decreased--background=rgba(220,38,38,0.12)] - Pulse used when the watched numeric value decreases.
 * @cssproperty {color} [--c2-table__row__modified--background=rgba(2,101,220,0.1)] - Pulse used when a change has no numeric direction.
 *
 * @cssproperty {padding} [--c2-table__cell--padding=0 12px]
 * @cssproperty {pixel} [--c2-table__cell--gap=8px]
 * @cssproperty {font-size} [--c2-table__cell--font-size=14px]
 * @cssproperty {color} [--c2-table__cell--color=#18181b]
 * @cssproperty {border} [--c2-table__cell--border-right=none] - Vertical grid lines; applies to header cells too.
 * @cssproperty {padding} [--c2-table__cell__wrap--padding=8px 12px] - Body cell padding with `wrap`, where content is top-aligned.
 * @cssproperty {outline} [--c2-table__cell__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {pixel} [--c2-table__cell__focus--outline-offset=-2px]
 *
 * @cssproperty {color} [--c2-table__cell__dirty--color=rgb(2, 101, 220)] - The corner mark of an edited cell.
 * @cssproperty {pixel} [--c2-table__cell__dirty--size=6px]
 * @cssproperty {color} [--c2-table__cell__invalid--background=rgba(220, 38, 38, 0.06)]
 * @cssproperty {box-shadow} [--c2-table__cell__invalid--box-shadow=inset 0 0 0 1px rgb(211, 21, 16)]
 * @cssproperty {color} [--c2-table__editor--background=#ffffff]
 * @cssproperty {color} [--c2-table__editor--color=#18181b]
 * @cssproperty {font-size} [--c2-table__editor--font-size=14px]
 * @cssproperty {padding} [--c2-table__editor--padding=0 11px]
 * @cssproperty {box-shadow} [--c2-table__editor--box-shadow=inset 0 0 0 2px rgb(2, 101, 220)] - The ring of the cell being edited.
 *
 * @cssproperty {pixel} [--c2-table__filter-button--size=22px] - The filter button of a `filterable` column's header.
 * @cssproperty {color} [--c2-table__filter-button--color=#a1a1aa]
 * @cssproperty {border-radius} [--c2-table__filter-button--border-radius=4px]
 * @cssproperty {color} [--c2-table__filter-button__hover--background=#e4e4e7]
 * @cssproperty {color} [--c2-table__filter-button__active--color=rgb(2, 101, 220)] - The button of a column that is filtered.
 * @cssproperty {color} [--c2-table__filter-panel--background=#ffffff] - The popover a filter button opens.
 * @cssproperty {color} [--c2-table__filter-panel--color=#18181b]
 * @cssproperty {border} [--c2-table__filter-panel--border=1px solid #e4e4e7]
 * @cssproperty {border-radius} [--c2-table__filter-panel--border-radius=8px]
 * @cssproperty {box-shadow} [--c2-table__filter-panel--box-shadow=0 8px 24px rgba(24, 24, 27, 0.08)]
 * @cssproperty {padding} [--c2-table__filter-panel--padding=8px]
 * @cssproperty {font-size} [--c2-table__delta--font-size=12px] - A cell's change from the `baseline` (`compare`).
 * @cssproperty {color} [--c2-table__delta--color=#71717a] - A change of 0.
 * @cssproperty {color} [--c2-table__delta__up--color=#166534]
 * @cssproperty {color} [--c2-table__delta__down--color=#b91c1c]
 * @cssproperty {color} [--c2-table__cell__variance--background=rgba(217, 119, 6, 0.16)] - A cell past its column's `variance-threshold`.
 * @cssproperty {box-shadow} [--c2-table__cell__variance--box-shadow=inset 3px 0 0 0 #d97706]
 * @cssproperty {font-size} [--c2-table__flag--font-size=11px] - The `L`/`H` mark of a value outside its row's `reference-range`.
 * @cssproperty {font-weight} [--c2-table__flag--font-weight=600]
 * @cssproperty {color} [--c2-table__flag__low--color=rgb(2, 101, 220)]
 * @cssproperty {color} [--c2-table__flag__high--color=#b91c1c]
 * @cssproperty {color} [--c2-table__flag__critical--color=#ffffff] - The `LL`/`HH` mark of a value past the `critical-range`.
 * @cssproperty {color} [--c2-table__flag__critical--background=#b91c1c]
 * @cssproperty {color} [--c2-table__cell__flag--background=rgba(185, 28, 28, 0.08)] - A cell flagged low or high.
 * @cssproperty {color} [--c2-table__cell__critical--background=rgba(185, 28, 28, 0.16)] - A cell flagged critical.
 * @cssproperty {pixel} [--c2-table__status--gap=6px] - Space between a status's mark and its label (`format="status"`).
 * @cssproperty {color} [--c2-table__status-mark--background=#a1a1aa] - Mark of a status whose legend entry has no `color`.
 * @cssproperty {pixel} [--c2-table__status-mark--size=8px] - The dot of a status without a `glyph`.
 * @cssproperty {border-radius} [--c2-table__status-mark--border-radius=999px]
 * @cssproperty {pixel} [--c2-table__status-mark__glyph--size=18px] - The square of a status with a `glyph`.
 * @cssproperty {border-radius} [--c2-table__status-mark__glyph--border-radius=4px]
 * @cssproperty {color} [--c2-table__status-mark__glyph--color=#ffffff]
 * @cssproperty {font-size} [--c2-table__status-mark__glyph--font-size=11px]
 * @cssproperty {font-weight} [--c2-table__status-mark__glyph--font-weight=700]
 * @cssproperty {pixel} [--c2-table__status-label--max-width=none] - `0` leaves only the mark, as in a matrix; the label stays readable by assistive technology.
 * @cssproperty {pixel} [--c2-table__tally--gap=12px] - Space between the values of a `tally` summary.
 * @cssproperty {pixel} [--c2-table__tally-entry--gap=4px] - Space between a status's mark and its count in a `tally` summary.
 * @cssproperty {color} [--c2-table__tally-count--color=#71717a]
 * @cssproperty {pixel} [--c2-table__tally-label--max-width=0] - Width of each status's label in a `tally` summary: `0` shows the mark and the count only, `none` the whole label.
 *
 * @cssproperty {box-shadow} [--c2-table__pinned-start--box-shadow=1px 0 0 0 #e4e4e7] - Separator on the last column pinned to the start.
 * @cssproperty {box-shadow} [--c2-table__pinned-end--box-shadow=-1px 0 0 0 #e4e4e7] - Separator on the first column pinned to the end.
 *
 * @cssproperty {pixel} [--c2-table__summary--height=36px]
 * @cssproperty {color} [--c2-table__summary--background=#fafafa]
 * @cssproperty {color} [--c2-table__summary--color=#18181b]
 * @cssproperty {font-size} [--c2-table__summary--font-size=14px]
 * @cssproperty {font-weight} [--c2-table__summary--font-weight=600]
 * @cssproperty {color} [--c2-table__summary__off-target--color=rgb(211, 21, 16)] - Text of a summary that misses its `summary-target`.
 * @cssproperty {box-shadow} [--c2-table__summary--box-shadow=0 -1px 0 0 #e4e4e7] - Separator above the summary row; a shadow rather than a border so it lands on the last row's own border instead of doubling it.
 *
 * @cssproperty {pixel} [--c2-table__group-toggle--size=16px]
 * @cssproperty {color} [--c2-table__group-toggle--color=#71717a]
 * @cssproperty {time} [--c2-table__group-toggle--transition-duration=150ms] - Chevron turn when a group opens or closes; respects reduced motion.
 *
 * @cssproperty {pixel} [--c2-table__selection-cell--width=44px] - Width of the `checkbox-selection` column.
 *
 * @cssproperty {color} [--c2-table__skeleton--background=#f4f4f5] - Placeholder shown in cells whose `dataSource` block is still loading.
 * @cssproperty {border-radius} [--c2-table__skeleton--border-radius=4px]
 *
 * @cssproperty {color} [--c2-table__detail--background=#fafafa] - Background of a row's detail panel.
 * @cssproperty {padding} [--c2-table__detail--padding=12px] - Padding of a row's detail panel.
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
  static override styles: CSSResultGroup = unsafeCSS(styles)

  @query('.viewport') protected viewport!: HTMLElement | null

  /**
   * The host's `aria-label`, observed so the grid inside the shadow root is named after it: the host is not the
   * grid, so a name set on it would otherwise name nothing.
   */
  @property({ attribute: 'aria-label' }) private hostAriaLabel: string | null = null

  /**
   * The host's `aria-labelledby`. ARIA cannot resolve a light-DOM id from inside the shadow root, so the referenced
   * elements' text is copied onto the grid instead, and `aria-labelledby` wins over `aria-label` as ARIA ranks them.
   */
  @property({ attribute: 'aria-labelledby' }) private hostAriaLabelledBy: string | null = null

  /** The rows to display. An array in the property, JSON in the attribute. */
  @property({ converter: jsonPropertyConverter }) rows: TableRow[] = []

  /** Column definitions, as an alternative to `c2-table-column` children. Children win when both are present. */
  @property({ converter: jsonPropertyConverter }) columns?: TableColumnConfig[]

  /**
   * Field holding the identity of a row — its key — used for selection, DOM reuse, animated updates and cell slots;
   * may be a dotted path. A key is always a string: `{ id: 7 }` has the key `"7"`. Without one (or where the field is
   * empty) a row's key is its position in the sorted dataset, which moves when the rows are sorted or replaced — so
   * a selection would move with it. Set it whenever rows can be selected.
   */
  @property({ type: String, attribute: 'row-key' }) rowKey = ''

  /**
   * Computes a row's key when no single field holds it, such as a composite `` row => `${row.region}:${row.sku}` ``.
   * Wins over `row-key`; the result is turned into a string. Property only.
   */
  @property({ attribute: false }) getRowKey?: (row: TableRow) => unknown

  /**
   * `single` selects one row at a time, `multiple` supports ⌘/ctrl-click and shift-click ranges. A click selects the
   * row alone; clicking the row that is already the whole selection clears it, and ⌘/ctrl-click or Space toggles one row.
   */
  @property({ type: String }) selection: TableSelectionMode = 'none'

  /** Adds a leading checkbox column, pinned to the start. */
  @property({ type: Boolean, attribute: 'checkbox-selection' }) checkboxSelection = false

  /**
   * Keys of the selected rows (see `row-key`): an array in the property, `;`-separated in the attribute. Entries are
   * stored as strings, so `[1, 2]` selects the rows whose key field holds `1` and `2`. To select by row rather than
   * by key, use `selectRows()`.
   */
  @property({ converter: rowKeysConverter, reflect: true }) value: string[] = []

  /** The sort, in priority order: `SortModel[]` in the property, `field:asc;other:desc` in the `sort` attribute. */
  @property({ converter: sortModelConverter, attribute: 'sort', reflect: true }) sortModel: SortModel[] = []

  /** Lets shift-click add a column to the sort instead of replacing it. */
  @property({ type: Boolean, attribute: 'multi-sort' }) multiSort = false

  /** Makes every column sortable; a column's own `sortable` still wins. */
  @property({ type: Boolean }) sortable = false

  /** Columns are resizable by default; `resizable="false"` turns it off. A column's own `resizable` still wins. */
  @property({ type: Boolean }) resizable = true

  /** Tints odd rows with `--c2-table__row__odd--background`. */
  @property({ type: Boolean, reflect: true }) stripe = false

  /** Smoothly interpolates changed finite numbers when `rows` is replaced. Rows are matched by `row-key`, or by index. */
  @property({ type: Boolean, attribute: 'animate-updates', reflect: true }) animateUpdates = false

  /** Duration of an animated rows update in milliseconds. */
  @property({ type: Number, attribute: 'update-duration' }) updateDuration = 400

  /** Returns inline styles for a row from its current data. Property only; animated updates pass the intermediate row. */
  @property({ attribute: false }) rowStyle?: TableRowStyler

  /**
   * Returns extra part names for a row from its current data, added beside `row` so a stylesheet can reach rows by
   * state: `({ row }) => row.status === 'failed' ? 'row-failed' : undefined` and `c2-table::part(row-failed)`. A string
   * (whitespace-separated names) or an array. Property only; animated updates pass the intermediate row.
   */
  @property({ attribute: false }) rowPart?: TableRowPartResolver

  /** Pulses changed row backgrounds: green for additions/increases, red for removals/decreases, blue otherwise. */
  @property({ type: Boolean, attribute: 'highlight-updates', reflect: true }) highlightUpdates = false

  /** Numeric field that determines whether a modified row highlights as increased or decreased. Defaults to its first changed number. */
  @property({ type: String, attribute: 'update-highlight-field' }) updateHighlightField = ''

  /** `auto` virtualizes past `virtual-threshold` rows; `always` and `never` force it. `wrap` overrides it with `never`. */
  @property({ type: String }) virtual: TableVirtualMode = 'auto'

  /**
   * Wraps body cell text onto several lines: rows grow to their content (at least `--c2-table__row--height`) and cells
   * are top-aligned and no longer clipped. Rows of different heights cannot be windowed, so this turns virtualization
   * off — every row is rendered, whatever `virtual` says.
   */
  @property({ type: Boolean }) wrap = false

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

  /** The page on show, 1-based. Only meaningful while the table is `paginated`; clamped to `pageCount`. */
  @property({ type: Number, reflect: true }) page = 1

  /**
   * Rows per page. `0` leaves paging off; a `c2-pagination` slotted into the `footer` sets it from its own
   * `page-size` when the table has none, which is what makes the nested form work with no configuration.
   * With `rows` the page is sliced in place; with a `dataSource` each page is one request.
   */
  @property({ type: Number, attribute: 'page-size' }) pageSize = 0

  /**
   * Values of the summary row keyed by column `id` (its `field` unless set), such as totals computed by a server.
   * An entry wins over the column's `summary` aggregate. An object in the property, JSON in the attribute.
   */
  @property({ converter: jsonPropertyConverter, attribute: 'summary-values' }) summaryValues?: Record<string, unknown>

  /** Rows the summary aggregates cover: `all` rows, or only the `page` on show. A `dataSource` is only aggregated per page. */
  @property({ type: String, attribute: 'summary-scope' }) summaryScope: TableSummaryScope = 'all'

  /**
   * Height in pixels of a row's detail panel, and the switch of the feature: above 0, every row gets a chevron that
   * opens a panel of this height under it. Declared, like `row-height`, so the rows stay windowed. `c2-group-table`
   * ignores it while its rows are grouped (`group-by`), and `c2-tree-table` while they are a tree (`children-field`).
   */
  @property({ type: Number, attribute: 'detail-height' }) detailHeight = 0

  /** Draws the detail panel of an open row. Unset, the panel shows the child in the row's `detail:{key}` slot. */
  @property({ attribute: false }) renderDetail?: TableDetailRenderer

  /** Keys of the rows whose detail panel is open, `;`-separated in the attribute. The table writes it as rows are opened and closed. */
  @property({ converter: rowKeyListConverter, attribute: 'expanded-details' }) expandedDetails?: string[]

  /** Accessible name of the chevron that opens a row's detail panel. Unset, `Details` in the table's language. */
  @property({ type: String, attribute: 'detail-label' }) detailLabel = ''

  /**
   * Adds a filter of its values to every column's header; a column's own `filterable` still wins. With a `dataSource`
   * a column lists the values of its `options`, and one without `options` gets no filter.
   */
  @property({ type: Boolean }) filterable = false

  /**
   * The column filters, keyed by column id: `{ "status": { "include": ["Paid"] } }`. A filterable column's header
   * writes it as the user picks values, and `filter-change` reports it. Applied on the client; with a `dataSource`
   * they go to `getRows` instead. An object in the property, JSON in the attribute.
   */
  @property({ converter: jsonPropertyConverter }) filters: TableFilters = {}

  /**
   * The rows to compare with, such as the last payroll run: matched by `row-key` (or `getRowKey`, one is needed), they give each column with
   * `compare` or `variance-threshold` its previous value. An array in the property, JSON in the attribute.
   */
  @property({ converter: jsonPropertyConverter }) baseline?: TableRow[]

  /**
   * Lets the user edit the cells of the columns that have an `editor` (or a `renderEditor`): Enter, F2, a double click
   * or typing opens one editor over the cell, Enter or Tab commits it and moves on, Escape cancels, Delete clears the
   * cell, and a block copied from a spreadsheet pastes from the focused cell. Each change fires `cell-change` and
   * replaces `rows`. The editing code loads on the first edit. Not applied to a `dataSource`.
   */
  @property({ type: Boolean }) editable = false

  /** Decides per cell whether an `editable` table lets it be edited, such as `({ row }) => row.status !== 'approved'`. Property only. */
  @property({ attribute: false }) isCellEditable?: (context: TableCellContext) => boolean

  /**
   * Adjusts a row after one of its cells is edited or pasted, before the table stores it: return the row to keep, such
   * as the debit cleared when a credit is typed, or a total recomputed from a quantity. Property only.
   */
  @property({ attribute: false }) rowRule?: TableRowRule

  @state() protected columnElements: TableColumn[] = []
  @state() private widthOverrides: Record<string, number> = {}
  @state() protected focusedCell: { row: number; column: number } = { row: HEADER_ROW, column: 0 }
  private readonly slotPresence = new SlotPresenceController(this, ['toolbar', 'footer'])
  protected readonly msg = new LocalizeController(this, tableMessages)
  @state() private remoteTotal = -1

  protected sortedRows: TableRow[] = []
  #blocks = new Map<number, TableRow[]>()
  #pendingBlocks = new Set<number>()
  #measuredWidths = new Map<string, number>()
  #measuredRowHeight = 0
  #selectionAnchor = -1
  protected pendingFocus = false
  #pendingFocusOptions?: FocusOptions
  #requestToken = 0
  /** The pagers that have announced themselves, so only their events are swallowed — not a pager inside a cell. */
  #pagers = new WeakSet<EventTarget>()
  #pendingScrollTop = false
  /** The realtime update code (`animate-updates`) once loaded, and its load while it is on the way. */
  #animation?: RowsAnimation
  #animationLoad?: Promise<RowsAnimation>
  /** `rows` was replaced before that code arrived: the update waits for it rather than skip the animation. */
  #awaitAnimation = false
  #warnedPositionalKeys = false
  #summaryCache?: { inputs: unknown[]; rows: TableRow[]; values: Map<string, unknown> }
  /** The totals of each `running` column, by column key. */
  #runningCache = new WeakMap<TableColumnConfig, { inputs: unknown[]; totals: Map<TableRow, number> }>()
  #statusCache?: { source: TableColumnConfig[]; columns: TableColumnConfig[] }
  #openDetails?: { source: string[]; keys: Set<string> }
  #detailCache?: { inputs: unknown[]; lines: number[] }
  #windowCache?: { inputs: unknown[]; range: VirtualScrollRange }
  /** Counts the blocks a `dataSource` delivered, which is when a row of an open detail may appear. */
  #blocksVersion = 0
  /** The column filter popover once loaded, and its load while it is on the way. */
  #filter?: TableFilter
  #filterLoad?: Promise<TableFilter>
  #baselineCache?: { inputs: unknown[]; rows: Map<string, TableRow> }
  #baselineWarned = false
  /** The editing module once loaded (`editable`, `addRow`…), and its load while it is on the way. */
  #editing?: TableEditing
  #editingLoad?: Promise<TableEditing>
  /** The window `range-change` last reported, to fire only when it moves. */
  #renderedRange: TableRangeChangeEventDetail = { start: 0, end: 0, keys: [], rows: [] }
  /** Whether `range-change` has fired yet: the first update reports even an empty window. */
  #rangeReported = false

  /**
   * Shared with a `c2-pagination` slotted into the `footer`. Rebuilt rather than mutated whenever the paging state
   * moves: `@lit/context` consumers only re-render on a new object identity.
   */
  @provide({ context: pagerContext })
  private pager: PagerContext | undefined = undefined

  #virtualizer = new VirtualScrollController(this, {
    scrollElement: () => this.viewport,
    itemCount: () => this.rowCount,
    itemHeight: () => this.rowHeightPx,
    overscan: () => this.overscan,
    enabled: () => this.isVirtualized,
  })

  /** Total number of rows the table knows about: `rows.length`, or the `dataSource` total. */
  get totalRows(): number {
    return this.dataSource ? Math.max(0, this.remoteTotal) : this.sortedRows.length
  }

  /**
   * Number of rows on screen right now: the whole dataset, or one page of it while `paginated`. This is what the
   * virtualizer windows and what `virtual="auto"` measures, so a 25-row page is never virtualized against a
   * million-row total.
   */
  get rowCount(): number {
    const lines = this.lineCount()
    if (lines !== undefined) return this.paginated ? Math.max(0, Math.min(this.pageSize, lines - this.pageStart)) : lines
    if (!this.paginated) return this.dataSource ? this.totalRows : (this.#animation?.transitionRows?.length ?? this.totalRows)
    const onPage = Math.max(0, Math.min(this.pageSize, this.totalRows - this.pageStart))
    if (!this.dataSource) return onPage
    // Once the page is in it is the truth; before that the arithmetic gives the right number of skeleton rows.
    const loaded = this.#blocks.get(this.page - 1)?.length
    if (loaded !== undefined) return loaded
    return this.remoteTotal < 0 ? 0 : onPage
  }

  /**
   * Whether the table is paging its rows. `rows` are sliced in place; a `dataSource` is asked for one page per
   * request. Either way `page-size` is the switch, and a pager slotted into the `footer` sets it.
   */
  get paginated(): boolean {
    return this.pageSize > 0
  }

  /** Number of pages, at least 1. */
  get pageCount(): number {
    if (!this.paginated) return 1
    return Math.max(1, Math.ceil(this.#lineCount / this.pageSize))
  }

  /**
   * Lines the body is made of across every page: the rows, or while grouped the visible group and data rows. Pages
   * and `aria-rowcount` count these, so a collapsed group takes one line.
   */
  get #lineCount(): number {
    return this.lineCount() ?? this.totalRows
  }

  /** Index of the first row of the current page within the whole dataset. */
  protected get pageStart(): number {
    return this.paginated ? (this.page - 1) * this.pageSize : 0
  }

  /** A page is one block, so the existing block cache and request de-duplication carry paging unchanged. */
  get #effectiveBlockSize(): number {
    return this.paginated ? this.pageSize : this.blockSize
  }

  /** Whether the rows are currently windowed. */
  get isVirtualized(): boolean {
    if (this.wrap || this.virtual === 'never') return false
    if (this.virtual === 'always') return true
    return this.rowCount > this.virtualThreshold
  }

  protected get rowHeightPx(): number {
    return this.#measuredRowHeight || this.rowHeight
  }

  get #isBootstrapping(): boolean {
    return Boolean(this.dataSource) && this.remoteTotal < 0 && !this.error
  }

  /** The resolved, ordered, visible columns — children first, then the `columns` property, then one per key of the first row. */
  get resolvedColumns(): TableColumnConfig[] {
    const declared: TableColumnConfig[] = this.columnElements.length ? this.columnElements : (this.columns ?? this.#autoColumns())
    const visible = this.expandColumns(declared).filter((column) => columnKey(column) && !column.hidden)
    return [
      ...visible.filter((column) => column.pinned === 'start'),
      ...visible.filter((column) => !column.pinned),
      ...visible.filter((column) => column.pinned === 'end'),
    ]
  }

  /** The declared columns as the table draws them: a variant may stand several columns for one (`c2-flowsheet`). */
  protected expandColumns(declared: TableColumnConfig[]): TableColumnConfig[] {
    return declared
  }

  /**
   * A cell's value as drawn and sorted: its field. `row` may be the copy an animated update interpolates, which is why
   * this is not `cellValue`; a variant reads its derived columns here (`c2-flowsheet`).
   */
  protected readCell(row: TableRow, column: TableColumnConfig): unknown {
    return getFieldValue(row, column.field)
  }

  /** The rows the table sorts, filters and draws: `rows`, or what a variant makes of its own input (`c2-flowsheet`). */
  protected sourceRows(): TableRow[] {
    return Array.isArray(this.rows) ? this.rows : NO_ROWS
  }

  /**
   * The key of `row`: `getRowKey(row)`, else its `row-key` field, as a string. Without either it is the row's current
   * position, found by identity among the rows the table holds, and `undefined` when the row is not one of them.
   */
  keyOf(row: TableRow): string | undefined {
    const identity = this.identityOf(row)
    if (identity !== undefined) return identity
    if (this.dataSource) {
      const size = this.#effectiveBlockSize
      for (const [block, rows] of this.#blocks) {
        const index = rows.indexOf(row)
        if (index >= 0) return String(block * size + index)
      }
      return undefined
    }
    const index = this.sortedRows.indexOf(row)
    return index >= 0 ? String(index) : undefined
  }

  /** Whether `row` is selected. */
  isSelected(row: TableRow): boolean {
    const key = this.keyOf(row)
    return key !== undefined && this.value.includes(key)
  }

  /**
   * Selects `rows` by their keys, replacing the selection unless `add` is set; `selection="single"` keeps the last
   * one. Fires `selection-change`, like `selectAll()`. No-op while `selection="none"`.
   */
  selectRows(rows: TableRow[], { add = false }: { add?: boolean } = {}) {
    if (this.selection === 'none') return
    const keys = rows.map((row) => this.keyOf(row)).filter((key): key is string => key !== undefined)
    if (this.selection === 'single') {
      this.commitSelection(keys.length ? [keys[keys.length - 1]] : add ? this.value : [])
      return
    }
    this.commitSelection([...new Set([...(add ? this.value : []), ...keys])])
  }

  /** Removes `rows` from the selection. Fires `selection-change`. */
  deselectRows(rows: TableRow[]) {
    const keys = new Set(rows.map((row) => this.keyOf(row)))
    this.commitSelection(this.value.filter((key) => !keys.has(key)))
  }

  /** The rows currently selected. Only the loaded ones when a `dataSource` is used. */
  getSelectedRows(): TableRow[] {
    const keys = new Set(this.value)
    const selected: TableRow[] = []
    for (let index = 0; index < this.rowTotal; index++) {
      const row = this.#rowAt(index)
      if (row && keys.has(this.keyAt(index, row))) selected.push(row)
    }
    return selected
  }

  /** Selects every loaded row. No-op unless `selection="multiple"`. */
  selectAll() {
    if (this.selection !== 'multiple') return
    const keys: string[] = []
    for (let index = 0; index < this.rowTotal; index++) {
      const row = this.#rowAt(index)
      if (row) keys.push(this.keyAt(index, row))
    }
    this.commitSelection(keys)
  }

  /**
   * Upper bound of the row indices `getSelectedRows` and `selectAll` visit: the rows on show, or while grouped or in a
   * tree every row, including those in closed groups and under closed rows — a parent's checkbox selects them too.
   */
  protected get rowTotal(): number {
    return this.rowCount
  }

  /** Clears the selection. */
  clearSelection() {
    this.commitSelection([])
  }

  /**
   * Scrolls the row at `index` into view; while grouped or in a tree, only a row whose groups or parents are open has
   * a place to scroll to.
   */
  scrollToIndex(index: number) {
    const line = this.lineOfRow(index)
    if (line >= 0) this.scrollToLine(line)
  }

  /** Opens the detail panel of the row with `key` (`detail-height`). Does not fire `detail-toggle`. */
  expandDetail(key: string) {
    this.#setDetailExpanded(key, true)
  }

  /** Closes the detail panel of the row with `key`. */
  collapseDetail(key: string) {
    this.#setDetailExpanded(key, false)
  }

  /**
   * Adds `row` at `index` (the end by default) of `rows`, as a new row of `getChanges()`, and fires `rows-change`.
   * Resolves to the row once it is drawn, so `scrollToIndex` can reach it.
   */
  async addRow(row: TableRow = {}, index?: number): Promise<TableRow> {
    const editing = await this.#loadEditing()
    return this.#keepSelection(() => editing.addRow(row, index))
  }

  /**
   * Adds a copy of `row` under it, without its `row-key` field, with `overrides` written over it: pass the copy's new
   * key there when `getRowKey` builds keys. Resolves to the copy once it is drawn, or `undefined` when `row` is not a
   * top-level row.
   */
  async duplicateRow(row: TableRow, overrides?: TableRow): Promise<TableRow | undefined> {
    const editing = await this.#loadEditing()
    return this.#keepSelection(() => editing.duplicateRow(row, overrides))
  }

  /** Removes `rows` from `rows` (and from the children of a tree), and from the selection; fires `rows-change`. */
  async deleteRows(rows: TableRow[]): Promise<void> {
    const editing = await this.#loadEditing()
    const drop = new Set(rows)
    await this.#keepSelection(() => editing.deleteRows(rows), drop)
  }

  /**
   * Runs a change of the rows and keeps the selection on the same rows (less the `dropped` ones): without a `row-key`
   * a key is a position, which now points at another row. Fires `selection-change` only if the keys moved.
   */
  async #keepSelection<T>(change: () => T, dropped?: Set<TableRow>): Promise<T> {
    // Every selected row of the dataset, not only the page on show that `getSelectedRows` covers.
    const keys = new Set(this.value)
    const selected =
      keys.size && !this.dataSource ? this.#selectableRows().filter((row, index) => keys.has(this.keyAt(index, row)) && !dropped?.has(row)) : undefined
    const result = change()
    await this.updateComplete
    if (selected) {
      const next = selected.map((row) => this.keyOf(row)).filter((key): key is string => key !== undefined)
      if (next.length !== this.value.length || next.some((key, index) => key !== this.value[index])) this.commitSelection(next)
    }
    return result
  }

  /**
   * The rows whose selection survives a change: those on show, plus with a key the ones a filter hides (a selected row
   * stays selected while it is filtered out). Without a key a position is the key, so only the rows on show count.
   */
  #selectableRows(): TableRow[] {
    if (!this.rowKey && !this.getRowKey) return this.sortedRows
    const shown = new Set(this.sortedRows)
    const hidden = this.sourceRows().filter((row) => !shown.has(row))
    return hidden.length ? [...this.sortedRows, ...hidden] : this.sortedRows
  }

  /** The rows added, edited and deleted since the rows were given or `acceptChanges()` ran. */
  getChanges(): TableChanges {
    return this.#editing?.changes() ?? { added: [], updated: [], removed: [] }
  }

  /** Takes the rows as they are as the new baseline, after a save: no cell is marked as changed any more. */
  acceptChanges() {
    this.#editing?.accept()
  }

  /** Undoes every change since the baseline: edits, added and deleted rows. Fires `rows-change`. */
  revertChanges() {
    this.#editing?.revert()
  }

  /** Checks every cell of the editable columns (`required`, the editor's type, `validate`), marks the invalid ones and resolves to them. */
  async validate(): Promise<TableCellError[]> {
    return (await this.#loadEditing()).validate()
  }

  #loadEditing(): Promise<TableEditing> {
    this.#editingLoad ??= import('./table-editing.js').then(({ TableEditing }) => {
      this.#editing = new TableEditing({
        table: this,
        columns: () => this.#renderColumns(),
        rowAt: (line) => {
          const index = this.rowIndexAt(line)
          const row = this.#sourceRowAt(index)
          return row && { row, index, key: this.keyAt(index, row) }
        },
        canEdit: (line, column) => this.#canEdit(line, column),
        flat: () => !this.structured,
        childrenField: () => this.childField,
        focus: (line, column) => {
          this.focusedCell = { row: line, column }
          this.pendingFocus = true
          this.scrollToLine(line)
        },
        message: (key, ...args) => (this.msg.t as (key: string, ...rest: string[]) => string).call(this.msg, key, ...args),
      })
      this.requestUpdate()
      return this.#editing
    })
    return this.#editingLoad
  }

  /** Whether the cell on display line `line` can be edited: an editable column, a data row, and `isCellEditable` agrees. */
  #canEdit(line: number, columnIndex: number): boolean {
    const column = this.#renderColumns()[columnIndex]
    if (!this.editable || this.dataSource || !column || !(column.editor || column.renderEditor) || !column.field) return false
    const index = this.rowIndexAt(line)
    const row = this.#sourceRowAt(index)
    // A parent row of a tree shows the rollup of its leaves in such a column, not a value of its own.
    if (!row || (column.rollup && this.rowLevel(line)?.rollup)) return false
    return this.isCellEditable?.({ value: getFieldValue(row, column.field), row, rowIndex: index, column }) ?? true
  }

  /** Starts an edit of a cell once the editing module is in. */
  #beginEdit(line: number, columnIndex: number, trigger: EditTrigger) {
    void this.#loadEditing().then((editing) => editing.begin(line, columnIndex, trigger))
  }

  /**
   * A double click on a cell, or a block pasted from a spreadsheet, in an editable table: handed to the editing module.
   * One listener each on the grid, so the cells carry none. The pasted text is read now: it is gone once the event ends.
   */
  #handleEditGesture = (event: MouseEvent | ClipboardEvent) => {
    const paste = event instanceof ClipboardEvent
    if (
      !this.editable ||
      this.dataSource ||
      event.composedPath().some((node) => node instanceof Element && node.matches('input, select, textarea, .editor-host'))
    )
      return
    const text = paste ? event.clipboardData?.getData('text/plain') : ''
    if (paste && (!text || this.focusedCell.row < 0)) return
    if (paste) event.preventDefault()
    // The path is empty once the event has been dispatched, and the module may still be on its way.
    const path = event.composedPath()
    void this.#loadEditing().then((editing) => editing.gesture(path, text, this.focusedCell))
  }

  // ---- Hooks of a table with lines of its own -----------------------------------------------------------------------
  //
  // A flat table's display lines are its rows. `c2-group-table` and `c2-tree-table` override these to add group rows and tree rows; the
  // defaults below keep `c2-table` free of that code, and cost a flat table one call that returns at once.

  /** The rows in display order: sorted, and in a subclass gathered by group. Free of side effects. */
  protected orderRows(rows: TableRow[]): TableRow[] {
    return this.sortBySortModel(rows)
  }

  /** The rows the table shows, by index: `orderRows`, or in a subclass the flattened tree it builds. */
  protected buildRows(rows: TableRow[]): TableRow[] {
    return this.orderRows(rows)
  }

  /** Whether `changed` holds a property the rows are built from beyond those of a flat table. */
  protected needsSort(_changed: PropertyValues): boolean {
    return false
  }

  /** Whether the display lines are not simply the rows (groups, a tree): a `treegrid`, with no detail panels. */
  protected get structured(): boolean {
    return false
  }

  /** The field holding a row's child rows, or `''` without a tree. */
  protected get childField(): string {
    return ''
  }

  /** Number of display lines across every page when they are not the rows; `undefined` for a flat table. */
  protected lineCount(): number | undefined {
    return undefined
  }

  /** The row index on display line `line`, or -1 for a line that is no data row (a group row). */
  protected rowIndexAt(line: number): number {
    return line
  }

  /** The display line of the row at `index`, or -1 while a closed group or parent hides it. */
  protected lineOfRow(index: number): number {
    return index
  }

  /** A line that is no data row, such as a group row, drawn by the subclass; `undefined` draws the line's data row. */
  protected renderLine(_line: number, _columns: TableColumnConfig[], _pins: Map<string, PinPlacement>): unknown {
    return undefined
  }

  /** The `repeat` key of a line that is no data row. */
  protected lineKey(_line: number): string | undefined {
    return undefined
  }

  /** The place of the data row on line `line` in a hierarchy; `undefined` in a flat table. */
  protected rowLevel(_line: number, _columns?: TableColumnConfig[]): TableRowLevel | undefined {
    return undefined
  }

  /** Whether row `key` shows the mixed state in its checkbox: some of the rows under it are selected. */
  protected isPartial(_key: string): boolean {
    return false
  }

  /** Turns row `key` on or off in `keys`; a tree takes the rows under it along. */
  protected cascade(keys: Set<string>, key: string, on: boolean) {
    if (on) keys.add(key)
    else keys.delete(key)
  }

  /** Adds the rows of a shift-click range to `keys`. */
  protected selectRange(keys: Set<string>, range: string[]) {
    for (const key of range) keys.add(key)
  }

  /** Drawn between the header and the body: the group rows kept under the header. */
  protected renderAbove(_columns: TableColumnConfig[], _pins: Map<string, PinPlacement>): unknown {
    return nothing
  }

  /** Handles a key a hierarchy owns (the treegrid's ←/→, Enter on a group); `true` when it did. */
  protected handleLineKey(_event: KeyboardEvent, _columns: TableColumnConfig[]): boolean {
    return false
  }

  /** Scrolls a line of a hierarchy that windows its own way into view; `true` when it did. */
  protected scrollToStructuredLine(_line: number): boolean {
    return false
  }

  /** Whether the row at `index` counts in the summary row and a running total: in a tree, only the leaves do. */
  protected inSummary(_index: number): boolean {
    return true
  }

  /** What the page-scoped summary depends on beyond the rows: the display lines of a hierarchy. */
  protected lineInputs(): unknown {
    return undefined
  }

  /** A field of the first row the automatic columns leave out: a tree's children field. */
  protected hiddenAutoField(): string {
    return ''
  }

  /** The body scrolled; a subclass with rows kept under the header redraws them. */
  protected onViewportScroll() {}

  /** The rows as the application gave them, in display order: the update's transition rows while one animates. */
  protected get displayRows(): TableRow[] {
    return this.#animation?.transitionRows ?? this.sortedRows
  }

  /** Drops the `dataSource` cache and reloads the visible rows. */
  refresh() {
    this.error = ''
    if (this.dataSource) this.#resetRemote()
    this.requestUpdate()
  }

  #loadAnimation(): Promise<RowsAnimation> {
    this.#animationLoad ??= import('./table-animation.js').then(({ RowsAnimation }) => {
      this.#animation = new RowsAnimation({
        table: this,
        keyAt: (index, row) => this.keyAt(index, row),
        sortRows: (rows) => this.orderRows(rows),
        hasIdentity: () => this.#hasRowIdentity,
        isTree: () => this.childField !== '',
      })
      return this.#animation
    })
    return this.#animationLoad
  }

  override requestUpdate(...args: Parameters<LitElement['requestUpdate']>) {
    if (args[0] === 'rows' && this.hasUpdated && this.animateUpdates && !this.#animation) this.#awaitAnimation = true
    super.requestUpdate(...args)
  }

  /** A snapshot that comes before the realtime code is held for it, so it animates like every later one. */
  protected override scheduleUpdate(): void | Promise<unknown> {
    if (!this.#awaitAnimation) return super.scheduleUpdate()
    this.#awaitAnimation = false
    return this.#loadAnimation().then(
      () => super.scheduleUpdate(),
      () => super.scheduleUpdate(),
    )
  }

  protected override willUpdate(changed: PropertyValues) {
    if ((changed.has('animateUpdates') && !this.animateUpdates) || (changed.has('updateDuration') && this.updateDuration <= 0)) this.#animation?.cancel()
    // Loaded with `animate-updates`, before the first snapshot comes, rather than on it.
    if (this.animateUpdates) void this.#loadAnimation()
    if (changed.has('rows')) this.#animation?.prepare(changed.get('rows'))
    if (
      !this.hasUpdated ||
      this.needsSort(changed) ||
      changed.has('dataSource') ||
      changed.has('rows') ||
      changed.has('filters') ||
      changed.has('sortModel') ||
      changed.has('columns') ||
      changed.has('columnElements')
    )
      this.applySort()
    // Another page size re-cuts the blocks, so the cache has to go; another page does not — and must not, or
    // `remoteTotal` would drop back to "unknown" and the pager would collapse to a single page mid-navigation.
    if (
      changed.has('dataSource') ||
      changed.has('blockSize') ||
      changed.has('pageSize') ||
      (this.dataSource && (changed.has('sortModel') || changed.has('filters')))
    ) {
      this.#resetRemote()
    }
    if (this.paginated) {
      // A new sort is a new dataset; start it at the top rather than on a page that may no longer exist.
      if ((changed.has('sortModel') && changed.get('sortModel') !== undefined) || (changed.has('filters') && changed.get('filters') !== undefined))
        this.page = 1
      if (!this.dataSource || this.remoteTotal >= 0) {
        const clamped = Math.min(Math.max(1, Math.floor(this.page) || 1), this.pageCount)
        if (clamped !== this.page) this.page = clamped
      }
      // `error` is sticky and blocks every further fetch, so asking for another page has to clear it.
      if ((changed.has('page') || changed.has('pageSize')) && this.error) this.error = ''
      if (changed.has('page') && this.hasUpdated) {
        this.#selectionAnchor = -1
        this.#pendingScrollTop = true
      }
    }
    this.#syncPagerContext()
    if (this.focusedCell.row !== HEADER_ROW && (this.rowCount === 0 || (this.focusedCell.row === SUMMARY_ROW && !this.#hasSummary(this.#renderColumns())))) {
      this.focusedCell = { row: HEADER_ROW, column: this.focusedCell.column }
    }
  }

  #syncPagerContext() {
    const current = this.pager
    if (!this.paginated) {
      if (current) this.pager = undefined
      return
    }
    const busy = this.loading || this.#isBootstrapping
    const totalItems = this.#lineCount
    if (current && current.page === this.page && current.pageSize === this.pageSize && current.totalItems === totalItems && current.busy === busy) {
      return
    }
    this.pager = {
      page: this.page,
      pageSize: this.pageSize,
      totalItems,
      busy,
      pageChanged: (page) => this.goToPage(page),
      pageSizeChanged: (pageSize) => this.setPageSize(pageSize),
    }
  }

  /** Shows `page`, clamped to the available range, and loads it. Fires `page-change` when the page actually moves. */
  goToPage(page: number) {
    if (!this.paginated) return
    const previousPage = this.page
    const next = Math.min(Math.max(1, Math.floor(page) || 1), this.pageCount)
    if (next === previousPage) return
    this.page = next
    this.dispatchEvent(
      new CustomEvent<TablePageChangeEventDetail>('page-change', {
        bubbles: true,
        composed: true,
        detail: {
          page: next,
          previousPage,
          pageSize: this.pageSize,
          pageCount: this.pageCount,
          start: (next - 1) * this.pageSize,
          count: this.pageSize,
          totalRows: this.totalRows,
        },
      }),
    )
  }

  /** Changes the rows per page, keeping the first row of the current page on screen. */
  setPageSize(pageSize: number) {
    const next = Math.floor(pageSize)
    if (!Number.isFinite(next) || next <= 0 || next === this.pageSize) return
    const firstRow = this.pageStart
    this.pageSize = next
    this.page = Math.floor(firstRow / next) + 1
  }

  protected override updated(changed: PropertyValues) {
    super.updated(changed)
    if (this.#pendingScrollTop) {
      this.#pendingScrollTop = false
      if (this.viewport) this.viewport.scrollTop = 0
    }
    this.#warnPositionalKeys()
    this.#measureRowHeight()
    this.#measureColumnWidths()
    this.#syncFocusToWindow()
    if (this.pendingFocus) {
      this.pendingFocus = false
      this.renderRoot.querySelector<HTMLElement>('.cell[tabindex="0"]')?.focus(this.#pendingFocusOptions)
      this.#pendingFocusOptions = undefined
    }
    if (this.dataSource) this.#ensureBlocks()
    this.#reportRenderedRange()
  }

  /**
   * The body rows rendered by the last update: their display lines, the keys of their data rows and `rows`, one
   * `{ line, key, row }` entry per rendered data row. While the table virtualizes this is the window, so a framework
   * filling `cell-slot` columns needs light-DOM children only for those lines (`slot="cell:{line}:{field}"`).
   * `range-change` fires whenever it changes.
   */
  get renderedRange(): TableRangeChangeEventDetail {
    const { start, end, keys, rows } = this.#renderedRange
    return { start, end, keys: [...keys], rows: rows.map((entry) => ({ ...entry })) }
  }

  #reportRenderedRange() {
    let start = 0
    let end = 0
    const rows: TableRenderedRow[] = []
    if (!this.error && this.rowCount > 0) {
      // The same window `render` drew (`#renderBody` gets `offset + range.start` to `offset + range.end`, clamped the
      // same way while grouped), so each `line` here is the one its cells' `cell:{line}:{field}` slots carry.
      const offset = this.pageStart
      const range = this.#window()
      start = offset + range.start
      end = this.structured ? Math.min(offset + range.end, offset + this.rowCount) : offset + range.end
      for (let line = start; line < end; line++) {
        // A line that is no data row (a group row) has no index, and so no row.
        const index = this.rowIndexAt(line)
        const row = this.#sourceRowAt(index)
        if (row) rows.push({ line, key: this.keyAt(index, row), row })
      }
    }
    // Lines are part of the comparison: a re-sort that keeps the same keys in the window moves them to other lines,
    // and every `cell:{line}:{field}` child then belongs to a different row. The row objects are too, so a framework
    // rendering from `detail.rows` sees replaced data (an animated update reports the target rows, once).
    const previous = this.#renderedRange
    const unchanged =
      this.#rangeReported &&
      previous.start === start &&
      previous.end === end &&
      previous.rows.length === rows.length &&
      rows.every((entry, i) => entry.line === previous.rows[i].line && entry.key === previous.rows[i].key && entry.row === previous.rows[i].row)
    if (unchanged) return
    this.#rangeReported = true
    this.#renderedRange = { start, end, keys: rows.map((entry) => entry.key), rows }
    this.dispatchEvent(new CustomEvent<TableRangeChangeEventDetail>('range-change', { detail: this.renderedRange }))
  }

  override render() {
    const columns = this.#renderColumns()
    const pins = this.#pinPlacements(columns)
    const range = this.#window()
    // The virtualizer windows the page; the body renders dataset indices, so shift its range by the page offset.
    const offset = this.pageStart
    const summary = this.#hasSummary(columns)

    return html`
      <div class="toolbar" part="toolbar" ?hidden=${!this.slotPresence.has('toolbar')}>
        <slot name="toolbar" @slotchange=${this.slotPresence.handleSlotChange}></slot>
      </div>
      <div class="viewport" part="viewport" @scroll=${() => this.onViewportScroll()}>
        <div
          class=${classMap({ grid: true, 'grid--wrap': this.wrap })}
          role=${this.structured ? 'treegrid' : 'grid'}
          part="grid"
          aria-rowcount=${this.#lineCount + (summary ? 2 : 1)}
          aria-colcount=${columns.length}
          aria-label=${this.gridLabel || nothing}
          aria-busy=${this.loading || this.#isBootstrapping ? 'true' : 'false'}
          style=${styleMap({ '--_grid-template': this.#gridTemplate(columns) })}
          @keydown=${this.#handleKeyDown}
          @dblclick=${this.#handleEditGesture}
          @paste=${this.#handleEditGesture}
        >
          ${this.#renderHeaderRow(columns, pins)} ${this.renderAbove(columns, pins)}
          ${range.paddingTop > 0 ? html`<div class="spacer" style="height:${range.paddingTop}px"></div>` : nothing}
          ${this.#renderBody(columns, pins, offset + range.start, offset + range.end)}
          ${range.paddingBottom > 0 ? html`<div class="spacer" style="height:${range.paddingBottom}px"></div>` : nothing}
          ${summary ? this.#renderSummaryRow(columns, pins) : nothing}
        </div>
      </div>
      <div class="footer" part="footer" ?hidden=${!this.slotPresence.has('footer')}>
        <slot name="footer" @slotchange=${this.slotPresence.handleSlotChange}></slot>
      </div>
      ${this.#filter?.render() ?? nothing}
      <slot class="definitions" @slotchange=${this.#handleDefinitionsChange}></slot>
      <slot name="fallback" class="definitions"></slot>
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
    const lines: number[] = []
    // The window is the virtualizer's from the last layout; closing a group shortens the list before it catches up.
    const last = this.structured ? Math.min(end, this.pageStart + this.rowCount) : end
    for (let line = start; line < last; line++) lines.push(line)
    const detail = this.#detail
    return repeat(
      lines,
      (line) => {
        const own = this.lineKey(line)
        if (own !== undefined) return own
        const index = this.rowIndexAt(line)
        const row = this.#rowAt(index)
        return row ? this.keyAt(index, row) : `skeleton:${index}`
      },
      (line) =>
        this.renderLine(line, columns, pins) ??
        (detail ? html`${this.#renderRow(line, columns, pins)}${this.#renderDetailRow(line, columns)}` : this.#renderRow(line, columns, pins)),
    )
  }

  /** Moves the roving tabindex to a cell of display line `line` (a click on a group row, which does not select). */
  protected focusLine(line: number, column = this.focusedCell.column) {
    if (line >= 0) this.focusedCell = { row: line, column }
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
      const total = this.rowTotal
      const selected = this.value.length
      const allSelected = total > 0 && selected >= total
      return html`
        <div
          class=${classMap({ cell: true, 'cell--header': true, 'cell--selection': true, ...this.pinClasses(column, pins) })}
          role="columnheader"
          part="header-cell selection-header-cell"
          data-field=${column.field}
          data-column-id=${columnKey(column)}
          aria-colindex=${columnIndex + 1}
          tabindex=${this.tabIndexFor(HEADER_ROW, columnIndex)}
          style=${styleMap(this.pinStyle(column, pins))}
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
    const label = column.renderHeader ? column.renderHeader({ column }) : (column.header ?? humanize(column.field || columnKey(column)))

    return html`
      <div
        class=${classMap({
          cell: true,
          'cell--header': true,
          'cell--sortable': sortable,
          'cell--sorted': Boolean(sort),
          [`cell--align-${column.align ?? 'start'}`]: true,
          ...this.pinClasses(column, pins),
        })}
        role="columnheader"
        part="header-cell"
        data-field=${column.field}
        data-column-id=${columnKey(column)}
        aria-colindex=${columnIndex + 1}
        aria-sort=${ifDefined(sortable ? (sort ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none') : undefined)}
        tabindex=${this.tabIndexFor(HEADER_ROW, columnIndex)}
        style=${styleMap(this.pinStyle(column, pins))}
        @click=${(event: MouseEvent) => {
          this.focusedCell = { row: HEADER_ROW, column: columnIndex }
          this.#toggleSort(column, event.shiftKey)
        }}
      >
        <span class="cell-content">${label}</span>
        ${sortable ? this.#renderSortIcon(sort?.direction) : nothing} ${this.#isFilterable(column) ? this.#renderFilterButton(column, columnIndex) : nothing}
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

  /** A data row on display line `line`, which is also its row index unless the rows are grouped. */
  #renderRow(line: number, columns: TableColumnConfig[], pins: Map<string, PinPlacement>) {
    const index = this.rowIndexAt(line)
    const row = this.#rowAt(index)
    const key = row ? this.keyAt(index, row) : ''
    // Its place in a hierarchy (a group, a tree), when the table has one: undefined in a flat table.
    const level = this.rowLevel(line, columns)
    const open = level?.expanded
    const detailColumn = row && this.#detail ? columns.find((column) => column.field !== SELECTION_FIELD) : undefined
    const selected = key !== '' && this.value.includes(key)
    const selectable = this.selection !== 'none'
    const updateState = key ? this.#animation?.states.get(key) : undefined
    const rowStyle = row && updateState !== 'removed' ? this.rowStyle?.({ row, rowIndex: index, key }) : undefined
    const extraParts = row && updateState !== 'removed' ? this.rowPart?.({ row, rowIndex: index, key }) : undefined

    return html`
      <div
        class=${classMap({
          row: true,
          'row--body': true,
          'row--odd': line % 2 === 1,
          'row--selected': selected,
          'row--clickable': selectable,
          'row--highlighted': Boolean(updateState && this.highlightUpdates),
          'row--tree-collapsed': open === false,
          [`row--${updateState}`]: Boolean(updateState),
        })}
        role="row"
        part=${[
          'row',
          selected ? 'row-selected' : '',
          updateState ? `row-${updateState}` : '',
          row && this.#editing?.isNew(this.#sourceRowAt(index) ?? row) ? 'row-new' : '',
          ...(typeof extraParts === 'string' ? extraParts.split(/\s+/) : (extraParts ?? [])),
        ]
          .filter(Boolean)
          .join(' ')}
        data-row-key=${key}
        data-update-state=${ifDefined(updateState)}
        aria-rowindex=${line + 2}
        aria-level=${ifDefined(level?.level)}
        aria-expanded=${ifDefined(open === undefined ? undefined : String(open))}
        aria-busy=${ifDefined(level?.busy ? 'true' : undefined)}
        aria-selected=${ifDefined(selectable ? String(selected) : undefined)}
        aria-hidden=${ifDefined(updateState === 'removed' ? 'true' : undefined)}
        style=${styleMap({ ...rowStyle, '--_update-duration': `${Math.max(0, this.updateDuration)}ms` })}
        @click=${(event: MouseEvent) => this.#handleRowClick(event, line)}
      >
        ${columns.map((column, columnIndex) => this.#renderCell(row, line, index, column, columnIndex, pins, level, column === detailColumn))}
      </div>
    `
  }

  /**
   * `line` is the cell's display line (focus, keyboard), `rowIndex` the row's index (data, keys). `level` is the row's
   * place in a hierarchy (a group, a tree), from `rowLevel`: its column holds the indentation and the chevron.
   */
  #renderCell(
    row: TableRow | undefined,
    line: number,
    rowIndex: number,
    column: TableColumnConfig,
    columnIndex: number,
    pins: Map<string, PinPlacement>,
    level?: TableRowLevel,
    detail = false,
  ) {
    // The column of a hierarchy holds the indentation and the chevron; every column may show a parent's rollup.
    const own = level && column === level.column
    const indent = own ? level.indent : 0
    const classes = {
      cell: true,
      [`cell--align-${column.align ?? 'start'}`]: true,
      'cell--selection': column.field === SELECTION_FIELD,
      ...this.pinClasses(column, pins),
      ...(column.cellClass ? { [column.cellClass]: true } : {}),
    }
    const shared = {
      class: classMap(classes),
      tabindex: this.tabIndexFor(line, columnIndex),
      style: styleMap(this.pinStyle(column, pins)),
    }

    if (column.field === SELECTION_FIELD) {
      const key = row ? this.keyAt(rowIndex, row) : ''
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
                  ?indeterminate=${this.isPartial(key)}
                  @click=${(event: Event) => event.stopPropagation()}
                  @change=${() => this.#handleCheckboxToggle(line)}
                ></c2-checkbox>`
              : nothing
          }
        </div>
      `
    }

    const id = columnKey(column)
    const value = level?.rollup?.has(id)
      ? level.rollup.get(id)
      : row && (column.running || column.countValue !== undefined || !column.field)
        ? this.cellValue(this.#sourceRowAt(rowIndex) ?? row, column)
        : row && this.readCell(row, column)
    const rendered = row
      ? column.renderCell
        ? column.renderCell({ value, row, rowIndex, column })
        : value instanceof Map
          ? // A tree parent's `tally` rollup: each value with its count, as the summary row draws it.
            this.formatAggregate(column, value, false)
          : column.editor === 'checkbox'
            ? this.#renderCheckCell(line, columnIndex, column, value)
            : column.format === 'status'
              ? this.#renderStatus(column, value)
              : this.formatValue(column, value)
      : undefined
    // A column comparing with `baseline` shows each cell's change, and marks a change past its threshold.
    const versus = row && this.baseline && (column.compare || column.varianceThreshold !== undefined) ? this.#versus(rowIndex, row, column, value) : undefined
    const flag = row && (column.referenceRange || column.criticalRange) ? this.#flagOf(this.#sourceRowAt(rowIndex) ?? row, column, value) : undefined
    // Only once something was edited: until then an editable table renders its cells exactly as a read-only one. The
    // module knows rows as the application gave them, not the interpolated copy an animated update draws.
    const editing = row ? this.#editing : undefined
    const source = editing && this.#sourceRowAt(rowIndex)
    const editor = source ? editing!.editor(source, column, rowIndex) : undefined
    const state = source ? editing!.cellState(source, column) : undefined
    // A `cell-slot` column takes its body from a light-DOM child, which is how React, Vue and Angular render a
    // cell with their own template language instead of building DOM nodes by hand. Whatever `renderCell` or the
    // formatter produced stays as the slot's fallback, so a row with no child still shows its value.
    const content = editor
      ? editor
      : row
        ? column.cellSlot
          ? html`<slot name=${`cell:${line}:${columnKey(column)}`}>${rendered}</slot>`
          : versus?.delta !== undefined || flag
            ? html`${rendered}${flag?.mark}${versus?.delta}`
            : rendered
        : html`<span class="skeleton" part="skeleton"></span>`

    // A cell and its content each carry a part named after the column, so one column can be styled from outside —
    // the cell for its box, the content for the text itself, which is what a pill or a chip needs.
    const fieldPart = columnKey(column).replace(/[^\w-]/g, '-')
    return html`
      <div
        class=${
          state || editor || versus?.over || flag
            ? classMap({
                [`cell--flag-${flag?.flag}`]: Boolean(flag),
                ...classes,
                'cell--editing': Boolean(editor),
                'cell--dirty': Boolean(state?.dirty),
                'cell--invalid': Boolean(state?.error),
                'cell--variance': Boolean(versus?.over),
              })
            : shared.class
        }
        role="gridcell"
        part="cell cell-${fieldPart}${state?.dirty ? ' cell-dirty' : ''}${state?.error ? ' cell-invalid' : ''}${versus?.over ? ' cell-variance' : ''}${flag ? ` cell-flag cell-flag-${flag.flag}` : ''}"
        aria-colindex=${columnIndex + 1}
        aria-invalid=${ifDefined(state?.error ? 'true' : undefined)}
        title=${ifDefined(state?.error)}
        tabindex=${shared.tabindex}
        style=${shared.style}
        @click=${() => this.#handleCellClick(line, columnIndex, column, value)}
        @c2-context-menu-request=${(event: Event) => this.#handleContextMenuRequest(event, line, columnIndex, column, value)}
      >
        ${own && level.toggle ? level.toggle() : nothing} ${detail && row ? this.#renderDetailToggle(row, rowIndex, line, columnIndex) : nothing}
        <span
          class=${classMap({ 'cell-content': true, 'cell-content--indented': indent > 0 })}
          part="cell-content cell-content-${fieldPart}"
          style=${styleMap(indent > 0 ? { '--_group-level': String(indent) } : {})}
          >${content}</span
        >${state?.error ? html`<span class="cell-error">${state.error}</span>` : nothing}
      </div>
    `
  }

  /**
   * A cell against the matching row of `baseline`: the change as `compare` shows it, and whether it passes the
   * column's `variance-threshold`. Nothing when either value is not a number.
   */
  #versus(rowIndex: number, row: TableRow, column: TableColumnConfig, value: unknown): { delta?: unknown; over: boolean } | undefined {
    if (!this.rowKey && !this.getRowKey) {
      // Without a key a position would match the baseline, and a sort or a filter moves the rows.
      if (!this.#baselineWarned) console.warn('c2-table: `baseline` matches rows by `row-key` (or `getRowKey`); set one to compare.')
      this.#baselineWarned = true
      return undefined
    }
    const source = this.#sourceRowAt(rowIndex) ?? row
    const inputs = [this.baseline, this.rowKey, this.getRowKey]
    // Keyed once per baseline (and key rule): a lookup per cell, not a search.
    if (!this.#baselineCache?.inputs.every((input, index) => input === inputs[index])) {
      const rows = new Map<string, TableRow>()
      ;(Array.isArray(this.baseline) ? this.baseline : []).forEach((entry, index) => rows.set(this.keyAt(index, entry), entry))
      this.#baselineCache = { inputs, rows }
    }
    const before = this.#baselineCache.rows.get(this.keyAt(rowIndex, source))
    const previous = before && toNumber(this.cellValue(before, column))
    const current = toNumber(value)
    if (previous === undefined || !Number.isFinite(previous) || !Number.isFinite(current)) return undefined
    const change = current - previous
    const threshold = column.varianceThreshold
    const over = threshold !== undefined && (previous === 0 ? change !== 0 : Math.abs(change) > Math.abs(previous) * threshold)
    if (!column.compare) return { over }
    // An unchanged value shows no change: a column of zeros would hide the rows that moved.
    const text =
      change === 0
        ? ''
        : column.compare === 'percent'
          ? previous === 0
            ? ''
            : new Intl.NumberFormat(column.locale, { style: 'percent', maximumFractionDigits: 1, signDisplay: 'exceptZero' }).format(
                change / Math.abs(previous),
              )
          : this.formatValue(
              {
                ...column,
                options: undefined,
                format: column.format && column.format !== 'text' && column.format !== 'status' ? column.format : 'number',
                formatOptions: { ...column.formatOptions, signDisplay: 'exceptZero' },
              },
              change,
            )
    const delta = html`<span
      class="delta"
      part="delta delta-${change > 0 ? 'up' : change < 0 ? 'down' : 'flat'}"
      title=${this.msg.t('previousValue', this.formatValue(column, previous))}
      >${text}</span
    >`
    return { delta, over }
  }

  /**
   * Where a cell stands against its row's `critical-range`, then its `reference-range`, and the mark it shows: the
   * short letter a lab report prints (`H`, `L`), its name for a screen reader and the range as its tooltip.
   */
  #flagOf(row: TableRow, column: TableColumnConfig, value: unknown): { flag: TableCellFlag; mark: unknown } | undefined {
    const number = toNumber(value)
    if (!Number.isFinite(number)) return undefined
    const [criticalLow, criticalHigh] = this.#limits(row, column.criticalRange)
    const [low, high] = this.#limits(row, column.referenceRange)
    const flag: TableCellFlag | undefined =
      criticalLow !== undefined && number < criticalLow
        ? 'critical-low'
        : criticalHigh !== undefined && number > criticalHigh
          ? 'critical-high'
          : low !== undefined && number < low
            ? 'low'
            : high !== undefined && number > high
              ? 'high'
              : undefined
    if (!flag) return undefined
    const [letter, name] = {
      low: ['flagLow', 'flagLowName'],
      high: ['flagHigh', 'flagHighName'],
      'critical-low': ['flagCriticalLow', 'flagCriticalLowName'],
      'critical-high': ['flagCriticalHigh', 'flagCriticalHighName'],
    }[flag] as ['flagLow', 'flagLowName']
    const limit = (bound: number | undefined) => (bound === undefined ? '' : this.formatValue(column, bound))
    const range = low === undefined && high === undefined ? '' : `${limit(low)}–${limit(high)}`
    const label = this.msg.t(name)
    const mark = html`<span class="flag" part="flag flag-${flag}" title=${range ? this.msg.t('flagRange', label, range) : label}
      ><span aria-hidden="true">${this.msg.t(letter)}</span><span class="flag-name">${label}</span></span
    >`
    return { flag, mark }
  }

  /** The two limits of a range attribute (`low,high`): each a number, or the field of the row that holds one. */
  #limits(row: TableRow, range?: string): [number | undefined, number | undefined] {
    if (!range) return [undefined, undefined]
    const [low, high] = range.split(',').map((part) => {
      const text = part.trim()
      if (!text) return undefined
      const literal = Number(text)
      const number = Number.isFinite(literal) ? literal : toNumber(getFieldValue(row, text))
      return Number.isFinite(number) ? number : undefined
    })
    return [low, high]
  }

  /** Whether `column` has a filter in its header: its own `filterable`, else the table's. */
  #isFilterable(column: TableColumnConfig): boolean {
    if (column.field === SELECTION_FIELD || !(column.filterable ?? this.filterable)) return false
    // A data source has no values to list but the ones a column declares in `options`.
    return !this.dataSource || Boolean(column.options?.length)
  }

  /** The filter button of a header: it opens the column's values, and shows when the column is filtered. */
  #renderFilterButton(column: TableColumnConfig, columnIndex: number) {
    const id = columnKey(column)
    const filter = this.filters?.[id]
    const active = Boolean(filter?.include?.length || filter?.exclude?.length)
    return html`<button
      class=${classMap({ 'filter-button': true, 'filter-button--active': active })}
      part=${active ? 'filter-button filter-button-active' : 'filter-button'}
      type="button"
      tabindex="-1"
      aria-label=${this.msg.t('filterColumn', column.header ?? humanize(column.field || id))}
      aria-haspopup="dialog"
      aria-expanded=${String(this.#filter?.openColumn === id)}
      @click=${(event: Event) => {
        event.stopPropagation()
        this.focusedCell = { row: HEADER_ROW, column: columnIndex }
        this.#openFilter(column, event.currentTarget as HTMLElement)
      }}
    >
      ${FUNNEL}
    </button>`
  }

  #openFilter(column: TableColumnConfig, anchor: HTMLElement) {
    this.#filterLoad ??= import('./table-filter.js').then(({ TableFilter }) => {
      this.#filter = new TableFilter({
        table: this,
        rowsFor: (id) => (this.dataSource ? [] : this.filterValueRows(id)),
        cellValue: (row, target) => this.cellValue(row, target),
        formatValue: (target, value) => this.formatValue(target, value),
        sortable: (target) => Boolean(target.field && (target.sortable ?? this.sortable)),
        sort: (target, direction) => {
          this.sortModel = [{ field: target.field, direction }]
          this.dispatchEvent(new CustomEvent<TableSortChangeEventDetail>('sort-change', { detail: { sort: this.sortModel }, bubbles: true, composed: true }))
        },
        message: (key, ...args) => (this.msg.t as (key: string, ...rest: string[]) => string).call(this.msg, key, ...args),
      })
      return this.#filter
    })
    void this.#filterLoad.then((filter) => filter.open(column, anchor))
  }

  /**
   * `rows` without those the column filters drop; `skip` leaves one column's filter out (its own value list shows the
   * values the other filters let through). Values compare as text. Not applied to a `dataSource`, which filters itself.
   */
  protected filterRows(rows: TableRow[], skip?: string): TableRow[] {
    const test = this.filterTest(skip)
    return test ? rows.filter(test) : rows
  }

  /** The rows a column's filter counts its values over: those every other filter lets through. */
  protected filterValueRows(skip: string): TableRow[] {
    return this.filterRows(this.sourceRows(), skip)
  }

  /** Whether a row passes every active filter (but `skip`'s); undefined when no filter is active. */
  protected filterTest(skip?: string): ((row: TableRow) => boolean) | undefined {
    const filters = this.filters
    if (!filters || this.dataSource) return undefined
    const active = Object.entries(filters).filter(([id, filter]) => id !== skip && (filter?.include?.length || filter?.exclude?.length))
    if (!active.length) return undefined
    // Columns a variant derives are found among the resolved ones; a hidden column, among the declared ones.
    const source: TableColumnConfig[] = [...this.resolvedColumns, ...(this.columnElements.length ? this.columnElements : (this.columns ?? []))]
    const tests = active.map(([id, filter]) => ({
      column: source.find((column) => columnKey(column) === id) ?? { field: id },
      include: filter.include?.length ? new Set(filter.include) : undefined,
      exclude: new Set(filter.exclude ?? []),
    }))
    return (row) =>
      tests.every(({ column, include, exclude }) => {
        const text = filterText(this.cellValue(row, column))
        return (!include || include.has(text)) && !exclude.has(text)
      })
  }

  /** The checkbox of a `checkbox` column: toggled in place while the cell can be edited, a read-only mark otherwise. */
  #renderCheckCell(line: number, columnIndex: number, column: TableColumnConfig, value: unknown) {
    return html`<c2-checkbox
      aria-label=${column.header ?? column.field}
      .checked=${live(Boolean(value))}
      ?disabled=${!this.#canEdit(line, columnIndex)}
      @click=${(event: Event) => event.stopPropagation()}
      @change=${() => this.#beginEdit(line, columnIndex, 'edit')}
    ></c2-checkbox>`
  }

  /** Whether rows have a detail panel: `detail-height` is set and the rows are neither grouped nor a tree. */
  get #detail(): boolean {
    return this.detailHeight > 0 && !this.structured
  }

  #isDetailOpen(key: string): boolean {
    const open = this.expandedDetails
    if (!open?.length) return false
    if (this.#openDetails?.source !== open) this.#openDetails = { source: open, keys: new Set(open) }
    return this.#openDetails.keys.has(key)
  }

  #setDetailExpanded(key: string, expanded: boolean): boolean {
    if (this.#isDetailOpen(key) === expanded) return false
    const current = this.expandedDetails ?? []
    this.expandedDetails = expanded ? [...current, key] : current.filter((entry) => entry !== key)
    return true
  }

  #toggleDetail(key: string, row: TableRow, expanded = !this.#isDetailOpen(key)) {
    if (!this.#setDetailExpanded(key, expanded)) return
    this.dispatchEvent(new CustomEvent<TableDetailToggleEventDetail>('detail-toggle', { detail: { key, row, expanded }, bubbles: false, composed: true }))
    // A panel opened at the bottom edge is brought into view, as far as its row stays under the header.
    if (expanded)
      void this.updateComplete.then(() => {
        const panel = [...this.renderRoot.querySelectorAll<HTMLElement>('.row--detail')].find((entry) => entry.dataset.detailKey === key)
        const viewport = this.viewport
        if (!panel || !viewport) return
        const over = panel.getBoundingClientRect().bottom - viewport.getBoundingClientRect().bottom
        const room = panel.getBoundingClientRect().top - this.rowHeightPx - viewport.getBoundingClientRect().top - this.headerHeight()
        if (over > 0 && room > 0) viewport.scrollTop += Math.min(over, room)
      })
  }

  /**
   * The lines of the page whose detail panel is open, in order, counted from the page's first line. Found by one walk
   * over the rows, kept until the rows, the page or the open keys change: scrolling never repeats it.
   */
  #detailLines(): number[] {
    const keys = this.expandedDetails
    if (!keys?.length || !this.#detail) return NO_LINES
    const count = this.rowCount
    const first = this.pageStart
    const inputs = [keys, this.sortedRows, this.#animation?.transitionRows, first, count, this.#blocksVersion, this.rowKey, this.getRowKey]
    const cached = this.#detailCache
    if (cached && inputs.every((input, index) => input === cached.inputs[index])) return cached.lines
    const wanted = new Set(keys)
    const lines: number[] = []
    if (this.dataSource) {
      // Only the blocks that arrived can hold an open row: a key that is not loaded costs no walk over the total.
      const size = this.#effectiveBlockSize
      for (const [block, rows] of this.#blocks) {
        rows.forEach((row, position) => {
          const line = block * size + position - first
          if (line >= 0 && line < count && wanted.has(this.keyAt(first + line, row))) lines.push(line)
        })
      }
      lines.sort((a, b) => a - b)
    } else {
      for (let line = 0; line < count && lines.length < wanted.size; line++) {
        const row = this.#sourceRowAt(first + line)
        if (row && wanted.has(this.keyAt(first + line, row))) lines.push(line)
      }
    }
    this.#detailCache = { inputs, lines }
    return lines
  }

  /**
   * The window to render: the virtualizer's, which counts uniform rows, moved by the detail panels open above it.
   * Each adds `detail-height` to the offset of the rows after it, so the first visible row is found by walking the
   * open panels, and the spacers carry the panels outside the window. With no panel open it is the virtualizer's own.
   */
  #window(): VirtualScrollRange {
    const range = this.#virtualizer.range
    const open = this.#detailLines()
    if (open.length === 0 || !this.isVirtualized) return range
    const height = this.rowHeightPx
    const panel = this.detailHeight
    const count = this.rowCount
    // An update reads the window several times (render, focus, blocks, range-change): computed once per scroll position.
    const inputs = [range, open, this.#virtualizer.scrollTop, height, panel, count, this.overscan]
    const cached = this.#windowCache
    if (cached && inputs.every((input, index) => input === cached.inputs[index])) return cached.range
    // Past the browser's height limit the virtualizer scales the scroll offset; `shift` is what it added to it.
    const shift = Math.max(0, range.start * height - range.paddingTop)
    const offset = this.#virtualizer.scrollTop + shift
    let above = 0
    let first = Math.floor(offset / height)
    while (above < open.length && open[above] < first) {
      above++
      // Inside the panel of that row, the row itself is the first one still on screen.
      first = Math.max(open[above - 1], Math.floor((offset - above * panel) / height))
    }
    // One more row than the overscan: the virtualizer asks for a render when its own first row changes, which with
    // panels above is up to a row away from when this one does.
    const overscan = Math.max(0, this.overscan) + 1
    const start = Math.max(0, Math.min(first, count - 1) - overscan)
    const end = Math.min(count, start + Math.ceil((this.viewport?.clientHeight || 480) / height) + 1 + overscan * 2)
    const before = open.filter((line) => line < start).length
    const inside = open.filter((line) => line >= start && line < end).length
    const total = range.paddingTop + (range.end - range.start) * height + range.paddingBottom + open.length * panel
    const paddingTop = Math.max(0, start * height + before * panel - shift)
    const moved = { start, end, paddingTop, paddingBottom: Math.max(0, total - paddingTop - (end - start) * height - inside * panel) }
    this.#windowCache = { inputs, range: moved }
    return moved
  }

  /** The chevron that opens a row's detail panel: a button, since a plain grid row has no expanded state of its own. */
  #renderDetailToggle(row: TableRow, rowIndex: number, line: number, columnIndex: number) {
    const key = this.keyAt(rowIndex, row)
    const open = this.#isDetailOpen(key)
    return html`<button
      class=${classMap({ 'group-toggle': true, 'detail-toggle': true, 'detail-toggle--closed': !open })}
      part="detail-toggle"
      type="button"
      tabindex="-1"
      aria-label=${this.detailLabel || this.msg.t('detailToggle')}
      aria-expanded=${String(open)}
      aria-controls=${open ? `detail-${line}` : nothing}
      @click=${(event: Event) => {
        event.stopPropagation()
        // The click put focus on the button: the keys that follow act on this row, not on the last cell focused.
        this.focusedCell = { row: line, column: columnIndex }
        this.#toggleDetail(key, this.#sourceRowAt(rowIndex) ?? row)
      }}
    >
      ${CHEVRON}
    </button>`
  }

  /**
   * The panel under an open row: a row of the grid with one cell across every column, of the declared height. Its
   * cell is a tab stop, so a panel taller than its content's room scrolls from the keyboard. A renderer runs again
   * only when its row changes, so the panel keeps what the user did in it while the table redraws around it.
   *
   * A closed panel filled from the row's slot stays in the page as `hidden="until-found"`, with no height, so
   * find-in-page reaches its text and opens it. Where the browser has no such state it is not drawn, and neither is
   * a renderer's panel, which is drawn on open.
   */
  #renderDetailRow(line: number, columns: TableColumnConfig[]) {
    const index = this.rowIndexAt(line)
    const row = this.#sourceRowAt(index)
    if (!row) return nothing
    const key = this.keyAt(index, row)
    const open = this.#isDetailOpen(key)
    const renderer = this.renderDetail
    if (!open && (renderer || !FINDABLE)) return nothing
    return html`<div
      class="row row--detail"
      role="row"
      data-detail-key=${key}
      hidden=${open ? nothing : 'until-found'}
      aria-hidden=${open ? nothing : 'true'}
      style=${open ? `height:${this.detailHeight}px` : nothing}
      @beforematch=${() => this.#toggleDetail(key, row, true)}
    >
      <div class="detail" id="detail-${line}" role="gridcell" part="detail" tabindex=${open ? '0' : nothing} aria-colspan=${columns.length}>
        ${renderer ? guard([renderer, row, index, key], () => renderer({ row, rowIndex: index, key })) : html`<slot name=${`detail:${key}`}></slot>`}
      </div>
    </div>`
  }

  #hasSummary(columns: TableColumnConfig[]): boolean {
    if (this.error || this.rowCount === 0) return false
    if (this.summaryValues) return true
    return columns.some((column) => column.summary !== undefined || column.summaryLabel !== undefined || column.renderSummary !== undefined)
  }

  /** The summary row's cells: one per column, except that a `summary-span` cell stands in for the columns it covers. */
  #summaryCells(columns: TableColumnConfig[]): SummaryCell[] {
    const cells: SummaryCell[] = []
    for (let index = 0; index < columns.length;) {
      const column = columns[index]
      const span = Math.min(Math.max(1, Math.floor(column.summarySpan ?? 1) || 1), columns.length - index)
      cells.push({ column, index, span })
      index += span
    }
    return cells
  }

  /**
   * The rows the summary covers and the value of every column, keyed by column id. Cached on its inputs: the table
   * re-renders on every scroll frame while virtualizing, and aggregating a large dataset each time would be wasted.
   */
  #summaryData(columns: TableColumnConfig[]): { rows: TableRow[]; values: Map<string, unknown> } {
    const pageScope = this.summaryScope === 'page'
    // A `dataSource` only holds the blocks it has fetched, so an aggregate over "all" of it would be a partial sum
    // presented as a total. Its page, once loaded, is complete; otherwise the server's figures come in `summaryValues`.
    const aggregatable = !this.dataSource || (pageScope && this.paginated)
    const start = pageScope ? this.pageStart : 0
    const count = !aggregatable ? 0 : pageScope ? this.rowCount : (this.#animation?.transitionRows ?? this.sortedRows).length
    const inputs = [
      columns.length,
      ...columns.map((column) => column.summary),
      this.columnElements,
      this.columns,
      this.summaryValues,
      this.sortedRows,
      this.#animation?.transitionRows,
      this.#animation?.progress,
      this.dataSource ? this.#blocks.get(this.page - 1) : undefined,
      pageScope ? this.lineInputs() : undefined,
      start,
      count,
    ]
    const cached = this.#summaryCache
    if (cached && cached.inputs.length === inputs.length && cached.inputs.every((input, index) => input === inputs[index])) return cached

    const rows: TableRow[] = []
    // The rows as given, which computed columns (`running`) are keyed by; `rows` may hold an animated update's copies.
    const sources: TableRow[] = []
    for (let cursor = start; cursor < start + count; cursor++) {
      // The page is made of display lines, so while grouped its rows are those on the page's data lines.
      const index = pageScope ? this.rowIndexAt(cursor) : cursor
      const row = this.#rowAt(index)
      // A row collapsing out during an animated update is already gone from the data, so it no longer counts. In a
      // tree only the leaves count: a parent's figures are its children's, and would be counted twice.
      if (row && this.#animation?.states.get(this.keyAt(index, row)) !== 'removed' && this.inSummary(index)) {
        rows.push(row)
        sources.push(this.#sourceRowAt(index) ?? row)
      }
    }
    const values = new Map<string, unknown>()
    for (const column of columns) {
      const key = columnKey(column)
      if (this.summaryValues && Object.prototype.hasOwnProperty.call(this.summaryValues, key)) values.set(key, this.summaryValues[key])
      // Without rows to aggregate a sum would still read 0 — a figure, and a wrong one. Leave the cell to its label.
      else if (!aggregatable) continue
      else if (typeof column.summary === 'function') values.set(key, column.summary({ column, rows }))
      else if (column.summary && (column.field || column.running || column.countValue !== undefined))
        values.set(
          key,
          aggregate(
            column.summary,
            sources.map((row) => this.cellValue(row, column)),
          ),
        )
    }
    this.#summaryCache = { inputs, rows, values }
    return this.#summaryCache
  }

  #renderSummaryRow(columns: TableColumnConfig[], pins: Map<string, PinPlacement>) {
    const { rows, values } = this.#summaryData(columns)
    return html`
      <div class="row row--summary" role="row" part="summary-row" aria-rowindex=${this.#lineCount + 2}>
        ${this.#summaryCells(columns).map((cell) => this.#renderSummaryCell(cell, rows, values, pins))}
      </div>
    `
  }

  #renderSummaryCell({ column, index, span }: SummaryCell, rows: TableRow[], values: Map<string, unknown>, pins: Map<string, PinPlacement>) {
    const key = columnKey(column)
    const value = values.get(key)
    const explicit = Boolean(this.summaryValues && Object.prototype.hasOwnProperty.call(this.summaryValues, key))
    let content: unknown
    if (column.renderSummary) content = column.renderSummary({ column, rows, value })
    else if (value !== undefined && value !== null && value !== '') {
      content = this.formatAggregate(column, value, explicit)
    } else content = column.summaryLabel ?? ''

    const focused = this.focusedCell.row === SUMMARY_ROW && this.focusedCell.column >= index && this.focusedCell.column < index + span
    const part = key.replace(/[^\w-]/g, '-')
    // A total that must reach a value, such as shares adding up to 100%: off target, the cell is marked and says so.
    const target = column.summaryTarget
    // Compared as the cell shows them, so 33.33 + 33.33 + 33.34 is on target and a total that reads `100` is never flagged.
    const off =
      target !== undefined &&
      target !== null &&
      typeof value === 'number' &&
      this.formatAggregate(column, value, explicit) !== this.formatAggregate(column, target, explicit)
    const offText = off ? this.msg.t('summaryOffTarget', String(this.formatAggregate(column, target, explicit))) : undefined
    return html`
      <div
        class=${classMap({
          cell: true,
          'cell--summary': true,
          'cell--off-target': off,
          [`cell--align-${column.summaryAlign ?? column.align ?? 'start'}`]: true,
          'cell--selection': column.field === SELECTION_FIELD,
          ...this.pinClasses(column, pins),
          ...(column.cellClass ? { [column.cellClass]: true } : {}),
        })}
        role="gridcell"
        part="summary-cell summary-cell-${part}${off ? ' summary-cell-off-target' : ''}"
        title=${ifDefined(offText)}
        aria-colindex=${index + 1}
        aria-colspan=${ifDefined(span > 1 ? span : undefined)}
        tabindex=${focused ? 0 : -1}
        style=${styleMap({ ...this.pinStyle(column, pins), ...(span > 1 ? { 'grid-column': `span ${span}` } : {}) })}
        @click=${() => (this.focusedCell = { row: SUMMARY_ROW, column: index })}
      >
        ${column.field === SELECTION_FIELD ? nothing : html`<span class="cell-content" part="summary-content summary-content-${part}">${content}</span>`}
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
    // A tree's children field holds rows, not a value to show.
    const children = this.hiddenAutoField().split('.')[0]
    return Object.keys(first)
      .filter((field) => field !== children)
      .map((field) => ({ field, header: humanize(field) }))
  }

  #gridTemplate(columns: TableColumnConfig[]): string {
    return columns
      .map((column) => {
        const override = this.widthOverrides[columnKey(column)]
        if (override) return `${override}px`
        const width = column.width || '1fr'
        // A bare `fr` track is `minmax(auto, Nfr)`, and a cell's `auto` minimum is 0 (cells clip), so on a narrow
        // screen the fixed tracks take everything and the flexible column collapses. Floor it at `minWidth`;
        // the viewport then scrolls sideways instead.
        return FLEX_TRACK.test(width) ? `minmax(${column.minWidth ?? DEFAULT_MIN_WIDTH}px, ${width.trim()})` : width
      })
      .join(' ')
  }

  #pinPlacements(columns: TableColumnConfig[]): Map<string, PinPlacement> {
    const placements = new Map<string, PinPlacement>()
    const startColumns = columns.filter((column) => column.pinned === 'start')
    const endColumns = columns.filter((column) => column.pinned === 'end')

    let offset = 0
    startColumns.forEach((column, index) => {
      placements.set(columnKey(column), { side: 'start', offset, edge: index === startColumns.length - 1 })
      offset += this.#columnWidth(column)
    })

    offset = 0
    for (let index = endColumns.length - 1; index >= 0; index--) {
      const column = endColumns[index]
      placements.set(columnKey(column), { side: 'end', offset, edge: index === 0 })
      offset += this.#columnWidth(column)
    }

    return placements
  }

  #columnWidth(column: TableColumnConfig): number {
    const key = columnKey(column)
    return this.widthOverrides[key] ?? this.#measuredWidths.get(key) ?? 0
  }

  protected pinClasses(column: TableColumnConfig, pins: Map<string, PinPlacement>): Record<string, boolean> {
    const pin = pins.get(columnKey(column))
    if (!pin) return {}
    return {
      'cell--pinned': true,
      'cell--pinned-edge-start': pin.side === 'start' && pin.edge,
      'cell--pinned-edge-end': pin.side === 'end' && pin.edge,
    }
  }

  protected pinStyle(column: TableColumnConfig, pins: Map<string, PinPlacement>): Record<string, string> {
    const pin = pins.get(columnKey(column))
    if (!pin) return {}
    return pin.side === 'start' ? { left: `${pin.offset}px` } : { right: `${pin.offset}px` }
  }

  protected tabIndexFor(rowIndex: number, columnIndex: number): number {
    return this.focusedCell.row === rowIndex && this.focusedCell.column === columnIndex ? 0 : -1
  }

  /**
   * A summary or group value as its cell shows it. A count is a number of rows, not an amount: a currency or date
   * column must not format it as one. A tally lists each value with its count, as a status where the column has them.
   */
  protected formatAggregate(column: TableColumnConfig, value: unknown, explicit: boolean): unknown {
    if (value instanceof Map) {
      const order = (column.options ?? []).map((option) => String(typeof option === 'object' ? option.value : option))
      const rank = (entry: unknown) => order.indexOf(String(entry)) + 1 || order.length + 1
      const entries = [...value].sort(([a], [b]) => rank(a) - rank(b))
      return html`<span class="tally"
        >${entries.map(
          ([entry, count]) =>
            html`<span class="tally-entry"
              >${column.format === 'status' ? this.#renderStatus(column, entry) : this.formatValue(column, entry)}
              <span class="tally-count">${count}</span></span
            >`,
        )}</span
      >`
    }
    if (column.summary === 'count' && !explicit) return this.formatValue({ field: column.field, format: 'number', locale: column.locale }, value)
    return this.formatValue(column, value)
  }

  /** A value of a `status` column: its mark, painted from its `options` entry, and its label. */
  #renderStatus(column: TableColumnConfig, value: unknown) {
    if (value === null || value === undefined || value === '') return ''
    const option = optionOf(column, value)
    const legend = typeof option === 'object' ? option : undefined
    const label = this.formatValue(column, value)
    return html`<span
      class="status"
      part="status status-${String(value).replace(/[^\w-]/g, '-')}"
      title=${this.msg.t('statusTitle', column.header ?? column.field, label)}
      style=${styleMap(legend?.color ? { '--_status-color': legend.color } : {})}
      ><span class=${legend?.glyph ? 'status-mark status-mark--glyph' : 'status-mark'} part="status-mark" aria-hidden="true">${legend?.glyph ?? nothing}</span
      ><span class="status-label" part="status-label">${label}</span></span
    >`
  }

  /**
   * The value of a cell: its field, or what a computed column makes of the row. `row` is the row as given, which
   * `running` totals are keyed by.
   */
  protected cellValue(row: TableRow, column: TableColumnConfig): unknown {
    if (column.running) return this.#runningTotals(column).get(row)
    if (column.countValue !== undefined) {
      const wanted = String(column.countValue)
      let count = 0
      for (const other of this.#statusColumns()) if (String(getFieldValue(row, other.field)) === wanted) count++
      return count
    }
    return this.readCell(row, column)
  }

  /**
   * Every `status` column, hidden ones included: hiding a column changes what the table shows, not what a row's
   * `count-value` counts. Kept until the column definitions change.
   */
  #statusColumns(): TableColumnConfig[] {
    const source = this.columnElements.length ? this.columnElements : (this.columns ?? [])
    if (this.#statusCache?.source !== source) this.#statusCache = { source, columns: source.filter((column) => column.format === 'status') }
    return this.#statusCache.columns
  }

  /**
   * A `running` column's total after each row, accumulated once over the rows in their sorted order whenever they or
   * the column change. Not computed for a `dataSource`, which only holds the rows it has fetched.
   */
  #runningTotals(column: TableColumnConfig): Map<TableRow, number> {
    const inputs = [this.sortedRows, column.running, column.opening, this.dataSource]
    const cached = this.#runningCache.get(column)
    if (cached && cached.inputs.every((input, index) => input === inputs[index])) return cached.totals
    const terms = (column.running ?? '')
      .split(',')
      .map((term) => term.trim())
      .filter(Boolean)
      .map((term) => (term.startsWith('-') ? { field: term.slice(1).trim(), sign: -1 } : { field: term.replace(/^\+/, '').trim(), sign: 1 }))
    const totals = new Map<TableRow, number>()
    let total = Number(column.opening) || 0
    const rows = this.dataSource ? [] : this.sortedRows
    for (let index = 0; index < rows.length; index++) {
      // In a tree only the leaves move the total: a parent's figures are its children's, and would count twice.
      if (!this.inSummary(index)) continue
      const row = rows[index]
      let moved = false
      for (const { field, sign } of terms) {
        const number = toNumber(getFieldValue(row, field))
        if (!Number.isFinite(number)) continue
        total += sign * number
        moved = true
      }
      if (moved) totals.set(row, total)
    }
    this.#runningCache.set(column, { inputs, totals })
    return totals
  }

  protected formatValue(column: TableColumnConfig, value: unknown): string {
    if (value === null || value === undefined || value === '') return ''
    // A `select` or `status` column shows the label of its option.
    const option = optionOf(column, value)
    if (option !== undefined) return typeof option === 'object' ? (option.label ?? String(option.value)) : String(option)
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

  /** `index` is the row's position in the whole dataset, on every page. */
  #rowAt(index: number): TableRow | undefined {
    if (index < 0) return undefined
    if (this.dataSource) {
      const size = this.#effectiveBlockSize
      return this.#blocks.get(Math.floor(index / size))?.[index % size]
    }
    const row = (this.#animation?.transitionRows ?? this.sortedRows)[index]
    return row && this.#animation ? this.#animation.rowAt(index, row) : row
  }

  /** The row at `index` as the application gave it: `#rowAt` without the interpolation of an animated update. */
  #sourceRowAt(index: number): TableRow | undefined {
    if (index < 0) return undefined
    if (this.dataSource) return this.#rowAt(index)
    return (this.#animation?.transitionRows ?? this.sortedRows)[index]
  }

  protected keyAt(index: number, row: TableRow): string {
    return this.identityOf(row) ?? String(index)
  }

  /** The key a row carries itself, from `getRowKey` or `row-key`; `undefined` when it has none and only its position identifies it. */
  protected identityOf(row: TableRow): string | undefined {
    const value = this.getRowKey ? this.getRowKey(row) : this.rowKey ? getFieldValue(row, this.rowKey) : undefined
    return value === null || value === undefined || value === '' ? undefined : String(value)
  }

  get #hasRowIdentity(): boolean {
    return Boolean(this.getRowKey || this.rowKey)
  }

  /** A selectable table without a key selects positions, which re-point at other rows after a sort. Say so, once. */
  #warnPositionalKeys() {
    if (this.#warnedPositionalKeys || this.#hasRowIdentity || (this.selection === 'none' && !this.#detail) || this.rowCount === 0) return
    this.#warnedPositionalKeys = true
    if (this.selection === 'none') {
      console.warn(
        "[c2-table] detail-height without row-key: a row's key is its position, so an open panel moves to another row when the rows are sorted or replaced. Set row-key (or getRowKey) to the field that identifies a row.",
      )
      return
    }
    console.warn(
      `[c2-table] selection="${this.selection}" without row-key: a row's key is its position, so the selection moves to other rows when they are sorted or replaced. Set row-key (or getRowKey) to the field that identifies a row.`,
    )
  }

  protected applySort() {
    this.sortedRows = this.buildRows(this.filterRows(this.sourceRows()))
  }

  /** Scrolls display line `line` into view, below the header and, while grouped, below the groups stuck under it. */
  protected scrollToLine(line: number) {
    // Wrapped rows have their own heights, so the uniform-height arithmetic below would aim at the wrong place; every
    // row is rendered then, so scroll to the row itself.
    if (this.wrap) {
      const viewport = this.viewport
      const element = this.renderRoot.querySelector<HTMLElement>(
        `.row--body[aria-rowindex="${line + 2}"], .row--group:not(.row--group-echo)[aria-rowindex="${line + 2}"]`,
      )
      if (!viewport || !element) return
      const header = this.headerHeight()
      const top = element.getBoundingClientRect().top - viewport.getBoundingClientRect().top
      const bottom = top + element.getBoundingClientRect().height
      if (top < header) viewport.scrollTop += top - header
      else if (bottom > viewport.clientHeight - this.footerHeight()) viewport.scrollTop += bottom - viewport.clientHeight + this.footerHeight()
      return
    }
    if (this.scrollToStructuredLine(line)) return
    const viewport = this.viewport
    const height = this.rowHeightPx
    const open = this.#detailLines()
    const range = this.#virtualizer.range
    // Past the browser's height limit the virtualizer scales the scroll: its own arithmetic is the closer one there.
    const scaled = range.paddingTop + (range.end - range.start) * height + range.paddingBottom < this.rowCount * height - 1
    if (open.length === 0 || !viewport || scaled) {
      // The summary row is sticky at the bottom as the header is at the top: a row under either is out of sight.
      this.#virtualizer.scrollToIndex(line - this.pageStart, this.headerHeight() + this.footerHeight())
      return
    }
    // The panels open above the row push it down by their height.
    const index = line - this.pageStart
    const rowTop = index * height + open.filter((entry) => entry < index).length * this.detailHeight
    const room = viewport.clientHeight - this.headerHeight() - this.footerHeight()
    if (rowTop < viewport.scrollTop) viewport.scrollTop = rowTop
    else if (rowTop + height > viewport.scrollTop + room) viewport.scrollTop = rowTop + height - room
  }

  /** Sorts rows, or tree nodes, by `sortModel`; `read` reads an item's value in a column (a tree node's rollup). */
  protected sortBySortModel<T>(items: T[], read?: (item: T, field: string, column?: TableColumnConfig) => unknown): T[] {
    if (this.dataSource || this.sortModel.length === 0) return items
    const columns = this.resolvedColumns
    const value = (item: T, field: string, column?: TableColumnConfig) =>
      read ? read(item, field, column) : this.readCell(item as TableRow, column ?? { field })
    // Each sort key's column and comparator, looked up once rather than once per comparison.
    const keys = this.sortModel.map((entry) => {
      const column = columns.find((candidate) => candidate.field === entry.field)
      return { field: entry.field, column, comparator: column?.comparator ?? defaultCompare, sign: entry.direction === 'desc' ? -1 : 1 }
    })
    return [...items].sort((left, right) => {
      for (const { field, column, comparator, sign } of keys) {
        const result = comparator(value(left, field, column), value(right, field, column))
        if (result !== 0) return sign * result
      }
      return 0
    })
  }

  #resetRemote() {
    this.#requestToken++
    this.#blocks.clear()
    this.#blocksVersion++
    this.#pendingBlocks.clear()
    this.remoteTotal = -1
  }

  #ensureBlocks() {
    if (!this.dataSource || this.error) return
    // Paged: the block is the page, so exactly one request is ever in flight for the rows on screen. This comes
    // before the bootstrap below so `<c2-table page="3">` loads page 3 outright instead of page 1 and then page 3.
    if (this.paginated) {
      void this.#fetchBlock(this.page - 1)
      return
    }
    if (this.remoteTotal < 0) {
      void this.#fetchBlock(0)
      return
    }
    const { start, end } = this.#window()
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
      const size = this.#effectiveBlockSize
      const result = await dataSource.getRows({ start: block * size, count: size, sort: this.sortModel, filters: this.filters ?? {} })
      if (token !== this.#requestToken) return
      this.#blocks.set(block, result.rows ?? [])
      this.#blocksVersion++
      if (typeof result.total === 'number') this.remoteTotal = result.total
      else if (this.remoteTotal < 0) this.remoteTotal = block * size + (result.rows?.length ?? 0)
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

  /**
   * Moves focus to the cell holding the roving tabindex — where Tab would land — so an app can hand focus back to the
   * table, e.g. after a bulk action hides the control that had it. Before the first render it focuses that cell once
   * it exists.
   */
  override focus(options?: FocusOptions) {
    const cell = this.renderRoot?.querySelector<HTMLElement>('.cell[tabindex="0"]')
    if (cell) {
      cell.focus(options)
      return
    }
    // Only a table that has not rendered yet waits: once rendered, a later update must not steal focus back.
    if (this.hasUpdated) return
    this.pendingFocus = true
    this.#pendingFocusOptions = options
  }

  override connectedCallback() {
    super.connectedCallback()
    // Groups and trees are variants of their own: say so to an app asking another element for them, once each.
    for (const [attribute, property, variant] of VARIANT_ATTRIBUTES) {
      if (warnedVariants.has(attribute) || property in this || !this.hasAttribute(attribute)) continue
      warnedVariants.add(attribute)
      console.warn(`[${this.localName}] ${attribute} is c2-${variant}'s: use <c2-${variant}>, from '@c2n/components/table/${variant}'.`)
    }
    this.addEventListener(COLUMN_CHANGE_EVENT, this.#handleColumnChange)
    this.addEventListener(PAGER_CONNECT_EVENT, this.#handlePagerConnect)
    // The table speaks for its pager: swallow the pager's own events so a consumer sees one `page-change`, from here.
    this.addEventListener('page-change', this.#handlePagerEvent)
    this.addEventListener('page-size-change', this.#handlePagerEvent)
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    this.#animation?.cancel()
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

  /**
   * A pager connected somewhere inside the table. Adopt its page size when the table has none, so the nested form
   * needs no configuration, and keep the event inside the table.
   */
  #handlePagerConnect = (event: Event) => {
    event.stopPropagation()
    if (event.target) this.#pagers.add(event.target)
    // Adopt the size unconditionally: `dataSource` is usually assigned by script after the markup has parsed, so the
    // pager connects first. `paginated` gates on the data source separately, once it arrives.
    if (this.pageSize === 0) {
      const pageSize = Math.floor((event as CustomEvent<PagerConnectEventDetail>).detail?.pageSize ?? 0)
      if (Number.isFinite(pageSize) && pageSize > 0) this.pageSize = pageSize
    }
  }

  /**
   * A pager the table drives re-emits what it just asked for, so the table swallows it and answers with its own
   * event — one `page-change` leaves the table, not two. Three things must still get through: the table's own event
   * (it fires this listener at-target), a `c2-pagination` used inside a cell renderer, and any pager on a table that
   * is not paging, which the author is wiring up by hand.
   */
  #handlePagerEvent = (event: Event) => {
    if (!this.paginated || event.target === this) return
    if (event.target && this.#pagers.has(event.target)) event.stopImmediatePropagation()
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

  #toggleSort(column: TableColumnConfig, additive: boolean) {
    if (column.field === SELECTION_FIELD || !column.field) return
    if (!(column.sortable ?? this.sortable)) return
    const existing = this.sortModel.find((entry) => entry.field === column.field)
    const direction: SortDirection | undefined = !existing ? 'asc' : existing.direction === 'asc' ? 'desc' : undefined
    const rest = additive && this.multiSort ? this.sortModel.filter((entry) => entry.field !== column.field) : []
    this.sortModel = direction ? [...rest, { field: column.field, direction }] : rest
    this.dispatchEvent(new CustomEvent<TableSortChangeEventDetail>('sort-change', { detail: { sort: this.sortModel }, bubbles: true, composed: true }))
  }

  /**
   * The grid's accessible name: the host's `aria-labelledby` (the text of the elements it names, looked up in the
   * host's own tree) first, as ARIA ranks it, then the host's `aria-label`.
   */
  private get gridLabel(): string {
    const ids = (this.hostAriaLabelledBy ?? '').split(/\s+/).filter(Boolean)
    if (ids.length) {
      const root = this.getRootNode() as Document | ShadowRoot
      const text = ids
        .map((id) => root.getElementById?.(id)?.textContent?.replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .join(' ')
      if (text) return text
    }
    return this.hostAriaLabel?.trim() ?? ''
  }

  #handleRowClick(event: MouseEvent, line: number) {
    const index = this.rowIndexAt(line)
    const row = this.#rowAt(index)
    if (!row) return
    const key = this.keyAt(index, row)
    this.dispatchEvent(new CustomEvent<TableRowEventDetail>('row-click', { detail: { row, rowIndex: index, key }, bubbles: true, composed: true }))
    if (!this.#isFromCellControl(event)) this.#activateRow(index, row, key)
    if (this.selection === 'none') return
    this.#applySelection(line, { toggle: event.metaKey || event.ctrlKey, range: event.shiftKey })
  }

  /** Fires `row-activate`. Not bubbling, like `selection-change`: a table nested in a cell must not open the outer row. */
  #activateRow(rowIndex: number, row: TableRow, key: string) {
    this.dispatchEvent(new CustomEvent<TableRowEventDetail>('row-activate', { detail: { row, rowIndex, key }, bubbles: false, composed: false }))
  }

  #handleCellClick(line: number, columnIndex: number, column: TableColumnConfig, value: unknown) {
    const rowIndex = this.rowIndexAt(line)
    const row = this.#rowAt(rowIndex)
    if (!row) return
    this.focusedCell = { row: line, column: columnIndex }
    this.dispatchEvent(
      new CustomEvent<TableCellEventDetail>('cell-click', {
        detail: { row, rowIndex, key: this.keyAt(rowIndex, row), column, value },
        bubbles: true,
        composed: true,
      }),
    )
  }

  /** An enclosing `c2-context-menu` asks what was right-clicked: the cell, with the same detail as `cell-click`. */
  #handleContextMenuRequest(event: Event, line: number, columnIndex: number, column: TableColumnConfig, value: unknown) {
    const rowIndex = this.rowIndexAt(line)
    const row = this.#rowAt(rowIndex)
    if (!row) return
    this.focusedCell = { row: line, column: columnIndex }
    provideContextMenuData(event, this, { row, rowIndex, key: this.keyAt(rowIndex, row), column, value } satisfies TableCellEventDetail)
  }

  #handleCheckboxToggle(index: number) {
    this.#applySelection(index, { toggle: true, range: false })
  }

  #handleSelectAll = (event: Event) => {
    event.stopPropagation()
    if ((event.target as Checkbox).checked) this.selectAll()
    else this.clearSelection()
  }

  /** `line` is a display line; a range covers the data rows on the lines between the anchor and it. */
  #applySelection(line: number, modifiers: { toggle: boolean; range: boolean }) {
    const index = this.rowIndexAt(line)
    const row = this.#rowAt(index)
    if (!row) return
    const key = this.keyAt(index, row)

    // Clicking the row that is the selection again clears it — with a modifier or without — so a selection can be
    // undone by the same gesture that made it.
    if (this.selection === 'single') {
      this.#selectionAnchor = line
      this.commitSelection(this.value.includes(key) ? [] : [key])
      return
    }

    // A hierarchy may select a row with the rows under it (see `cascade` and `selectRange`).
    if (modifiers.range && this.#selectionAnchor >= 0) {
      const from = Math.min(this.#selectionAnchor, line)
      const to = Math.max(this.#selectionAnchor, line)
      const keys = new Set(modifiers.toggle ? this.value : [])
      const range: string[] = []
      for (let cursor = from; cursor <= to; cursor++) {
        const cursorIndex = this.rowIndexAt(cursor)
        const rangeRow = this.#rowAt(cursorIndex)
        if (rangeRow) range.push(this.keyAt(cursorIndex, rangeRow))
      }
      this.selectRange(keys, range)
      this.commitSelection([...keys])
      return
    }

    this.#selectionAnchor = line
    const on = !this.value.includes(key)
    if (modifiers.toggle) {
      const keys = new Set(this.value)
      this.cascade(keys, key, on)
      this.commitSelection([...keys])
      return
    }
    // A plain click narrows the selection to one row (in a tree, with the rows under it); on the row that already is
    // the whole selection, it clears it.
    const next = new Set<string>()
    this.cascade(next, key, true)
    this.commitSelection(next.size === this.value.length && this.value.every((entry) => next.has(entry)) ? [] : [...next])
  }

  protected commitSelection(keys: string[]) {
    this.value = keys
    this.dispatchEvent(
      new CustomEvent<TableSelectionChangeEventDetail>('selection-change', {
        detail: { value: keys, rows: this.getSelectedRows() },
        bubbles: false,
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
    const minWidth = column.minWidth ?? DEFAULT_MIN_WIDTH
    let width = Math.round(startWidth)

    const move = (moveEvent: PointerEvent) => {
      width = Math.max(minWidth, Math.round(startWidth + moveEvent.clientX - startX))
      this.widthOverrides = { ...this.widthOverrides, [columnKey(column)]: width }
    }
    const finish = (upEvent: PointerEvent) => {
      handle.releasePointerCapture(upEvent.pointerId)
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('pointerup', finish)
      handle.removeEventListener('pointercancel', finish)
      handle.classList.remove('resizer--active')
      this.dispatchEvent(
        new CustomEvent<TableColumnResizeEventDetail>('column-resize', {
          detail: { id: columnKey(column), field: column.field, width },
          bubbles: true,
          composed: true,
        }),
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
    // Keys pressed in a detail panel belong to its content (a child table, a form), not to this grid.
    if (event.composedPath().some((node) => node instanceof Element && node.classList.contains('row--detail'))) return
    if (this.#isFromCellControl(event)) return
    let { row, column } = this.focusedCell
    // Keyboard movement stays inside the page: rows are numbered across the whole dataset, so page 2 starts at
    // `first`, not at 0.
    const first = this.pageStart
    const last = first + this.rowCount - 1
    // Rows per viewport, for PageUp/PageDown — unrelated to the `pageSize` property, which is rows per data page.
    const viewportRows = Math.max(1, Math.floor((this.viewport?.clientHeight ?? 0) / this.rowHeightPx) - 1)
    const summary = this.#hasSummary(columns)
    // A spanning summary cell covers several column indices; on that row, left/right move from cell to cell.
    const summaryCells = summary ? this.#summaryCells(columns) : []
    const summaryCellAt = (index: number) => [...summaryCells].reverse().find((cell) => cell.index <= index) ?? summaryCells[0]
    // A hierarchy's own keys come first: the treegrid's ←/→ on a group or a tree row, Enter on a group.
    if (this.handleLineKey(event, columns)) return
    // Alt+↓ on a header opens the column's filter, as on a select.
    if (row === HEADER_ROW && event.altKey && event.key === 'ArrowDown' && this.#isFilterable(columns[column])) {
      event.preventDefault()
      const button = this.renderRoot.querySelector<HTMLElement>(`.cell--header[data-column-id="${CSS.escape(columnKey(columns[column]))}"] .filter-button`)
      if (button) this.#openFilter(columns[column], button)
      return
    }

    // Alt+↓ opens the row's detail panel and Alt+↑ closes it, from any of its cells.
    if (event.altKey && row >= 0 && (event.key === 'ArrowDown' || event.key === 'ArrowUp') && this.#detail) {
      event.preventDefault()
      const index = this.rowIndexAt(row)
      const data = this.#sourceRowAt(index)
      if (data) this.#toggleDetail(this.keyAt(index, data), data, event.key === 'ArrowDown')
      return
    }

    // An editable cell opens its editor on Enter or F2, takes a typed character as its new value, and Delete clears it.
    if (this.editable && row >= 0 && !event.ctrlKey && !event.metaKey && !event.altKey && this.#canEdit(row, column)) {
      const checkbox = columns[column].editor === 'checkbox' && !columns[column].renderEditor
      const trigger: EditTrigger | undefined =
        // modern-web-ignore: ime-enter the grid cell is not a text field; a composing key comes from an input and is dropped by #isFromCellControl above
        event.key === 'Enter' || event.key === 'F2' || (checkbox && event.key === ' ')
          ? 'edit'
          : event.key === 'Delete' || event.key === 'Backspace'
            ? 'clear'
            : event.key.length === 1 && event.key !== ' ' && !checkbox
              ? { text: event.key }
              : undefined
      if (trigger) {
        event.preventDefault()
        this.#beginEdit(row, column, trigger)
        return
      }
    }

    switch (event.key) {
      case 'ArrowDown':
        if (row === SUMMARY_ROW) break
        row = summary && row >= last ? SUMMARY_ROW : Math.min(last, row + 1)
        break
      case 'ArrowUp':
        if (row === SUMMARY_ROW) row = last
        else row = row <= first ? HEADER_ROW : row - 1
        break
      case 'ArrowRight':
        if (row === SUMMARY_ROW) column = summaryCells.find((cell) => cell.index > column)?.index ?? summaryCellAt(column).index
        else column = Math.min(columns.length - 1, column + 1)
        break
      case 'ArrowLeft':
        if (row === SUMMARY_ROW) column = summaryCells[summaryCells.indexOf(summaryCellAt(column)) - 1]?.index ?? 0
        else column = Math.max(0, column - 1)
        break
      case 'Home':
        if (event.ctrlKey || event.metaKey) row = HEADER_ROW
        column = 0
        break
      case 'End':
        if (event.ctrlKey || event.metaKey) row = summary ? SUMMARY_ROW : last
        column = row === SUMMARY_ROW ? summaryCellAt(columns.length - 1).index : columns.length - 1
        break
      case 'PageDown':
        if (row !== SUMMARY_ROW) row = Math.min(last, Math.max(first, row) + viewportRows)
        break
      case 'PageUp':
        row = Math.max(first, (row === SUMMARY_ROW ? last + 1 : row) - viewportRows)
        break
      // modern-web-ignore: ime-enter the table renders no text field; keys from controls inside a cell (renderCell inputs) are dropped by #isFromCellControl before this grid handler
      case 'Enter':
      case ' ': {
        event.preventDefault()
        if (row === SUMMARY_ROW) return
        if (row === HEADER_ROW) {
          this.#toggleSort(columns[column], event.shiftKey)
          return
        }
        // modern-web-ignore: ime-enter the table renders no text field; keys from controls inside a cell (renderCell inputs) are dropped by #isFromCellControl before this grid handler
        if (event.key === 'Enter') {
          const index = this.rowIndexAt(row)
          const data = this.#rowAt(index)
          if (data) this.#activateRow(index, data, this.keyAt(index, data))
        }
        if (this.selection !== 'none') this.#applySelection(row, { toggle: event.key === ' ' || event.ctrlKey || event.metaKey, range: event.shiftKey })
        return
      }
      default:
        return
    }

    event.preventDefault()
    this.focusedCell = { row, column }
    this.pendingFocus = true
    if (row >= 0) this.scrollToLine(row)
  }

  /**
   * Whether a key comes from a control inside a cell — a slotted button, a `renderCell` input, the row checkbox —
   * rather than from the cell itself. Enter and Space belong to that control (cancelling them here used to stop a
   * slotted button from ever activating from the keyboard), and so does every key while it edits text.
   */
  #isFromCellControl(event: KeyboardEvent | MouseEvent): boolean {
    if (event instanceof MouseEvent) {
      // A click belongs to a control when one sits between the target and the cell, in any shadow root on the way.
      for (const node of event.composedPath()) {
        if (!(node instanceof Element)) continue
        if (node.matches('.cell, .row')) return false
        if (
          node.matches(
            'a[href], button, input, select, textarea, label, summary, [contenteditable=""], [contenteditable="true"], [role="button"], [role="link"]',
          )
        )
          return true
      }
      return false
    }
    const origin = event.composedPath()[0]
    if (!(origin instanceof Element) || origin.matches('.cell')) return false
    // modern-web-ignore: ime-enter not a handler: classifies the key so Enter in a cell's own control (an IME included) is left to that control
    if (event.key === 'Enter' || event.key === ' ') return true
    return origin.matches(
      'input:not([type="checkbox"], [type="radio"], [type="button"], [type="submit"], [type="reset"]), textarea, select, [contenteditable=""], [contenteditable="true"]',
    )
  }

  protected headerHeight(): number {
    return this.renderRoot.querySelector('.row--header')?.getBoundingClientRect().height ?? 0
  }

  /** Height of the summary row, which stays at the bottom of the viewport and covers the rows under it. */
  protected footerHeight(): number {
    return this.renderRoot.querySelector('.row--summary')?.getBoundingClientRect().height ?? 0
  }

  #measureRowHeight() {
    // A group row has the height of a data row, so a table with every group closed still measures one.
    const first = this.renderRoot.querySelector('.row--body, .row--group:not(.row--group-echo)')
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
    const cells = this.renderRoot.querySelectorAll<HTMLElement>('.cell--header[data-column-id]')
    let pinnedChanged = false
    for (const cell of cells) {
      const key = cell.dataset.columnId
      if (!key) continue
      const width = Math.round(cell.getBoundingClientRect().width)
      if (width > 0 && this.#measuredWidths.get(key) !== width) {
        this.#measuredWidths.set(key, width)
        if (cell.classList.contains('cell--pinned')) pinnedChanged = true
      }
    }
    if (pinnedChanged) this.requestUpdate()
  }

  /** Keeps the roving tabindex on a rendered cell: follows the window when focused, falls back to the header otherwise. */
  #syncFocusToWindow() {
    const { row, column } = this.focusedCell
    if (row < 0) return
    const offset = this.pageStart
    const range = this.#window()
    const start = offset + range.start
    const end = offset + range.end
    if (row >= start && row < end) return
    const shadowRoot = this.renderRoot as ShadowRoot
    if (shadowRoot.activeElement) {
      this.focusedCell = { row: Math.min(Math.max(row, start), Math.max(start, end - 1)), column }
      this.pendingFocus = true
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
