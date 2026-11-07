import { LitElement, html, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { query, state } from 'lit/decorators.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { classMap } from 'lit/directives/class-map.js'
import { ifDefined } from 'lit/directives/if-defined.js'
import { repeat } from 'lit/directives/repeat.js'
import { styleMap } from 'lit/directives/style-map.js'
import styles from './table.scss?inline'
import { property, arrayPropertyConverter, jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import { VirtualScrollController } from '@c2n/core/controllers/virtual-scroll.js'
import { SlotPresenceController } from '@c2n/core/dom-helper.js'
import { defaultCompare } from '@c2n/core/data-helper.js'
import { provideContextMenuData } from '@c2n/core/context-menu-helper.js'
import { provide } from '@lit/context'
import { PAGER_CONNECT_EVENT, pagerContext, type PagerConnectEventDetail, type PagerContext } from '@c2n/core/contexts/pager.js'
import { LocalizeController } from '@c2n/core/localize.js'
import { COLUMN_CHANGE_EVENT, TableColumn } from './table-column.js'
import { tableMessages } from './messages.js'
import {
  buildGroupTree,
  buildRemoteGroupTree,
  depthOf,
  expansionResolver,
  flattenGroups,
  groupAtLevel,
  toggleExpansion,
  type GroupNode,
  type GroupTree,
  type Grouping,
  type RemoteGroup,
} from './grouping.js'
import { aggregate, csvField, filterTerms, matchesTerms, plainText, withFieldValue } from './table-data.js'
import {
  getFieldValue,
  groupByConverter,
  sortModelConverter,
  type ColumnPin,
  type SortDirection,
  type SortModel,
  type TableCellEditEventDetail,
  type TableCellEventDetail,
  type TableColumnConfig,
  type TableColumnReorderEventDetail,
  type TableCsvOptions,
  type TableColumnResizeEventDetail,
  type TableDataSource,
  type TableGroupBy,
  type TableGroupContext,
  type TableGroupPathEntry,
  type TableGroupDisplay,
  type TableGroupRenderer,
  type TableGroupToggleEventDetail,
  type TableRangeChangeEventDetail,
  type TableRenderedRow,
  type TableRow,
  type TableRowContext,
  type TableRowDetailRenderer,
  type TableRowDetailToggleEventDetail,
  type TableRowEventDetail,
  type TableRowPartResolver,
  type TableRowStyler,
  type TableSelectionChangeEventDetail,
  type TableSortChangeEventDetail,
  type TableSummaryAggregate,
  type TableSummaryFunction,
} from './table-types.js'

import '@c2n/checkbox'
import '@c2n/spinner'
import type { Checkbox } from '@c2n/checkbox'

// Framework-free: `useRenderedRows` in `@c2n/components/react` and `@c2n/components/vue` is built on it, and any other framework
// (Svelte, Solid, Angular, plain DOM) subscribes with it directly. It imports nothing at runtime.
export { subscribeRenderedRows, type RenderedRowsListener } from './rendered-rows.js'

export type TableSelectionMode = 'none' | 'single' | 'multiple'
export type TableVirtualMode = 'auto' | 'always' | 'never'

/** Field of the synthetic checkbox column, so it can live in the same render pipeline as the real columns. */
const SELECTION_FIELD = '__c2-selection'
/** Field of the synthetic column holding the chevron that shows a row's detail, while `renderDetail` is set. */
const DETAIL_FIELD = '__c2-detail'
/** Floor of a flexible track and of a column being resized, unless the column sets `minWidth`. */
const DEFAULT_MIN_WIDTH = 64
/** A plain flexible track such as `1fr` or `2.5fr`. */
const FLEX_TRACK = /^\s*\d*\.?\d+fr\s*$/

interface PinPlacement {
  side: ColumnPin
  offset: number
  edge: boolean
}

type RowUpdateState = 'added' | 'removed' | 'increased' | 'decreased' | 'modified'

const HEADER_ROW = -1
/** Row index of the summary row in `focusedCell`; body rows are numbered from 0 and the header is `HEADER_ROW`. */
const SUMMARY_ROW = -2

export type TableSummaryScope = 'all' | 'page'

interface SummaryCell {
  column: TableColumnConfig
  index: number
  span: number
}

/** Keys of groups (expanded or collapsed): a `;`-separated list in the attribute, since a key holds `/` and `=`. */
const groupKeysConverter = {
  ...arrayPropertyConverter,
  fromAttribute: (value: string | null) => (value === null ? undefined : arrayPropertyConverter.fromAttribute(value)),
  toAttribute: (value: string[] | undefined) => (Array.isArray(value) ? arrayPropertyConverter.toAttribute(value) : null),
}

const CHEVRON = html`<svg
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  <path d="M6 9l6 6 6-6" />
</svg>`

/** A column's identity: its `id` (the `column-id` attribute on an element, never the HTML `id`), otherwise its field. */
function columnKey(column: TableColumnConfig): string {
  return (column instanceof TableColumn ? column.columnId : column.id) || column.field
}

/** The checkbox and detail columns the table adds itself, which have no data and no header. */
function isSynthetic(column: TableColumnConfig): boolean {
  return column.field === SELECTION_FIELD || column.field === DETAIL_FIELD
}

/** A cell's text on one line, for a tab-separated clipboard row. */
function tsvField(text: string): string {
  return text.replace(/[\t\r\n]+/g, ' ')
}

/**
 * `value` holds row keys, and a row key is always a string. `arrayPropertyConverter` only splits strings, so an array
 * of numeric ids assigned from script (`table.value = [1, 2]`) used to be stored as numbers and match no row.
 */
const rowKeysConverter = {
  ...arrayPropertyConverter,
  fromProperty: (value: unknown) => {
    const parsed = arrayPropertyConverter.fromProperty(value)
    return Array.isArray(parsed) ? parsed.filter((key) => key !== null && key !== undefined).map(String) : parsed
  },
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

/** Builds the `Intl` formatter of a column once; a formatter that cannot be built shows the raw value. */
function createFormatter(column: TableColumnConfig, format: string): (value: unknown) => string {
  const locale = column.locale
  const extra = column.formatOptions
  try {
    switch (format) {
      case 'number': {
        const formatter = new Intl.NumberFormat(locale, numberFormatOptions({}, extra))
        return (value) => formatter.format(Number(value))
      }
      case 'percent': {
        const formatter = new Intl.NumberFormat(locale, numberFormatOptions({ style: 'percent' }, extra))
        return (value) => formatter.format(Number(value))
      }
      case 'currency': {
        const formatter = new Intl.NumberFormat(locale, numberFormatOptions({ style: 'currency', currency: column.currency ?? 'USD' }, extra))
        return (value) => formatter.format(Number(value))
      }
      case 'date':
      case 'datetime':
      case 'time': {
        const base: Intl.DateTimeFormatOptions =
          format === 'date' ? { dateStyle: 'medium' } : format === 'datetime' ? { dateStyle: 'medium', timeStyle: 'short' } : { timeStyle: 'short' }
        const formatter = new Intl.DateTimeFormat(locale, dateFormatOptions(base, extra))
        return (value) => formatter.format(new Date(value as string))
      }
      default:
        return (value) => String(value)
    }
  } catch {
    return (value) => String(value)
  }
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

type EditorType = 'text' | 'number' | 'date' | 'datetime-local' | 'time'

/** The built-in editor's input type for a column's format. */
function editorType(format: TableColumnConfig['format']): EditorType {
  switch (format) {
    case 'number':
    case 'percent':
    case 'currency':
      return 'number'
    case 'date':
      return 'date'
    case 'datetime':
      return 'datetime-local'
    case 'time':
      return 'time'
    default:
      return 'text'
  }
}

/** The text the editor starts with: the raw value, cut to what a date or time input accepts. */
function editorDraft(value: unknown, type: EditorType): string {
  if (value === null || value === undefined) return ''
  if (type === 'date' || type === 'datetime-local') {
    const date = value instanceof Date ? value : new Date(String(value))
    if (Number.isNaN(date.getTime())) return ''
    // The input wants local time: shift the ISO string (always UTC) by the zone offset.
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString()
    return type === 'date' ? (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : local.slice(0, 10)) : local.slice(0, 16)
  }
  return value instanceof Date ? value.toISOString() : String(value)
}

/** The value of the built-in editor: a number (or `null` when emptied) for numeric columns, its text otherwise. */
function parseEditorValue(input: HTMLInputElement): unknown {
  if (input.type !== 'number') return input.value
  if (input.value.trim() === '') return null
  const number = Number(input.value)
  return Number.isFinite(number) ? number : input.value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

/**
 * Builds the transient value shown during a row update. Target shape and non-numeric values win immediately; finite
 * numbers are the only values with a meaningful generic interpolation, including numbers nested in arrays/objects.
 */
function interpolateValue(from: unknown, to: unknown, progress: number): unknown {
  if (typeof from === 'number' && typeof to === 'number' && Number.isFinite(from) && Number.isFinite(to)) return from + (to - from) * progress
  if (Array.isArray(from) && Array.isArray(to)) return to.map((value, index) => interpolateValue(from[index], value, progress))
  if (isRecord(from) && isRecord(to)) return Object.fromEntries(Object.entries(to).map(([key, value]) => [key, interpolateValue(from[key], value, progress)]))
  return to
}

function hasNumericChange(from: unknown, to: unknown): boolean {
  if (typeof from === 'number' && typeof to === 'number') return Number.isFinite(from) && Number.isFinite(to) && from !== to
  if (Array.isArray(from) && Array.isArray(to)) return to.some((value, index) => hasNumericChange(from[index], value))
  if (isRecord(from) && isRecord(to)) return Object.entries(to).some(([key, value]) => hasNumericChange(from[key], value))
  return false
}

function firstNumericDelta(from: unknown, to: unknown): number | undefined {
  if (typeof from === 'number' && typeof to === 'number' && Number.isFinite(from) && Number.isFinite(to) && from !== to) return to - from
  if (Array.isArray(from) && Array.isArray(to)) {
    for (let index = 0; index < to.length; index++) {
      const delta = firstNumericDelta(from[index], to[index])
      if (delta !== undefined) return delta
    }
  }
  if (isRecord(from) && isRecord(to)) {
    for (const [key, value] of Object.entries(to)) {
      const delta = firstNumericDelta(from[key], value)
      if (delta !== undefined) return delta
    }
  }
  return undefined
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
  'group-toggle': CustomEvent<TableGroupToggleEventDetail>
  'range-change': CustomEvent<TableRangeChangeEventDetail>
  'cell-edit': CustomEvent<TableCellEditEventDetail>
  'row-detail-toggle': CustomEvent<TableRowDetailToggleEventDetail>
  'column-reorder': CustomEvent<TableColumnReorderEventDetail>
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
 * **Styling renderer output.** What `renderCell` (or `renderGroup`) returns is placed in the table's own shadow root,
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
 * `update-highlight-field`. Only rendered rows are interpolated, and reduced-motion preferences are respected.
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
 * **Grouping.** `group-by="region,status"` gathers the rows into collapsible groups, outermost level first; the grid
 * becomes a `treegrid`. With the default `group-display="row"` each group is a row of the grid: its label and row
 * count in the first column (or the one marked `group-column`), and under every column with a `summary` (or a
 * `group-summary`, when group rows need another aggregate) that aggregate over the group's rows, formatted like the
 * column. `group-display="band"` draws one full-width band per group instead. A group is named by its path,
 * `region=EMEA/status=Paid`. Groups are open by default and the ones the user closes are listed in
 * `collapsed-groups`; with `groups-collapsed` they start closed and the opened ones are listed in `expanded-groups`,
 * which, when set, is the whole state. Only exceptions are recorded, so a group that appears later follows the
 * default. `group-toggle` reports a click, and a group's checkbox selects its rows. Groups are ordered by value, or by
 * an aggregate with a level's `sortBy` (`{ field: 'region', sortBy: 'amount', sort: 'desc' }`). The groups of the
 * rows at the top stay under the header while their rows scroll, and a page that starts inside a group repeats its
 * headers; pages count display lines, so a closed group takes one. A `dataSource` groups too when it implements
 * `getGroups`: the table asks for each level's groups as they open and for an open group's rows through `getRows`
 * with `request.group`.
 *
 * ```html
 * <c2-table row-key="id" group-by="region" selection="multiple" checkbox-selection>
 *   <c2-table-column field="customer" header="Customer"></c2-table-column>
 *   <c2-table-column field="region" hidden></c2-table-column>
 *   <c2-table-column field="amount" format="currency" align="end" summary="sum"></c2-table-column>
 * </c2-table>
 * ```
 *
 * **Filtering.** `quick-filter` keeps the rows where every word of the text occurs in a visible cell, as shown or raw,
 * and `filter` (a predicate, property only) keeps those it accepts. Both run before sorting, grouping and the summary,
 * so totals and group counts describe what is shown; the empty state then says "No matching rows". A `dataSource`
 * receives the text as `request.filter`.
 *
 * **Row details.** `renderDetail` (property only) adds a column of chevrons; opening one shows what it returns in a row
 * under that row, across the grid. `expanded-rows` lists the open rows by key and `row-detail-toggle` reports a toggle.
 * Details have their own heights, so the table does not virtualize while one is open.
 *
 * **Editing.** On an `editable` table or column, double-click, Enter, F2 or typing on a cell opens an editor (an input
 * matching the column's `format`, or the column's `renderEditor`); Enter or leaving it commits and Escape cancels. A
 * changed value fires the cancelable `cell-edit`, after which the table replaces the row in `rows` by a copy holding
 * the new value — cancel the event to apply it yourself, such as after the server accepted it.
 *
 * **Columns.** With `reorderable`, headers are dragged to reorder the columns (Ctrl+Shift+←/→, or ⌘⇧ on macOS, from a
 * focused header); `column-order` holds the order and `column-reorder` reports a move. `hidden-columns` (or
 * `setColumnHidden()`) hides columns by id, and `allColumns` lists every column for a column menu.
 *
 * **Export and copy.** `toCSV()` returns the rows as CSV — all, selected or the page, raw or formatted — and
 * `downloadCSV()` saves it. ⌘C / Ctrl+C in the grid copies the selected rows as tab-separated lines, or the focused
 * cell's text when no row is selected.
 *
 * Sorting, opening a group, filtering and moving a column are announced through a live region; the built-in text
 * is English and translatable with `addTranslations({ fr: { table: {…} } })`.
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
 * @slot group:{groupKey} - Label of one group, e.g. `slot="group:region=EMEA"`, in place of its formatted value and row count. The copy of the group kept under the header while its rows scroll shows the built-in label.
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
 * @event {CustomEvent<TableGroupToggleEventDetail>} group-toggle - Fired after the user opens or closes a group, with its `key`, whether it is now `expanded`, and the `group` itself (its rows and aggregates). `expandedGroups` already holds the new state. Does not bubble.
 * @event {CustomEvent<TableCellEditEventDetail>} cell-edit - Fired when the user commits a changed value in a cell editor, before the table writes it: `detail.value` is the new value, `detail.previousValue` the old one, with the row, its key and the column. Cancel it (`preventDefault()`) to keep `rows` unchanged and apply the value yourself.
 * @event {CustomEvent<TableRowDetailToggleEventDetail>} row-detail-toggle - Fired after the user shows or hides a row's detail, with the row, its key and whether it is now `expanded`. `expandedRows` already holds the new state. Does not bubble.
 * @event {CustomEvent<TableColumnReorderEventDetail>} column-reorder - Fired after the user moves a column, by drag or keyboard: `detail.id` is the column moved and `detail.order` every column id in the new order, which `columnOrder` now holds.
 * @event {CustomEvent<TableRangeChangeEventDetail>} range-change - Fired after the rendered body rows change — the window scrolled, or the rows, sort, page or grouping changed. `detail.start`/`detail.end` are the display lines rendered (end exclusive), `detail.rows` one `{ line, key, row }` entry per rendered data row in display order (group rows and rows a `dataSource` has not delivered are left out) and `detail.keys` their keys. Those lines are the only ones whose `cell:{line}:{field}` slots exist. Fires again when the same keys move to other lines. Does not bubble.
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
 * @csspart summary-content - The content wrapper inside a summary cell; also `summary-content-<id>`.
 * @csspart group-row - Every group row. Also `group-row-level-<n>` (0 for the outermost level), `group-band` with `group-display="band"`, and `group-row-echo` on a copy kept under the header.
 * @csspart group-cell - Every cell of a group row. Each also carries `group-cell-<id>`, named after its column.
 * @csspart group-toggle - The chevron of a group row.
 * @csspart group-label - The group's value, or what `renderGroup` returned.
 * @csspart group-count - The number of rows in the group.
 * @csspart detail-toggle-cell - A body cell holding the chevron that shows a row's detail.
 * @csspart detail-header-cell - The empty header cell above the detail chevrons.
 * @csspart detail-toggle - The chevron that shows and hides a row's detail.
 * @csspart detail-row - The row under an expanded row that holds its detail.
 * @csspart detail-cell - The one cell of a detail row, across the grid.
 * @csspart editor - The built-in input of a cell being edited.
 * @csspart cell-editing - A body cell while its editor is open; exposed in addition to `cell`.
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
 * @cssproperty {box-shadow} [--c2-table__pinned-start--box-shadow=1px 0 0 0 #e4e4e7] - Separator on the last column pinned to the start.
 * @cssproperty {box-shadow} [--c2-table__pinned-end--box-shadow=-1px 0 0 0 #e4e4e7] - Separator on the first column pinned to the end.
 *
 * @cssproperty {pixel} [--c2-table__summary--height=36px]
 * @cssproperty {color} [--c2-table__summary--background=#fafafa]
 * @cssproperty {color} [--c2-table__summary--color=#18181b]
 * @cssproperty {font-size} [--c2-table__summary--font-size=14px]
 * @cssproperty {font-weight} [--c2-table__summary--font-weight=600]
 * @cssproperty {box-shadow} [--c2-table__summary--box-shadow=0 -1px 0 0 #e4e4e7] - Separator above the summary row; a shadow rather than a border so it lands on the last row's own border instead of doubling it.
 *
 * @cssproperty {color} [--c2-table__group-row--background=#fafafa]
 * @cssproperty {color} [--c2-table__group-row--color=#18181b]
 * @cssproperty {font-weight} [--c2-table__group-row--font-weight=600]
 * @cssproperty {color} [--c2-table__group-row__hover--background=#f4f4f5]
 * @cssproperty {box-shadow} [--c2-table__group-row__echo--box-shadow=0 1px 0 0 #e4e4e7] - Separator under a group row kept under the header.
 * @cssproperty {color} [--c2-table__group-band--background=#f4f4f5] - Background of a group with `group-display="band"`.
 * @cssproperty {pixel} [--c2-table__group--indent=24px] - Indentation per group level; the default lines rows up with their group's label.
 * @cssproperty {pixel} [--c2-table__group-toggle--size=16px]
 * @cssproperty {color} [--c2-table__group-toggle--color=#71717a]
 * @cssproperty {time} [--c2-table__group-toggle--transition-duration=150ms] - Chevron turn when a group opens or closes; respects reduced motion.
 * @cssproperty {color} [--c2-table__group-count--background=#f4f4f5]
 * @cssproperty {color} [--c2-table__group-count--color=#52525b]
 * @cssproperty {font-size} [--c2-table__group-count--font-size=12px]
 * @cssproperty {font-weight} [--c2-table__group-count--font-weight=600]
 * @cssproperty {padding} [--c2-table__group-count--padding=1px 7px]
 * @cssproperty {border-radius} [--c2-table__group-count--border-radius=999px]
 *
 * @cssproperty {pixel} [--c2-table__selection-cell--width=44px] - Width of the `checkbox-selection` column.
 *
 * @cssproperty {pixel} [--c2-table__detail-toggle-cell--width=40px] - Width of the column of detail chevrons.
 * @cssproperty {pixel} [--c2-table__detail-toggle--size=16px]
 * @cssproperty {color} [--c2-table__detail-toggle--color=#71717a]
 * @cssproperty {time} [--c2-table__detail-toggle--transition-duration=150ms] - Chevron turn when a detail opens or closes; respects reduced motion.
 * @cssproperty {color} [--c2-table__detail-row--background=#fafafa]
 * @cssproperty {padding} [--c2-table__detail-cell--padding=12px 16px]
 *
 * @cssproperty {color} [--c2-table__editor--background=#ffffff]
 * @cssproperty {color} [--c2-table__editor--color=#18181b]
 * @cssproperty {border} [--c2-table__editor--border=1px solid rgb(2, 101, 220)]
 * @cssproperty {border-radius} [--c2-table__editor--border-radius=4px]
 * @cssproperty {padding} [--c2-table__editor--padding=0 8px]
 * @cssproperty {pixel} [--c2-table__editor--height=28px]
 *
 * @cssproperty {color} [--c2-table__drop-indicator--color=rgb(2, 101, 220)] - Line marking where a dragged header lands.
 * @cssproperty {number} [--c2-table__header-cell__dragging--opacity=0.5] - Opacity of the header being dragged.
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

  /** Message shown when there are no rows. Defaults to the translated "No rows" (or "No matching rows" while filtered). */
  @property({ type: String, attribute: 'empty-message' }) emptyMessage = ''

  /**
   * Keeps only the rows this returns true for, before sorting and grouping. Property only; not applied to a
   * `dataSource`, which filters on the server.
   */
  @property({ attribute: false }) filter?: (row: TableRow) => boolean

  /**
   * Text search over the visible columns: a row stays when every word occurs in one of its cells, case-insensitively,
   * as the cell shows it or as its raw value. A column with `filterable="false"` is left out. A `dataSource` receives
   * it as `request.filter` instead.
   */
  @property({ type: String, attribute: 'quick-filter' }) quickFilter = ''

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
   * Groups the rows by these fields, outermost first: `group-by="region,status"` in the attribute, and field names or
   * {@link TableGroupBy} objects in the property. Not applied to a `dataSource`, which only holds the rows it fetched.
   */
  @property({ converter: groupByConverter, attribute: 'group-by' }) groupBy: (string | TableGroupBy)[] = []

  /** `row` gives each group a row of the grid with its column aggregates; `band` draws a full-width band per group. */
  @property({ type: String, attribute: 'group-display' }) groupDisplay: TableGroupDisplay = 'row'

  /**
   * Keys of the open groups (`region=EMEA/status=Paid`). When set, the groups it lists are open and every other one —
   * including a group that appears later — is closed. With `groups-collapsed` the user's toggles are written here.
   * `;`-separated in the attribute.
   */
  @property({ converter: groupKeysConverter, attribute: 'expanded-groups' }) expandedGroups?: string[]

  /**
   * Keys of the groups the user closed while groups are open by default (no `expandedGroups`, no `groups-collapsed`).
   * Only the exceptions are kept, so a group that appears later (new rows, another filter) opens like the others.
   * `;`-separated in the attribute.
   */
  @property({ converter: groupKeysConverter, attribute: 'collapsed-groups' }) collapsedGroups?: string[]

  /** Starts every group closed while `expandedGroups` is unset; opened groups are then recorded in `expandedGroups`. */
  @property({ type: Boolean, attribute: 'groups-collapsed' }) groupsCollapsed = false

  /** Renders a group's label in place of its formatted value. The slot `group:<key>` wins over both. */
  @property({ attribute: false }) renderGroup?: TableGroupRenderer

  /** Label of the group of rows whose value is empty. Defaults to the translated "No value". */
  @property({ type: String, attribute: 'empty-group-label' }) emptyGroupLabel = ''

  /**
   * Renders the detail of a row, shown under it while it is expanded. Setting it adds a leading column of chevrons
   * that show and hide each row's detail. Property only. A detail has its own height, so **while any row is expanded
   * the table stops virtualizing** — page large tables with `page-size`.
   */
  @property({ attribute: false }) renderDetail?: TableRowDetailRenderer

  /** Keys of the rows whose detail is shown: an array in the property, `;`-separated in the attribute. */
  @property({ converter: rowKeysConverter, attribute: 'expanded-rows' }) expandedRows: string[] = []

  /** Makes every column editable; a column's own `editable` still wins. See `cell-edit`. */
  @property({ type: Boolean }) editable = false

  /**
   * Lets the user reorder the columns by dragging their headers, or with Ctrl+Shift+←/→ (⌘⇧ on macOS) on a focused
   * header. A pinned column moves among the columns pinned to the same side. Fires `column-reorder`.
   */
  @property({ type: Boolean }) reorderable = false

  /**
   * Column ids in display order: an array in the property, `;`-separated in the `column-order` attribute. Columns it
   * does not list follow, in their definition order. Written when the user reorders the columns.
   */
  @property({ converter: arrayPropertyConverter, attribute: 'column-order' }) columnOrder?: string[]

  /**
   * Ids of columns to leave out, on top of those whose definition is `hidden`: what a column menu toggles.
   * `setColumnHidden()` edits it. An array in the property, `;`-separated in the attribute.
   */
  @property({ converter: arrayPropertyConverter, attribute: 'hidden-columns' }) hiddenColumns: string[] = []

  @state() private columnElements: TableColumn[] = []
  @state() private widthOverrides: Record<string, number> = {}
  @state() private focusedCell: { row: number; column: number } = { row: HEADER_ROW, column: 0 }
  private readonly slotPresence = new SlotPresenceController(this, ['toolbar', 'footer'])
  @state() private remoteTotal = -1
  /** The last message of the live region: what a sort, a group toggle, a filter or a column move did. */
  @state() private announcement = ''
  /** The cell being edited: its row's key, its column's id and the text in the editor. */
  @state() private editing?: { key: string; column: string; line: number }
  /** Where a dragged header would land: before or after the header of `column`. */
  @state() private dropTarget?: { source: string; column: string; after: boolean }

  private readonly msg = new LocalizeController(this, tableMessages)

  #sortedRows: TableRow[] = []
  #blocks = new Map<number, TableRow[]>()
  #pendingBlocks = new Set<number>()
  #measuredWidths = new Map<string, number>()
  #measuredRowHeight = 0
  #selectionAnchor = -1
  #pendingFocus = false
  #pendingFocusOptions?: FocusOptions
  #requestToken = 0
  /** The pagers that have announced themselves, so only their events are swallowed — not a pager inside a cell. */
  #pagers = new WeakSet<EventTarget>()
  #pendingScrollTop = false
  #animationFrom = new Map<string, TableRow>()
  #animationProgress = 1
  #animationFrame?: number
  #transitionRows?: TableRow[]
  #rowUpdateStates = new Map<string, RowUpdateState>()
  #warnedPositionalKeys = false
  #summaryCache?: { inputs: unknown[]; rows: TableRow[]; values: Map<string, unknown> }
  #groupingCache?: { treeInputs: unknown[]; itemInputs: unknown[]; grouping: Grouping }
  /** The number of rows before filtering, for the filter announcement. */
  #unfilteredCount = 0
  /** The quick filter the last announcement described, so only a change of it is announced. */
  #announcedFilter = ''
  /** Formatters by column and format: building an `Intl` formatter per cell is what made formatting slow. */
  #formatters = new WeakMap<TableColumnConfig, { key: string; format: (value: unknown) => string }>()
  /** Focus the editor once it renders; `select` selects its text (an edit not started by typing). */
  #focusEditor?: { select: boolean }
  /** The editor's text, kept out of reactive state so typing does not redraw the grid. */
  #editDraft = ''
  /** A header drag just ended: the click that follows must not sort. */
  #suppressHeaderClick = false
  /** Groups a data source listed, by the key of their parent (`''` for the top level). */
  #remoteGroups = new Map<string, RemoteGroup[]>()
  /** Rows fetched for the bottom-level groups of a data source, by group key and block. */
  #remoteGroupRows = new Map<string, Map<number, TableRow[]>>()
  /** Requests in flight for a data source's groups and their rows. */
  #remotePending = new Set<string>()
  /** Bumped whenever remote groups or rows arrive, so the cached grouping is rebuilt. */
  #remoteVersion = 0
  #warnedGroupedSource = false
  #headerHeightPx = 0
  /** The viewport's inner width, which caps a row detail so it stays in view on a sideways scroll. Measured while details are on. */
  #viewportWidth = 0
  /** Keys of the group rows stuck under the header at the last render, to re-render only when they change. */
  #echoSignature = ''
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
    itemHeight: () => this.#rowHeightPx,
    overscan: () => this.overscan,
    enabled: () => this.isVirtualized,
  })

  /** Total number of rows the table knows about: `rows.length`, or the `dataSource` total. */
  get totalRows(): number {
    return this.dataSource ? Math.max(0, this.remoteTotal) : this.#sortedRows.length
  }

  /**
   * Number of rows on screen right now: the whole dataset, or one page of it while `paginated`. This is what the
   * virtualizer windows and what `virtual="auto"` measures, so a 25-row page is never virtualized against a
   * million-row total.
   */
  get rowCount(): number {
    const grouping = this.#grouping()
    if (grouping) return this.paginated ? Math.max(0, Math.min(this.pageSize, grouping.items.length - this.#pageStart)) : grouping.items.length
    if (!this.paginated) return this.dataSource ? this.totalRows : (this.#transitionRows?.length ?? this.totalRows)
    const onPage = Math.max(0, Math.min(this.pageSize, this.totalRows - this.#pageStart))
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
    return this.#grouping()?.items.length ?? this.totalRows
  }

  /** Index of the first row of the current page within the whole dataset. */
  get #pageStart(): number {
    return this.paginated ? (this.page - 1) * this.pageSize : 0
  }

  /** A page is one block, so the existing block cache and request de-duplication carry paging unchanged. */
  get #effectiveBlockSize(): number {
    return this.paginated ? this.pageSize : this.blockSize
  }

  /** Whether the rows are currently windowed. */
  get isVirtualized(): boolean {
    if (this.wrap || this.virtual === 'never') return false
    // A row's detail has its own height, which the uniform-height window cannot place.
    if (typeof this.renderDetail === 'function' && this.expandedRows.length > 0) return false
    if (this.virtual === 'always') return true
    return this.rowCount > this.virtualThreshold
  }

  get #rowHeightPx(): number {
    return this.#measuredRowHeight || this.rowHeight
  }

  get #isBootstrapping(): boolean {
    return Boolean(this.dataSource) && this.remoteTotal < 0 && !this.error
  }

  /**
   * Every column definition in display order (`columnOrder` applied), hidden ones included — children first, then the
   * `columns` property, then one per key of the first row. What a column menu lists.
   */
  get allColumns(): TableColumnConfig[] {
    const source: TableColumnConfig[] = this.columnElements.length ? this.columnElements : (this.columns ?? this.#autoColumns())
    const columns = source.filter((column) => columnKey(column))
    const order = Array.isArray(this.columnOrder) ? this.columnOrder : []
    if (!order.length) return columns
    const rank = new Map(order.map((id, index) => [id, index]))
    // Stable: the columns `columnOrder` does not name keep their definition order, after the ones it does.
    return [...columns].sort((left, right) => (rank.get(columnKey(left)) ?? order.length) - (rank.get(columnKey(right)) ?? order.length))
  }

  /** The visible columns in display order, pinned ones moved to their edges: what the grid draws. */
  get resolvedColumns(): TableColumnConfig[] {
    const hidden = new Set(Array.isArray(this.hiddenColumns) ? this.hiddenColumns : [])
    const visible = this.allColumns.filter((column) => !column.hidden && !hidden.has(columnKey(column)))
    return [
      ...visible.filter((column) => column.pinned === 'start'),
      ...visible.filter((column) => !column.pinned),
      ...visible.filter((column) => column.pinned === 'end'),
    ]
  }

  /**
   * The key of `row`: `getRowKey(row)`, else its `row-key` field, as a string. Without either it is the row's current
   * position, found by identity among the rows the table holds, and `undefined` when the row is not one of them.
   */
  keyOf(row: TableRow): string | undefined {
    const identity = this.#identityOf(row)
    if (identity !== undefined) return identity
    const grouping = this.dataSource && this.groupBy?.length ? this.#grouping() : undefined
    if (grouping?.remote) {
      const index = grouping.source.indexOf(row)
      return index >= 0 ? String(index) : undefined
    }
    if (this.dataSource) {
      const size = this.#effectiveBlockSize
      for (const [block, rows] of this.#blocks) {
        const index = rows.indexOf(row)
        if (index >= 0) return String(block * size + index)
      }
      return undefined
    }
    const index = this.#sortedRows.indexOf(row)
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
      this.#commitSelection(keys.length ? [keys[keys.length - 1]] : add ? this.value : [])
      return
    }
    this.#commitSelection([...new Set([...(add ? this.value : []), ...keys])])
  }

  /** Removes `rows` from the selection. Fires `selection-change`. */
  deselectRows(rows: TableRow[]) {
    const keys = new Set(rows.map((row) => this.keyOf(row)))
    this.#commitSelection(this.value.filter((key) => !keys.has(key)))
  }

  /** The rows currently selected. Only the loaded ones when a `dataSource` is used. */
  getSelectedRows(): TableRow[] {
    const keys = new Set(this.value)
    const selected: TableRow[] = []
    for (let index = 0; index < this.#rowTotal; index++) {
      const row = this.#rowAt(index)
      if (row && keys.has(this.#keyAt(index, row))) selected.push(row)
    }
    return selected
  }

  /** Selects every loaded row. No-op unless `selection="multiple"`. */
  selectAll() {
    if (this.selection !== 'multiple') return
    const keys: string[] = []
    for (let index = 0; index < this.#rowTotal; index++) {
      const row = this.#rowAt(index)
      if (row) keys.push(this.#keyAt(index, row))
    }
    this.#commitSelection(keys)
  }

  /**
   * Upper bound of the row indices `getSelectedRows` and `selectAll` visit: the rows on show, or while grouped every
   * row, including those in closed groups — they are selected by their group's checkbox too.
   */
  get #rowTotal(): number {
    return this.#grouping()?.source.length ?? this.rowCount
  }

  /** Clears the selection. */
  clearSelection() {
    this.#commitSelection([])
  }

  /** Scrolls the row at `index` into view; while grouped, only a row whose groups are open has a place to scroll to. */
  scrollToIndex(index: number) {
    const grouping = this.#grouping()
    if (!grouping) {
      this.#scrollToLine(index)
      return
    }
    const line = grouping.items.findIndex((item) => item.kind === 'row' && item.rowIndex === index)
    if (line >= 0) this.#scrollToLine(line)
  }

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

  /** Opens every group. Without `groups-collapsed` this returns to the default, so groups that appear later open too. */
  expandAll() {
    if (this.groupsCollapsed) {
      const grouping = this.#grouping()
      if (grouping) this.expandedGroups = [...grouping.nodes.keys()]
      return
    }
    this.expandedGroups = undefined
    this.collapsedGroups = undefined
  }

  /** Closes every group, including groups that appear later. */
  collapseAll() {
    this.expandedGroups = []
    this.collapsedGroups = undefined
  }

  /**
   * Opens the groups above `level` and closes the others: `expandToLevel(1)` shows every top-level group open with
   * its sub-groups closed, `expandToLevel(0)` is `collapseAll()`.
   */
  expandToLevel(level: number) {
    const grouping = this.#grouping()
    if (!grouping) return
    this.collapsedGroups = undefined
    this.expandedGroups = [...grouping.nodes.values()].filter((node) => node.level < level).map((node) => node.key)
  }

  /** Hides or shows the column with `id` through `hiddenColumns`. A column whose definition is `hidden` stays hidden. */
  setColumnHidden(id: string, hidden: boolean) {
    const rest = (Array.isArray(this.hiddenColumns) ? this.hiddenColumns : []).filter((entry) => entry !== id)
    this.hiddenColumns = hidden ? [...rest, id] : rest
  }

  /**
   * Moves the column with `id` to `index` among `allColumns` and writes the result to `columnOrder`. Pinned columns
   * are still drawn at their edge. Does not fire `column-reorder`, which reports what the user did.
   */
  moveColumn(id: string, index: number) {
    const order = this.allColumns.map(columnKey)
    const from = order.indexOf(id)
    if (from < 0) return
    order.splice(from, 1)
    order.splice(Math.min(Math.max(0, Math.floor(index) || 0), order.length), 0, id)
    this.columnOrder = order
  }

  /** Whether the detail of `row` is shown. */
  isRowExpanded(row: TableRow): boolean {
    const key = this.keyOf(row)
    return key !== undefined && this.expandedRows.includes(key)
  }

  /** Shows or hides the detail of `row` (toggles it without `expanded`). Does not fire `row-detail-toggle`. */
  toggleRowDetail(row: TableRow, expanded?: boolean) {
    const key = this.keyOf(row)
    if (key !== undefined) this.#setRowExpanded(key, expanded ?? !this.expandedRows.includes(key))
  }

  /**
   * Opens the editor of the cell of `row` in the column with `id`, when that column is editable and the row is on
   * screen (on the current page, in an open group). Returns whether it opened.
   */
  editCell(row: TableRow, id: string): boolean {
    const columns = this.#renderColumns()
    const columnIndex = columns.findIndex((column) => columnKey(column) === id)
    const key = this.keyOf(row)
    if (columnIndex < 0 || key === undefined || !this.#isEditable(columns[columnIndex])) return false
    const line = this.#lineOfKey(key)
    if (line < 0) return false
    this.#beginEdit(line, columnIndex)
    return this.editing !== undefined
  }

  /**
   * The rows as CSV text, one line per row (`\r\n`-separated) with a header line first. See {@link TableCsvOptions}
   * for which rows and columns, raw or formatted values, and the escaping of formula-like text.
   */
  toCSV(options: TableCsvOptions = {}): string {
    const { rows = 'all', columns = 'visible', header = true, formatted = false, separator = ',', escapeFormulas = true } = options
    const fields = (columns === 'all' ? this.allColumns : this.resolvedColumns).filter((column) => column.field)
    const data = rows === 'selected' ? this.getSelectedRows() : rows === 'page' ? this.#pageRows() : this.#allRows()
    const lines: string[] = []
    if (header) lines.push(fields.map((column) => csvField(this.#headerText(column), separator, escapeFormulas)).join(separator))
    for (const row of data) lines.push(fields.map((column) => csvField(this.#cellText(column, row, formatted), separator, escapeFormulas)).join(separator))
    return lines.join('\r\n')
  }

  /** Saves `toCSV(options)` as a file named `filename`, through the browser's download. */
  downloadCSV(filename = 'table.csv', options: TableCsvOptions = {}) {
    // The byte order mark is what makes Excel read the file as UTF-8 rather than the system code page.
    const blob = new Blob(['\ufeff', this.toCSV(options)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  /** Drops the `dataSource` cache and reloads the visible rows. */
  refresh() {
    this.error = ''
    if (this.dataSource) this.#resetRemote()
    this.requestUpdate()
  }

  protected override willUpdate(changed: PropertyValues) {
    if ((changed.has('animateUpdates') && !this.animateUpdates) || (changed.has('updateDuration') && this.updateDuration <= 0)) this.#cancelRowsAnimation()
    if (changed.has('rows')) this.#prepareRowsAnimation(changed.get('rows'))
    const regroup = changed.has('groupBy') || changed.has('dataSource')
    const refilter = changed.has('filter') || changed.has('quickFilter') || changed.has('hiddenColumns')
    if (!this.hasUpdated || regroup || refilter || changed.has('rows') || changed.has('sortModel') || changed.has('columns') || changed.has('columnElements'))
      this.#applySort()
    if (this.dataSource && typeof this.dataSource.getGroups !== 'function' && this.#groupLevels().length && !this.#warnedGroupedSource) {
      this.#warnedGroupedSource = true
      console.warn(
        '[c2-table] group-by is ignored with a dataSource that has no getGroups: the table only holds the rows it has fetched, so it cannot know every group. Implement getGroups, group the rows yourself, or pass them in rows.',
      )
    }
    // Another page size re-cuts the blocks, so the cache has to go; another page does not — and must not, or
    // `remoteTotal` would drop back to "unknown" and the pager would collapse to a single page mid-navigation.
    if (
      changed.has('dataSource') ||
      changed.has('blockSize') ||
      changed.has('pageSize') ||
      (this.dataSource && (changed.has('sortModel') || changed.has('quickFilter') || changed.has('groupBy')))
    ) {
      this.#resetRemote()
    }
    if (changed.has('quickFilter') && this.hasUpdated && !this.dataSource && this.quickFilter !== this.#announcedFilter) {
      this.#announcedFilter = this.quickFilter
      this.#announce(this.msg.t('filtered', this.#sortedRows.length, this.#unfilteredCount))
    }
    if (this.paginated) {
      // A new sort is a new dataset; start it at the top rather than on a page that may no longer exist.
      if (changed.has('sortModel') && changed.get('sortModel') !== undefined) this.page = 1
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
    const firstRow = this.#pageStart
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
    this.#measureHeaderHeight()
    this.#measureViewportWidth()
    this.#measureColumnWidths()
    this.#syncFocusToWindow()
    if (this.#pendingFocus) {
      this.#pendingFocus = false
      this.renderRoot.querySelector<HTMLElement>('.cell[tabindex="0"]')?.focus(this.#pendingFocusOptions)
      this.#pendingFocusOptions = undefined
    }
    if (this.#focusEditor && this.editing) {
      const cell = this.renderRoot.querySelector<HTMLElement>('.cell[data-editing]')
      const input = cell?.querySelector<HTMLInputElement>('input.editor')
      const target = input ?? cell?.querySelector<HTMLElement>('input, select, textarea, button, [tabindex]:not([tabindex="-1"]), [contenteditable="true"]')
      if (target) {
        const { select } = this.#focusEditor
        this.#focusEditor = undefined
        target.focus()
        if (input && select) input.select()
      }
    }
    if (this.dataSource) {
      if (this.#remoteGrouping) this.#ensureRemoteGroups()
      else this.#ensureBlocks()
    }
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
      const offset = this.#pageStart
      const range = this.#virtualizer.range
      const grouping = this.#grouping()
      start = offset + range.start
      end = grouping ? Math.min(offset + range.end, offset + this.rowCount) : offset + range.end
      for (let line = start; line < end; line++) {
        const item = grouping?.items[line]
        if (item?.kind === 'group') continue
        const index = this.#rowIndexAt(line)
        const row = this.#sourceRowAt(index)
        if (row) rows.push({ line, key: this.#keyAt(index, row), row })
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
    const range = this.#virtualizer.range
    // The virtualizer windows the page; the body renders dataset indices, so shift its range by the page offset.
    const offset = this.#pageStart
    const summary = this.#hasSummary(columns)
    const grouping = this.#grouping()
    const stuck = grouping ? this.#stuckGroups(grouping) : []
    this.#echoSignature = stuck.map((node) => node.key).join('\n')
    const prefix = grouping ? this.#pagePrefix(grouping) * this.#rowHeightPx : 0

    return html`
      <div class="toolbar" part="toolbar" ?hidden=${!this.slotPresence.has('toolbar')}>
        <slot name="toolbar" @slotchange=${this.slotPresence.handleSlotChange}></slot>
      </div>
      <div class="viewport" part="viewport" @scroll=${this.#handleViewportScroll}>
        <div
          class=${classMap({ grid: true, 'grid--wrap': this.wrap })}
          role=${grouping ? 'treegrid' : 'grid'}
          part="grid"
          aria-rowcount=${this.#lineCount + (summary ? 2 : 1)}
          aria-colcount=${columns.length}
          aria-label=${this.gridLabel || nothing}
          aria-busy=${this.loading || this.#isBootstrapping ? 'true' : 'false'}
          style=${styleMap({ '--_grid-template': this.#gridTemplate(columns), '--_viewport-width': this.#viewportWidth ? `${this.#viewportWidth}px` : undefined })}
          @keydown=${this.#handleKeyDown}
          @copy=${this.#handleCopy}
        >
          ${this.#renderHeaderRow(columns, pins)}
          ${
            grouping && stuck.length
              ? html`<div class="group-echoes" style=${styleMap({ top: `${this.#headerHeightPx}px` })}>
                  ${stuck.map((node) => this.#renderGroupRow(node, -1, columns, pins, grouping, true))}
                </div>`
              : nothing
          }
          ${prefix > 0 ? html`<div class="spacer spacer--group-prefix" style="height:${prefix}px"></div>` : nothing}
          ${range.paddingTop > 0 ? html`<div class="spacer" style="height:${range.paddingTop}px"></div>` : nothing}
          ${this.#renderBody(columns, pins, offset + range.start, offset + range.end)}
          ${range.paddingBottom > 0 ? html`<div class="spacer" style="height:${range.paddingBottom}px"></div>` : nothing}
          ${summary ? this.#renderSummaryRow(columns, pins) : nothing}
        </div>
      </div>
      <div class="footer" part="footer" ?hidden=${!this.slotPresence.has('footer')}>
        <slot name="footer" @slotchange=${this.slotPresence.handleSlotChange}></slot>
      </div>
      <slot class="definitions" @slotchange=${this.#handleDefinitionsChange}></slot>
      <slot name="fallback" class="definitions"></slot>
      <div class="live" role="status">${this.announcement}</div>
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
          ${isLoading ? html`<slot name="loading"><c2-spinner></c2-spinner></slot>` : html`<slot name="empty">${this.#emptyText}</slot>`}
        </div>
      </div>`
    }
    const lines: number[] = []
    const grouping = this.#grouping()
    // The window is the virtualizer's from the last layout; closing a group shortens the list before it catches up.
    const last = grouping ? Math.min(end, this.#pageStart + this.rowCount) : end
    for (let line = start; line < last; line++) lines.push(line)
    if (grouping) {
      return repeat(
        lines,
        (line) => {
          const item = grouping.items[line]
          if (item.kind === 'group') return `group:${item.node.key}`
          const row = grouping.source[item.rowIndex]
          return row ? this.#keyAt(item.rowIndex, row) : `skeleton:${item.rowIndex}`
        },
        (line) => {
          const item = grouping.items[line]
          return item.kind === 'group' ? this.#renderGroupRow(item.node, line, columns, pins, grouping, false) : this.#renderRow(line, columns, pins)
        },
      )
    }
    return repeat(
      lines,
      (index) => {
        const row = this.#rowAt(index)
        return row ? this.#keyAt(index, row) : `skeleton:${index}`
      },
      (index) => this.#renderRow(index, columns, pins),
    )
  }

  /** The empty-state text: the author's `empty-message`, else "No matching rows" while filtered, else "No rows". */
  get #emptyText(): string {
    if (this.emptyMessage) return this.emptyMessage
    const filtered = !this.dataSource && (filterTerms(this.quickFilter).length > 0 || typeof this.filter === 'function') && this.#unfilteredCount > 0
    return this.msg.t(filtered ? 'noMatches' : 'empty')
  }

  /** The column holding the group tree: the one marked `group-column`, else the first data column. */
  #groupTreeColumn(columns: TableColumnConfig[]): TableColumnConfig | undefined {
    return columns.find((column) => column.groupColumn && !isSynthetic(column)) ?? columns.find((column) => !isSynthetic(column))
  }

  #renderGroupLabel(node: GroupNode, grouping: Grouping, echo: boolean) {
    const label = this.renderGroup ? this.renderGroup(this.#groupContext(node, grouping)) : this.#groupText(node)
    const content = html`<span class="group-label" part="group-label">${label}</span>
      <span class="group-count" part="group-count">${this.#formatCount(node.count)}</span>`
    // Two slots of one name would split the slotted label between the row and its stuck copy; the copy shows the fallback.
    return echo ? content : html`<slot name=${`group:${node.key}`}>${content}</slot>`
  }

  #renderGroupCheckbox(node: GroupNode, grouping: Grouping) {
    // A data source's group holds rows the table has not fetched, so they cannot be selected through it.
    if (this.selection !== 'multiple' || grouping.remote) return nothing
    const keys = this.#groupKeys(node, grouping)
    // Counted once per selection rather than on every scroll frame: a group can hold thousands of rows.
    if (node.selection?.value !== this.value) {
      const selected = new Set(this.value)
      node.selection = { value: this.value, count: keys.filter((key) => selected.has(key)).length }
    }
    const count = node.selection.count
    const all = count > 0 && count === keys.length
    return html`<c2-checkbox
      aria-label=${this.msg.t('selectGroup', this.#groupText(node))}
      ?checked=${all}
      ?indeterminate=${count > 0 && !all}
      @click=${(event: Event) => event.stopPropagation()}
      @change=${(event: Event) => {
        event.stopPropagation()
        const own = new Set(keys)
        const rest = this.value.filter((key) => !own.has(key))
        this.#commitSelection((event.target as Checkbox).checked ? [...rest, ...keys] : rest)
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
    const focusable = (columnIndex: number) => (echo ? undefined : this.#tabIndexFor(line, columnIndex))
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
        @click=${() => this.#focusLine(line)}
      >
        <span class="band-content">
          ${selectionColumn >= 0 && !echo ? this.#renderGroupCheckbox(node, grouping) : nothing} ${toggle} ${this.#renderGroupLabel(node, grouping, echo)}
        </span>
      </div>`
    } else {
      const values = this.#groupSummary(node, grouping)
      cells = columns.map((column, columnIndex) => {
        const pinClasses = this.#pinClasses(column, pins)
        const style = styleMap(this.#pinStyle(column, pins))
        if (isSynthetic(column)) {
          const selection = column.field === SELECTION_FIELD
          return html`<div
            class=${classMap({ cell: true, 'cell--selection': true, ...pinClasses })}
            role="gridcell"
            part=${selection ? 'group-cell selection-cell' : 'group-cell'}
            aria-colindex=${columnIndex + 1}
            tabindex=${ifDefined(focusable(columnIndex))}
            style=${style}
          >
            ${echo || !selection ? nothing : this.#renderGroupCheckbox(node, grouping)}
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
            @click=${() => this.#focusLine(line, columnIndex)}
          >
            ${toggle} ${this.#renderGroupLabel(node, grouping, echo)}
          </div>`
        }
        const value = values.get(columnKey(column))
        const content =
          value === undefined || value === null || value === ''
            ? ''
            : this.#groupAggregate(column) === 'count'
              ? this.#formatValue({ field: column.field, format: 'number', locale: column.locale }, value)
              : this.#formatValue(column, value)
        return html`<div
          class=${classMap({ cell: true, 'cell--group': true, [`cell--align-${column.summaryAlign ?? column.align ?? 'start'}`]: true, ...pinClasses, ...(column.cellClass ? { [column.cellClass]: true } : {}) })}
          role="gridcell"
          part="group-cell group-cell-${part}"
          aria-colindex=${columnIndex + 1}
          tabindex=${ifDefined(focusable(columnIndex))}
          style=${style}
          @click=${() => this.#focusLine(line, columnIndex)}
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

  /** Moves the roving tabindex to a cell of display line `line` (a click on a group row, which does not select). */
  #focusLine(line: number, column = this.focusedCell.column) {
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
    if (column.field === DETAIL_FIELD) {
      return html`<div
        class=${classMap({ cell: true, 'cell--header': true, 'cell--selection': true, ...this.#pinClasses(column, pins) })}
        role="columnheader"
        part="header-cell detail-header-cell"
        data-field=${column.field}
        data-column-id=${columnKey(column)}
        aria-colindex=${columnIndex + 1}
        aria-label=${this.msg.t('rowDetails')}
        tabindex=${this.#tabIndexFor(HEADER_ROW, columnIndex)}
        style=${styleMap(this.#pinStyle(column, pins))}
      ></div>`
    }
    if (column.field === SELECTION_FIELD) {
      const total = this.#rowTotal
      const selected = this.value.length
      const allSelected = total > 0 && selected >= total
      return html`
        <div
          class=${classMap({ cell: true, 'cell--header': true, 'cell--selection': true, ...this.#pinClasses(column, pins) })}
          role="columnheader"
          part="header-cell selection-header-cell"
          data-field=${column.field}
          data-column-id=${columnKey(column)}
          aria-colindex=${columnIndex + 1}
          tabindex=${this.#tabIndexFor(HEADER_ROW, columnIndex)}
          style=${styleMap(this.#pinStyle(column, pins))}
        >
          <c2-checkbox
            aria-label=${this.msg.t('selectAll')}
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
    const label = column.renderHeader ? column.renderHeader({ column }) : this.#headerText(column)
    const key = columnKey(column)
    const drop = this.dropTarget

    return html`
      <div
        class=${classMap({
          cell: true,
          'cell--header': true,
          'cell--sortable': sortable,
          'cell--sorted': Boolean(sort),
          'cell--reorderable': this.reorderable,
          'cell--dragging': drop?.source === key,
          'cell--drop-before': drop?.column === key && !drop.after && drop.source !== key,
          'cell--drop-after': drop?.column === key && drop.after && drop.source !== key,
          [`cell--align-${column.align ?? 'start'}`]: true,
          ...this.#pinClasses(column, pins),
        })}
        role="columnheader"
        part="header-cell"
        data-field=${column.field}
        data-column-id=${columnKey(column)}
        aria-colindex=${columnIndex + 1}
        aria-sort=${ifDefined(sortable ? (sort ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none') : undefined)}
        tabindex=${this.#tabIndexFor(HEADER_ROW, columnIndex)}
        style=${styleMap(this.#pinStyle(column, pins))}
        @pointerdown=${(event: PointerEvent) => this.#startReorder(event, column)}
        @click=${(event: MouseEvent) => {
          this.focusedCell = { row: HEADER_ROW, column: columnIndex }
          if (this.#suppressHeaderClick) {
            this.#suppressHeaderClick = false
            return
          }
          this.#toggleSort(column, event.shiftKey)
        }}
      >
        <span class="cell-content">${label}</span>
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

  /** A data row on display line `line`, which is also its row index unless the rows are grouped. */
  #renderRow(line: number, columns: TableColumnConfig[], pins: Map<string, PinPlacement>) {
    const index = this.#rowIndexAt(line)
    const row = this.#rowAt(index)
    const key = row ? this.#keyAt(index, row) : ''
    const grouping = this.#grouping()
    const item = grouping?.items[line]
    const depth = item?.kind === 'row' ? item.parent.level + 1 : 0
    const treeColumn = grouping && this.groupDisplay !== 'band' ? this.#groupTreeColumn(columns) : undefined
    const selected = key !== '' && this.value.includes(key)
    const selectable = this.selection !== 'none'
    const updateState = key ? this.#rowUpdateStates.get(key) : undefined
    const rowStyle = row && updateState !== 'removed' ? this.rowStyle?.({ row, rowIndex: index, key }) : undefined
    const extraParts = row && updateState !== 'removed' ? this.rowPart?.({ row, rowIndex: index, key }) : undefined
    const detailed = Boolean(row && key !== '' && typeof this.renderDetail === 'function' && this.expandedRows.includes(key))

    return html`
      <div
        class=${classMap({
          row: true,
          'row--body': true,
          'row--expanded': detailed,
          'row--odd': line % 2 === 1,
          'row--selected': selected,
          'row--clickable': selectable,
          'row--highlighted': Boolean(updateState && this.highlightUpdates),
          [`row--${updateState}`]: Boolean(updateState),
        })}
        role="row"
        part=${[
          'row',
          selected ? 'row-selected' : '',
          updateState ? `row-${updateState}` : '',
          ...(typeof extraParts === 'string' ? extraParts.split(/\s+/) : (extraParts ?? [])),
        ]
          .filter(Boolean)
          .join(' ')}
        data-row-key=${key}
        data-update-state=${ifDefined(updateState)}
        aria-rowindex=${line + 2}
        aria-level=${ifDefined(grouping ? depth + 1 : undefined)}
        aria-selected=${ifDefined(selectable ? String(selected) : undefined)}
        aria-hidden=${ifDefined(updateState === 'removed' ? 'true' : undefined)}
        style=${styleMap({ ...rowStyle, '--_update-duration': `${Math.max(0, this.updateDuration)}ms` })}
        @click=${(event: MouseEvent) => this.#handleRowClick(event, line)}
      >
        ${columns.map((column, columnIndex) => this.#renderCell(row, line, index, column, columnIndex, pins, column === treeColumn ? depth : 0))}
      </div>
      ${detailed ? this.#renderDetailRow(row!, index, key, line, columns.length) : nothing}
    `
  }

  /**
   * The detail of an expanded row: one cell across the grid under it. It is not a display line — it has no
   * `aria-rowindex`, the arrow keys pass over it and its content keeps its own keyboard behaviour.
   */
  #renderDetailRow(row: TableRow, rowIndex: number, key: string, line: number, span: number) {
    const context: TableRowContext = { row, rowIndex, key }
    return html`<div class="row row--detail" role="row" part="detail-row" id=${`detail-${line}`} data-row-key=${key}>
      <div class="cell cell--detail" role="gridcell" part="detail-cell" aria-colspan=${span}>
        <div class="detail-content">${this.renderDetail?.(context)}</div>
      </div>
    </div>`
  }

  /** `line` is the cell's display line (focus, keyboard), `rowIndex` the row's index (data, keys); `indent` is its group depth. */
  #renderCell(
    row: TableRow | undefined,
    line: number,
    rowIndex: number,
    column: TableColumnConfig,
    columnIndex: number,
    pins: Map<string, PinPlacement>,
    indent = 0,
  ) {
    const classes = {
      cell: true,
      [`cell--align-${column.align ?? 'start'}`]: true,
      'cell--selection': isSynthetic(column),
      'cell--editable': this.#isEditable(column),
      'cell--editing': Boolean(this.editing && row && this.editing.column === columnKey(column) && this.editing.key === this.#keyAt(rowIndex, row)),
      ...this.#pinClasses(column, pins),
      ...(column.cellClass ? { [column.cellClass]: true } : {}),
    }
    const shared = {
      class: classMap(classes),
      tabindex: this.#tabIndexFor(line, columnIndex),
      style: styleMap(this.#pinStyle(column, pins)),
    }

    if (column.field === DETAIL_FIELD) {
      const key = row ? this.#keyAt(rowIndex, row) : ''
      const expanded = key !== '' && this.expandedRows.includes(key)
      return html`<div
        class=${shared.class}
        role="gridcell"
        part="cell detail-toggle-cell"
        aria-colindex=${columnIndex + 1}
        aria-label=${this.msg.t('rowDetails')}
        aria-expanded=${ifDefined(row ? String(expanded) : undefined)}
        aria-controls=${ifDefined(expanded ? `detail-${line}` : undefined)}
        tabindex=${shared.tabindex}
        style=${shared.style}
        @click=${(event: Event) => {
          event.stopPropagation()
          this.focusedCell = { row: line, column: columnIndex }
          this.#toggleDetailFromUser(line)
        }}
      >
        ${row ? html`<span class=${classMap({ 'detail-toggle': true, 'detail-toggle--expanded': expanded })} part="detail-toggle">${CHEVRON}</span>` : nothing}
      </div>`
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
                  aria-label=${this.msg.t('selectRow')}
                  ?checked=${this.value.includes(key)}
                  @click=${(event: Event) => event.stopPropagation()}
                  @change=${() => this.#handleCheckboxToggle(line)}
                ></c2-checkbox>`
              : nothing
          }
        </div>
      `
    }

    const value = getFieldValue(row, column.field)
    const editing = Boolean(row && this.editing && this.editing.column === columnKey(column) && this.editing.key === this.#keyAt(rowIndex, row))
    if (editing) return this.#renderEditingCell(row!, rowIndex, column, columnIndex, value, shared)
    const rendered = row ? (column.renderCell ? column.renderCell({ value, row, rowIndex, column }) : this.#formatValue(column, value)) : undefined
    // A `cell-slot` column takes its body from a light-DOM child, which is how React, Vue and Angular render a
    // cell with their own template language instead of building DOM nodes by hand. Whatever `renderCell` or the
    // formatter produced stays as the slot's fallback, so a row with no child still shows its value.
    const content = row
      ? column.cellSlot
        ? html`<slot name=${`cell:${line}:${columnKey(column)}`}>${rendered}</slot>`
        : rendered
      : html`<span class="skeleton" part="skeleton"></span>`

    // A cell and its content each carry a part named after the column, so one column can be styled from outside —
    // the cell for its box, the content for the text itself, which is what a pill or a chip needs.
    const fieldPart = columnKey(column).replace(/[^\w-]/g, '-')
    return html`
      <div
        class=${shared.class}
        role="gridcell"
        part="cell cell-${fieldPart}"
        aria-colindex=${columnIndex + 1}
        tabindex=${shared.tabindex}
        style=${shared.style}
        @click=${() => this.#handleCellClick(line, columnIndex, column, value)}
        @dblclick=${() => this.#beginEdit(line, columnIndex)}
        @c2-context-menu-request=${(event: Event) => this.#handleContextMenuRequest(event, line, columnIndex, column, value)}
      >
        <span
          class=${classMap({ 'cell-content': true, 'cell-content--indented': indent > 0 })}
          part="cell-content cell-content-${fieldPart}"
          style=${styleMap(indent > 0 ? { '--_group-level': String(indent) } : {})}
          >${content}</span
        >
      </div>
    `
  }

  /** A cell while its editor is open: the built-in input, or what the column's `renderEditor` returns. */
  #renderEditingCell(
    row: TableRow,
    rowIndex: number,
    column: TableColumnConfig,
    columnIndex: number,
    value: unknown,
    shared: { class: unknown; tabindex: number; style: unknown },
  ) {
    const fieldPart = columnKey(column).replace(/[^\w-]/g, '-')
    const commit = (next: unknown) => this.#commitEdit(next)
    const cancel = () => this.#cancelEdit()
    const type = editorType(column.format)
    const editor = column.renderEditor
      ? column.renderEditor({ value, row, rowIndex, column, commit, cancel })
      : html`<input
          class="editor"
          part="editor"
          type=${type}
          step=${ifDefined(type === 'number' ? 'any' : undefined)}
          .value=${this.#editDraft}
          aria-label=${this.msg.t('editCell', this.#headerText(column))}
          @input=${(event: Event) => (this.#editDraft = (event.target as HTMLInputElement).value)}
          @keydown=${(event: KeyboardEvent) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              commit(parseEditorValue(event.target as HTMLInputElement))
            } else if (event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              cancel()
            }
          }}
          @blur=${(event: FocusEvent) => {
            // Leaving the editor commits, unless it is already closing (Enter, Escape).
            if (this.editing) this.#commitEdit(parseEditorValue(event.target as HTMLInputElement), false)
          }}
          @click=${(event: Event) => event.stopPropagation()}
          @dblclick=${(event: Event) => event.stopPropagation()}
        />`
    return html`
      <div
        class=${shared.class}
        role="gridcell"
        part="cell cell-${fieldPart} cell-editing"
        aria-colindex=${columnIndex + 1}
        tabindex=${shared.tabindex}
        style=${shared.style}
        data-editing
        @click=${(event: Event) => event.stopPropagation()}
        @focusout=${(event: FocusEvent) => {
          // A custom editor that loses focus to something outside its cell is left without committing: only it knows
          // its value. Close it so the cell does not stay in edit mode forever.
          if (!column.renderEditor || !this.editing) return
          const next = event.relatedTarget as Node | null
          if (!next || !(event.currentTarget as Node).contains(next)) this.#cancelEdit(false)
        }}
      >
        <span class="cell-content cell-content--editing" part="cell-content cell-content-${fieldPart}">${editor}</span>
      </div>
    `
  }

  #isEditable(column: TableColumnConfig | undefined): boolean {
    return Boolean(column && !isSynthetic(column) && column.field && (column.editable ?? this.editable))
  }

  /** Opens the editor of the cell on display line `line`; `initial` is the text typed to start it, replacing the value. */
  #beginEdit(line: number, columnIndex: number, initial?: string) {
    const column = this.#renderColumns()[columnIndex]
    if (!this.#isEditable(column)) return
    const index = this.#rowIndexAt(line)
    const row = this.#sourceRowAt(index)
    if (!row) return
    this.#editDraft = initial ?? editorDraft(getFieldValue(row, column.field), editorType(column.format))
    this.editing = { key: this.#keyAt(index, row), column: columnKey(column), line }
    this.focusedCell = { row: line, column: columnIndex }
    this.#focusEditor = { select: initial === undefined }
    this.#pendingFocus = false
    this.#scrollToLine(line)
  }

  /**
   * Closes the editor with `next`. Fires `cell-edit` when the value changed and, unless a listener cancels it, writes
   * the value into a copy of the row (`rows` is replaced, the row the app gave is not mutated).
   */
  #commitEdit(next: unknown, refocus = true) {
    const editing = this.editing
    if (!editing) return
    this.editing = undefined
    if (refocus) this.#pendingFocus = true
    const column = this.#renderColumns().find((candidate) => columnKey(candidate) === editing.column)
    const line = this.#lineOfKey(editing.key)
    const rowIndex = this.#rowIndexAt(line)
    const row = this.#sourceRowAt(rowIndex)
    if (!column || !row) return
    const previousValue = getFieldValue(row, column.field)
    if (Object.is(previousValue, next) || (typeof previousValue === typeof next && plainText(previousValue) === plainText(next))) return
    const event = new CustomEvent<TableCellEditEventDetail>('cell-edit', {
      detail: { row, rowIndex, key: editing.key, column, field: column.field, value: next, previousValue },
      bubbles: true,
      composed: true,
      cancelable: true,
    })
    if (!this.dispatchEvent(event)) return
    this.#applyEdit(row, column.field, next)
  }

  #cancelEdit(refocus = true) {
    if (!this.editing) return
    this.editing = undefined
    if (refocus) this.#pendingFocus = true
  }

  /** Replaces `row` by a copy holding `value` at `field`: in `rows`, or in the blocks a data source delivered. */
  #applyEdit(row: TableRow, field: string, value: unknown) {
    const next = withFieldValue(row, field, value)
    if (this.dataSource) {
      const replace = (rows: TableRow[]) => {
        const index = rows.indexOf(row)
        if (index >= 0) rows[index] = next
      }
      this.#blocks.forEach(replace)
      for (const blocks of this.#remoteGroupRows.values()) blocks.forEach(replace)
      this.#remoteVersion++
      this.requestUpdate()
      return
    }
    const rows = Array.isArray(this.rows) ? this.rows : []
    const index = rows.indexOf(row)
    if (index < 0) return
    const copy = [...rows]
    copy[index] = next
    this.rows = copy
  }

  /** The display line of the data row with `key`, or -1 when it is not on any line (filtered out, in a closed group). */
  #lineOfKey(key: string): number {
    for (let line = 0; line < this.#lineCount; line++) {
      const index = this.#rowIndexAt(line)
      const row = this.#sourceRowAt(index)
      if (row && this.#keyAt(index, row) === key) return line
    }
    return -1
  }

  #setRowExpanded(key: string, expanded: boolean) {
    const rest = this.expandedRows.filter((entry) => entry !== key)
    this.expandedRows = expanded ? [...rest, key] : rest
  }

  /** The user showed or hid the detail of the row on `line`. */
  #toggleDetailFromUser(line: number) {
    const rowIndex = this.#rowIndexAt(line)
    const row = this.#sourceRowAt(rowIndex)
    if (!row) return
    const key = this.#keyAt(rowIndex, row)
    const expanded = !this.expandedRows.includes(key)
    this.#setRowExpanded(key, expanded)
    this.dispatchEvent(
      new CustomEvent<TableRowDetailToggleEventDetail>('row-detail-toggle', { detail: { row, rowIndex, key, expanded }, bubbles: false, composed: true }),
    )
  }

  /** Says `text` through the live region; the same message twice in a row is still read. */
  #announce(text: string) {
    this.announcement = this.announcement === text ? `${text}\u00a0` : text
  }

  #headerText(column: TableColumnConfig): string {
    return column.header ?? humanize(column.field || columnKey(column))
  }

  /** A cell's value as text: as the cell formats it, or raw. */
  #cellText(column: TableColumnConfig, row: TableRow, formatted: boolean): string {
    const value = getFieldValue(row, column.field)
    return formatted ? this.#formatValue(column, value) : plainText(value)
  }

  /** Every row after filter and sort, grouped rows in group order; for a data source, those fetched so far. */
  #allRows(): TableRow[] {
    const grouping = this.#grouping()
    if (grouping) return grouping.source.filter((row): row is TableRow => row !== undefined)
    if (this.dataSource) {
      return [...this.#blocks.entries()].sort(([left], [right]) => left - right).flatMap(([, rows]) => rows)
    }
    return this.#sortedRows
  }

  /** The data rows on the page on show (every row when not paging), in display order. */
  #pageRows(): TableRow[] {
    const rows: TableRow[] = []
    for (let line = this.#pageStart; line < this.#pageStart + this.rowCount; line++) {
      const row = this.#sourceRowAt(this.#rowIndexAt(line))
      if (row) rows.push(row)
    }
    return rows
  }

  /**
   * Copy (⌘C / Ctrl+C) from the grid: the selected rows as tab-separated lines a spreadsheet pastes into cells, or
   * the focused cell's text when nothing is selected. Text selected with the pointer, an editor and a control keep
   * their own copy.
   */
  #handleCopy = (event: ClipboardEvent) => {
    if (this.editing || !event.clipboardData) return
    const origin = event.composedPath()[0]
    if (origin instanceof Element && origin.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], .row--detail')) return
    if ((document.getSelection()?.toString() ?? '') !== '') return
    const text = this.#copyText()
    if (text === undefined) return
    event.clipboardData.setData('text/plain', text)
    event.preventDefault()
  }

  #copyText(): string | undefined {
    const selected = this.selection === 'none' ? [] : this.getSelectedRows()
    if (selected.length) {
      const fields = this.resolvedColumns.filter((column) => column.field)
      return selected.map((row) => fields.map((column) => tsvField(this.#cellText(column, row, true))).join('\t')).join('\n')
    }
    const { row: line, column: columnIndex } = this.focusedCell
    const column = this.#renderColumns()[columnIndex]
    if (!column || isSynthetic(column)) return undefined
    if (line === HEADER_ROW) return this.#headerText(column)
    if (line < 0) return undefined
    const row = this.#sourceRowAt(this.#rowIndexAt(line))
    return row ? this.#cellText(column, row, true) : undefined
  }

  /** Starts dragging a header to reorder the columns, once the pointer has moved a few pixels. */
  #startReorder(event: PointerEvent, column: TableColumnConfig) {
    if (!this.reorderable || event.button !== 0 || isSynthetic(column)) return
    if ((event.target as Element | null)?.closest?.('.resizer')) return
    const cell = event.currentTarget as HTMLElement
    const source = columnKey(column)
    const startX = event.clientX
    const pointerId = event.pointerId
    let dragging = false
    const move = (moveEvent: PointerEvent) => {
      if (!dragging) {
        if (Math.abs(moveEvent.clientX - startX) < 6) return
        dragging = true
        cell.setPointerCapture(pointerId)
      }
      this.dropTarget = this.#dropTargetAt(moveEvent.clientX, column) ?? { source, column: source, after: false }
    }
    const finish = (endEvent: PointerEvent) => {
      cell.removeEventListener('pointermove', move)
      cell.removeEventListener('pointerup', finish)
      cell.removeEventListener('pointercancel', finish)
      if (cell.hasPointerCapture(pointerId)) cell.releasePointerCapture(pointerId)
      const target = this.dropTarget
      this.dropTarget = undefined
      if (!dragging) return
      // The click that ends a drag must not sort the column.
      this.#suppressHeaderClick = true
      setTimeout(() => (this.#suppressHeaderClick = false), 0)
      if (endEvent.type === 'pointerup' && target && target.column !== source) this.#reorderFromUser(source, target.column, target.after)
    }
    cell.addEventListener('pointermove', move)
    cell.addEventListener('pointerup', finish)
    cell.addEventListener('pointercancel', finish)
  }

  /** The header a drag at `x` drops before or after: among the columns pinned like `column`, clamped to their ends. */
  #dropTargetAt(x: number, column: TableColumnConfig): { source: string; column: string; after: boolean } | undefined {
    const source = columnKey(column)
    const peers = new Set(
      this.resolvedColumns.filter((candidate) => (candidate.pinned ?? '') === (column.pinned ?? '')).map((candidate) => columnKey(candidate)),
    )
    const cells = [...this.renderRoot.querySelectorAll<HTMLElement>('.row--header .cell--header[data-column-id]')].filter((cell) =>
      peers.has(cell.dataset.columnId ?? ''),
    )
    if (!cells.length) return undefined
    for (const cell of cells) {
      const rect = cell.getBoundingClientRect()
      if (x >= rect.left && x <= rect.right) return { source, column: cell.dataset.columnId!, after: x > rect.left + rect.width / 2 }
    }
    const first = cells[0].getBoundingClientRect()
    return x < first.left
      ? { source, column: cells[0].dataset.columnId!, after: false }
      : { source, column: cells[cells.length - 1].dataset.columnId!, after: true }
  }

  /** The user moved column `source` before or after column `target`: write `columnOrder`, announce it, report it. */
  #reorderFromUser(source: string, target: string, after: boolean): boolean {
    const columns = this.allColumns
    const from = columns.find((column) => columnKey(column) === source)
    const to = columns.find((column) => columnKey(column) === target)
    if (!from || !to || source === target || (from.pinned ?? '') !== (to.pinned ?? '')) return false
    const before = columns.map(columnKey)
    const order = before.filter((id) => id !== source)
    order.splice(order.indexOf(target) + (after ? 1 : 0), 0, source)
    if (order.every((id, index) => id === before[index])) return false
    this.columnOrder = order
    const visible = this.resolvedColumns
    this.#announce(this.msg.t('columnMoved', this.#headerText(from), visible.findIndex((column) => columnKey(column) === source) + 1, visible.length))
    this.dispatchEvent(new CustomEvent<TableColumnReorderEventDetail>('column-reorder', { detail: { id: source, order }, bubbles: true, composed: true }))
    return true
  }

  /** The path of a group, outermost level first: what a data source filters a group's rows by. */
  #groupPath(node: GroupNode | undefined): TableGroupPathEntry[] {
    const path: TableGroupPathEntry[] = []
    for (let current = node; current; current = current.parent) path.unshift({ field: current.field, value: current.value })
    return path
  }

  /**
   * Asks a grouping data source for what the screen needs: the top-level groups, the sub-groups of every open group on
   * screen, and the blocks of rows of the open bottom-level groups in the rendered window.
   */
  #ensureRemoteGroups() {
    if (!this.dataSource?.getGroups || this.error) return
    if (!this.#remoteGroups.has('')) {
      void this.#fetchGroups(undefined)
      return
    }
    const grouping = this.#grouping()
    if (!grouping) return
    const bottom = grouping.levels.length - 1
    for (const node of grouping.nodes.values()) {
      if (node.position >= 0 && node.level < bottom && this.#isGroupExpanded(node.key) && !this.#remoteGroups.has(node.key)) void this.#fetchGroups(node)
    }
    const offset = this.#pageStart
    const { start, end } = this.#virtualizer.range
    for (let line = offset + start; line < Math.min(offset + end, offset + this.rowCount); line++) {
      const item = grouping.items[line]
      if (item?.kind !== 'row' || grouping.source[item.rowIndex] !== undefined || !item.parent.range) continue
      void this.#fetchGroupRows(item.parent, Math.floor((item.rowIndex - item.parent.range.start) / this.blockSize))
    }
  }

  async #fetchGroups(parent: GroupNode | undefined) {
    const dataSource = this.dataSource
    const key = parent?.key ?? ''
    const pending = `groups:${key}`
    const level = parent ? parent.level + 1 : 0
    const spec = this.#groupLevels()[level]
    if (!dataSource?.getGroups || !spec || this.#remotePending.has(pending)) return
    this.#remotePending.add(pending)
    const token = this.#requestToken
    try {
      const result = await dataSource.getGroups({
        level,
        groupBy: { field: spec.field, ...(typeof spec.sort === 'string' ? { sort: spec.sort } : {}), ...(spec.sortBy ? { sortBy: spec.sortBy } : {}) },
        parent: this.#groupPath(parent),
        sort: this.sortModel,
        ...(this.quickFilter ? { filter: this.quickFilter } : {}),
      })
      if (token !== this.#requestToken) return
      const groups: RemoteGroup[] = Array.isArray(result?.groups) ? result.groups : []
      this.#remoteGroups.set(key, groups)
      if (!parent) this.remoteTotal = groups.reduce((sum, group) => sum + Math.max(0, Math.floor(group.count) || 0), 0)
      this.#remoteVersion++
      this.requestUpdate()
    } catch (error) {
      if (token === this.#requestToken) {
        this.error = error instanceof Error ? error.message : String(error)
        if (this.remoteTotal < 0) this.remoteTotal = 0
      }
    } finally {
      if (token === this.#requestToken) this.#remotePending.delete(pending)
    }
  }

  async #fetchGroupRows(node: GroupNode, block: number) {
    const dataSource = this.dataSource
    const pending = `rows:${node.key}#${block}`
    if (!dataSource || this.#remotePending.has(pending) || this.#remoteGroupRows.get(node.key)?.has(block)) return
    this.#remotePending.add(pending)
    const token = this.#requestToken
    const size = this.blockSize
    try {
      const result = await dataSource.getRows({
        start: block * size,
        count: Math.max(0, Math.min(size, node.count - block * size)),
        sort: this.sortModel,
        group: this.#groupPath(node),
        ...(this.quickFilter ? { filter: this.quickFilter } : {}),
      })
      if (token !== this.#requestToken) return
      const blocks = this.#remoteGroupRows.get(node.key) ?? new Map<number, TableRow[]>()
      blocks.set(block, result?.rows ?? [])
      this.#remoteGroupRows.set(node.key, blocks)
      this.#remoteVersion++
      this.requestUpdate()
    } catch (error) {
      if (token === this.#requestToken) this.error = error instanceof Error ? error.message : String(error)
    } finally {
      if (token === this.#requestToken) this.#remotePending.delete(pending)
    }
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
    const start = pageScope ? this.#pageStart : 0
    const count = !aggregatable ? 0 : pageScope ? this.rowCount : (this.#transitionRows ?? this.#sortedRows).length
    const inputs = [
      columns.length,
      ...columns.map((column) => column.summary),
      this.columnElements,
      this.columns,
      this.summaryValues,
      this.#sortedRows,
      this.#transitionRows,
      this.#animationProgress,
      this.dataSource ? this.#blocks.get(this.page - 1) : undefined,
      pageScope ? this.#grouping()?.items : undefined,
      start,
      count,
    ]
    const cached = this.#summaryCache
    if (cached && cached.inputs.length === inputs.length && cached.inputs.every((input, index) => input === inputs[index])) return cached

    const rows: TableRow[] = []
    for (let cursor = start; cursor < start + count; cursor++) {
      // The page is made of display lines, so while grouped its rows are those on the page's data lines.
      const index = pageScope ? this.#rowIndexAt(cursor) : cursor
      const row = this.#rowAt(index)
      // A row collapsing out during an animated update is already gone from the data, so it no longer counts.
      if (row && this.#rowUpdateStates.get(this.#keyAt(index, row)) !== 'removed') rows.push(row)
    }
    const values = new Map<string, unknown>()
    for (const column of columns) {
      const key = columnKey(column)
      if (this.summaryValues && Object.prototype.hasOwnProperty.call(this.summaryValues, key)) values.set(key, this.summaryValues[key])
      // Without rows to aggregate a sum would still read 0 — a figure, and a wrong one. Leave the cell to its label.
      else if (!aggregatable) continue
      else if (typeof column.summary === 'function') values.set(key, column.summary({ column, rows }))
      else if (column.summary && column.field)
        values.set(
          key,
          aggregate(
            column.summary,
            rows.map((row) => getFieldValue(row, column.field)),
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
      // A count is a number of rows, not an amount: a currency or date column must not format it as one.
      content =
        column.summary === 'count' && !explicit
          ? this.#formatValue({ field: column.field, format: 'number', locale: column.locale }, value)
          : this.#formatValue(column, value)
    } else content = column.summaryLabel ?? ''

    const focused = this.focusedCell.row === SUMMARY_ROW && this.focusedCell.column >= index && this.focusedCell.column < index + span
    const part = key.replace(/[^\w-]/g, '-')
    return html`
      <div
        class=${classMap({
          cell: true,
          'cell--summary': true,
          [`cell--align-${column.summaryAlign ?? column.align ?? 'start'}`]: true,
          'cell--selection': isSynthetic(column),
          ...this.#pinClasses(column, pins),
          ...(column.cellClass ? { [column.cellClass]: true } : {}),
        })}
        role="gridcell"
        part="summary-cell summary-cell-${part}"
        aria-colindex=${index + 1}
        aria-colspan=${ifDefined(span > 1 ? span : undefined)}
        tabindex=${focused ? 0 : -1}
        style=${styleMap({ ...this.#pinStyle(column, pins), ...(span > 1 ? { 'grid-column': `span ${span}` } : {}) })}
        @click=${() => (this.focusedCell = { row: SUMMARY_ROW, column: index })}
      >
        ${isSynthetic(column) ? nothing : html`<span class="cell-content" part="summary-content summary-content-${part}">${content}</span>`}
      </div>
    `
  }

  /** The columns the grid draws: the checkbox and detail columns the table adds, then the resolved columns. */
  #renderColumns(): TableColumnConfig[] {
    const columns = this.resolvedColumns
    const synthetic: TableColumnConfig[] = []
    if (this.checkboxSelection) {
      synthetic.push({
        field: SELECTION_FIELD,
        header: '',
        width: 'var(--c2-table__selection-cell--width, 44px)',
        minWidth: 32,
        align: 'center',
        pinned: 'start',
      })
    }
    if (typeof this.renderDetail === 'function') {
      synthetic.push({
        field: DETAIL_FIELD,
        header: '',
        width: 'var(--c2-table__detail-toggle-cell--width, 40px)',
        minWidth: 32,
        align: 'center',
        pinned: 'start',
      })
    }
    return synthetic.length ? [...synthetic, ...columns] : columns
  }

  #autoColumns(): TableColumnConfig[] {
    const first = Array.isArray(this.rows) ? this.rows[0] : undefined
    if (!first) return []
    return Object.keys(first).map((field) => ({ field, header: humanize(field) }))
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

  #pinClasses(column: TableColumnConfig, pins: Map<string, PinPlacement>): Record<string, boolean> {
    const pin = pins.get(columnKey(column))
    if (!pin) return {}
    return {
      'cell--pinned': true,
      'cell--pinned-edge-start': pin.side === 'start' && pin.edge,
      'cell--pinned-edge-end': pin.side === 'end' && pin.edge,
    }
  }

  #pinStyle(column: TableColumnConfig, pins: Map<string, PinPlacement>): Record<string, string> {
    const pin = pins.get(columnKey(column))
    if (!pin) return {}
    return pin.side === 'start' ? { left: `${pin.offset}px` } : { right: `${pin.offset}px` }
  }

  #tabIndexFor(rowIndex: number, columnIndex: number): number {
    return this.focusedCell.row === rowIndex && this.focusedCell.column === columnIndex ? 0 : -1
  }

  #formatValue(column: TableColumnConfig, value: unknown): string {
    if (value === null || value === undefined || value === '') return ''
    const format = column.format ?? 'text'
    if (format === 'text') return String(value)
    const id = `${format}|${column.locale ?? ''}|${column.currency ?? ''}|${column.formatOptions ? JSON.stringify(column.formatOptions) : ''}`
    let entry = this.#formatters.get(column)
    if (!entry || entry.key !== id) {
      entry = { key: id, format: createFormatter(column, format) }
      this.#formatters.set(column, entry)
    }
    try {
      return entry.format(value)
    } catch {
      return String(value)
    }
  }

  #countFormat?: { locale: string; format: Intl.NumberFormat }

  /** A group's row count, grouped by thousands in the table's language. */
  #formatCount(count: number): string {
    const locale = this.msg.locale
    if (this.#countFormat?.locale !== locale) {
      try {
        this.#countFormat = { locale, format: new Intl.NumberFormat(locale) }
      } catch {
        return String(count)
      }
    }
    return this.#countFormat.format.format(count)
  }

  /** `index` is the row's position in the whole dataset, on every page. */
  #rowAt(index: number): TableRow | undefined {
    if (index < 0) return undefined
    if (this.dataSource) {
      const grouping = this.groupBy?.length ? this.#grouping() : undefined
      if (grouping?.remote) return grouping.source[index]
      const size = this.#effectiveBlockSize
      return this.#blocks.get(Math.floor(index / size))?.[index % size]
    }
    const row = (this.#transitionRows ?? this.#sortedRows)[index]
    if (!row || this.#animationFrom.size === 0 || this.#animationProgress >= 1) return row
    const from = this.#animationFrom.get(this.#keyAt(index, row))
    return from ? (interpolateValue(from, row, this.#animationProgress) as TableRow) : row
  }

  /** The row at `index` as the application gave it: `#rowAt` without the interpolation of an animated update. */
  #sourceRowAt(index: number): TableRow | undefined {
    if (index < 0) return undefined
    if (this.dataSource) return this.#rowAt(index)
    return (this.#transitionRows ?? this.#sortedRows)[index]
  }

  #keyAt(index: number, row: TableRow): string {
    return this.#identityOf(row) ?? String(index)
  }

  /** The key a row carries itself, from `getRowKey` or `row-key`; `undefined` when it has none and only its position identifies it. */
  #identityOf(row: TableRow): string | undefined {
    const value = this.getRowKey ? this.getRowKey(row) : this.rowKey ? getFieldValue(row, this.rowKey) : undefined
    return value === null || value === undefined || value === '' ? undefined : String(value)
  }

  get #hasRowIdentity(): boolean {
    return Boolean(this.getRowKey || this.rowKey)
  }

  /** A selectable table without a key selects positions, which re-point at other rows after a sort. Say so, once. */
  #warnPositionalKeys() {
    if (this.#warnedPositionalKeys || this.#hasRowIdentity || this.selection === 'none' || this.rowCount === 0) return
    this.#warnedPositionalKeys = true
    console.warn(
      `[c2-table] selection="${this.selection}" without row-key: a row's key is its position, so the selection moves to other rows when they are sorted or replaced. Set row-key (or getRowKey) to the field that identifies a row.`,
    )
  }

  #applySort() {
    const rows = Array.isArray(this.rows) ? this.rows : []
    this.#unfilteredCount = rows.length
    this.#sortedRows = this.#sortRows(rows)
  }

  /**
   * Keeps the rows `filter` accepts and `quickFilter` matches. A quick-filter word may occur in a cell's raw value or
   * in its formatted text, so `1,200` and `1200` both find an amount. A data source filters on the server.
   */
  #filterRows(rows: TableRow[]): TableRow[] {
    if (this.dataSource) return rows
    const terms = filterTerms(this.quickFilter)
    const predicate = this.filter
    if (!terms.length && typeof predicate !== 'function') return rows
    const columns = terms.length ? this.resolvedColumns.filter((column) => column.field && column.filterable !== false) : []
    const texts = (row: TableRow) =>
      columns.flatMap((column) => {
        const value = getFieldValue(row, column.field)
        const raw = plainText(value).toLocaleLowerCase()
        const shown = this.#formatValue(column, value).toLocaleLowerCase()
        return shown === raw ? [raw] : [raw, shown]
      })
    return rows.filter((row) => (typeof predicate !== 'function' || predicate(row)) && (!terms.length || matchesTerms(terms, texts(row))))
  }

  /** Filters, sorts by `sortModel`, then, while grouped, gathers the rows of each group together in the order of the groups. */
  #sortRows(rows: TableRow[]): TableRow[] {
    const sorted = this.#sortBySortModel(this.#filterRows(rows))
    const levels = this.groupBy?.length ? this.#groupLevels() : []
    if (this.dataSource || !levels.length) return sorted
    const ordered: TableRow[] = []
    const visit = (node: GroupNode) => {
      if (node.children.length) node.children.forEach(visit)
      else for (const index of node.rowIndices) ordered.push(sorted[index])
    }
    this.#buildTree(sorted, levels).roots.forEach(visit)
    return ordered
  }

  /** The grouping levels, normalized from `groupBy`; empty when the table is not grouped. */
  #groupLevels(): TableGroupBy[] {
    if (!Array.isArray(this.groupBy)) return []
    return this.groupBy
      .map((entry) => (typeof entry === 'string' ? { field: entry.trim() } : entry))
      .filter((entry): entry is TableGroupBy => Boolean(entry && typeof entry.field === 'string' && entry.field))
  }

  /** Whether the rows come from a data source that groups them itself (`getGroups`). */
  get #remoteGrouping(): boolean {
    return Boolean(this.dataSource && typeof this.dataSource.getGroups === 'function' && this.#groupLevels().length)
  }

  /**
   * The group tree and the display list, or `undefined` when the rows are not grouped. Cached in two layers on their
   * inputs: the tree only depends on the rows and the levels, and opening a group should not re-bucket 10k rows.
   */
  #grouping(): Grouping | undefined {
    // Read per rendered row, so an ungrouped table leaves before allocating anything.
    if (!this.groupBy?.length) return undefined
    const levels = this.#groupLevels()
    if (!levels.length) return undefined
    const remote = Boolean(this.dataSource)
    if (remote && typeof this.dataSource?.getGroups !== 'function') return undefined
    const source = remote ? undefined : (this.#transitionRows ?? this.#sortedRows)
    const treeInputs = [
      source,
      this.groupBy,
      this.sortModel,
      this.columnElements,
      this.columns,
      this.rowKey,
      this.getRowKey,
      this.dataSource,
      this.#remoteVersion,
    ]
    const itemInputs = [this.expandedGroups, this.collapsedGroups, this.groupsCollapsed]
    const cached = this.#groupingCache
    const sameTree = cached && cached.treeInputs.every((input, index) => input === treeInputs[index])
    if (sameTree && cached.itemInputs.every((input, index) => input === itemInputs[index])) return cached.grouping

    const tree: GroupTree = sameTree
      ? cached.grouping
      : source
        ? this.#buildTree(source, levels)
        : buildRemoteGroupTree(levels, this.#remoteGroups, (key) => this.#remoteGroupRows.get(key), this.blockSize)
    const items = flattenGroups(tree, (node) => this.#isGroupExpanded(node.key))
    const grouping: Grouping = { levels: tree.levels, source: tree.source, roots: tree.roots, nodes: tree.nodes, items, remote }
    this.#groupingCache = { treeInputs, itemInputs, grouping }
    return grouping
  }

  #buildTree(source: TableRow[], levels: TableGroupBy[]): GroupTree {
    return buildGroupTree(
      source,
      levels,
      (row, spec) => (spec.getValue ? spec.getValue(row) : getFieldValue(row, spec.field)),
      (spec, nodes) => this.#orderGroups(spec, nodes, source),
    )
  }

  /**
   * Orders the sibling groups of one level: by `compare` on the whole groups, by the aggregate `sortBy` names, or by
   * their value — the level's `sort`, else the direction the table is sorted by that field, else ascending.
   */
  #orderGroups(spec: TableGroupBy, nodes: GroupNode[], source: TableRow[]): GroupNode[] {
    const tree = { source }
    if (typeof spec.compare === 'function') {
      const compare = spec.compare
      const contexts = new Map(nodes.map((node) => [node, this.#groupContext(node, tree)]))
      return nodes.sort((left, right) => compare(contexts.get(left)!, contexts.get(right)!))
    }
    if (spec.sortBy) {
      const id = spec.sortBy
      const byCount = id === 'count' && !this.allColumns.some((column) => columnKey(column) === 'count')
      const value = (node: GroupNode) => (byCount ? node.count : this.#groupSummary(node, tree).get(id))
      const direction = spec.sort === 'desc' ? -1 : 1
      return nodes.sort((left, right) => direction * defaultCompare(value(left), value(right)))
    }
    const comparator = this.#groupComparator(spec)
    return nodes.sort((left, right) => comparator(left.value, right.value))
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

  #expansionCache?: { inputs: unknown[]; isOpen: (key: string) => boolean }

  /** Whether the group with `key` is open; the key lists are turned into sets once per change, not searched per row. */
  #isGroupExpanded(key: string): boolean {
    const inputs = [this.expandedGroups, this.collapsedGroups, this.groupsCollapsed]
    const cached = this.#expansionCache
    if (!cached || cached.inputs.some((input, index) => input !== inputs[index])) {
      this.#expansionCache = { inputs, isOpen: expansionResolver(this.#expansion) }
    }
    return this.#expansionCache!.isOpen(key)
  }

  get #expansion() {
    return {
      expanded: Array.isArray(this.expandedGroups) ? this.expandedGroups : undefined,
      collapsed: Array.isArray(this.collapsedGroups) ? this.collapsedGroups : undefined,
      collapsedByDefault: this.groupsCollapsed,
    }
  }

  #setGroupExpanded(key: string, expanded: boolean): boolean {
    const grouping = this.#grouping()
    if (!grouping?.nodes.has(key) || this.#isGroupExpanded(key) === expanded) return false
    // Only the exception to the default is written, so a group that appears later follows the default.
    const next = toggleExpansion(this.#expansion, key, expanded)
    if (next.expanded !== this.expandedGroups) this.expandedGroups = next.expanded ? [...next.expanded] : undefined
    if (next.collapsed !== this.collapsedGroups) this.collapsedGroups = next.collapsed ? [...next.collapsed] : undefined
    return true
  }

  #toggleGroup(node: GroupNode) {
    const expanded = !this.#isGroupExpanded(node.key)
    if (!this.#setGroupExpanded(node.key, expanded)) return
    const grouping = this.#grouping()
    if (!grouping) return
    const label = this.#groupText(node)
    this.#announce(expanded ? this.msg.t('groupExpanded', label, node.count) : this.msg.t('groupCollapsed', label))
    this.dispatchEvent(
      new CustomEvent<TableGroupToggleEventDetail>('group-toggle', {
        detail: { key: node.key, expanded, group: this.#groupContext(node, grouping) },
        bubbles: false,
        composed: true,
      }),
    )
  }

  /** The group's rows: all of them, or for a data source those fetched so far. */
  #groupRows(node: GroupNode, tree: { source: (TableRow | undefined)[] }): TableRow[] {
    node.rows ??= node.range
      ? tree.source.slice(node.range.start, node.range.start + node.range.count).filter((row): row is TableRow => row !== undefined)
      : node.rowIndices.map((index) => tree.source[index] as TableRow)
    return node.rows
  }

  #groupKeys(node: GroupNode, tree: { source: (TableRow | undefined)[] }): string[] {
    node.keys ??= node.rowIndices.map((index) => this.#keyAt(index, tree.source[index] as TableRow))
    return node.keys
  }

  #groupContext(node: GroupNode, tree: { source: (TableRow | undefined)[] }): TableGroupContext {
    return {
      key: node.key,
      level: node.level,
      field: node.field,
      value: node.value,
      rows: this.#groupRows(node, tree),
      count: node.count,
      expanded: this.#isGroupExpanded(node.key),
      summary: Object.fromEntries(this.#groupSummary(node, tree)),
    }
  }

  /** The aggregate a column shows on group rows: its `group-summary`, else its `summary`; `undefined` for none. */
  #groupAggregate(column: TableColumnConfig): TableSummaryAggregate | TableSummaryFunction | undefined {
    const kind = column.groupSummary ?? column.summary
    return kind === 'none' ? undefined : kind
  }

  /**
   * The column aggregates of a group's rows, keyed by column id — hidden columns included, so a level can be ordered
   * by one. A data source's groups carry their own.
   */
  #groupSummary(node: GroupNode, tree: { source: (TableRow | undefined)[] }): Map<string, unknown> {
    if (node.range) return new Map(Object.entries(node.remoteSummary ?? {}))
    const columns = this.allColumns
    const inputs = [this.columnElements, this.columns, ...columns.map((column) => this.#groupAggregate(column))]
    const cached = node.summary
    if (cached && cached.inputs.length === inputs.length && cached.inputs.every((input, index) => input === inputs[index])) return cached.values
    const rows = this.#groupRows(node, tree)
    const values = new Map<string, unknown>()
    for (const column of columns) {
      const kind = this.#groupAggregate(column)
      if (typeof kind === 'function') values.set(columnKey(column), kind({ column, rows }))
      else if (kind && column.field)
        values.set(
          columnKey(column),
          aggregate(
            kind,
            rows.map((row) => getFieldValue(row, column.field)),
          ),
        )
    }
    node.summary = { inputs, values }
    return values
  }

  /** A group's label as text: for the checkbox's name and the announcements, whatever `renderGroup` draws. */
  #groupText(node: GroupNode): string {
    const empty = node.value === null || node.value === undefined || node.value === ''
    if (empty) return this.emptyGroupLabel || this.msg.t('noValue')
    const column = this.#fieldColumn(node.field)
    return column ? this.#formatValue(column, node.value) : plainText(node.value)
  }

  /**
   * Blank lines above a page that starts inside a group, where that group's headers are repeated. Every page counts
   * `pageSize` lines of its own; the repeated headers come on top.
   */
  #pagePrefix(grouping: Grouping): number {
    return this.paginated && this.#pageStart > 0 ? depthOf(grouping.items[this.#pageStart]) : 0
  }

  /**
   * The groups whose own row has scrolled past the header (or sits on an earlier page) while lines of theirs are
   * still on screen, outermost first. They are drawn stuck under the header, one line per level, the way CSS sticky
   * would place them — the real rows cannot do it themselves, as the virtualizer drops them once off screen.
   */
  #stuckGroups(grouping: Grouping): GroupNode[] {
    const count = this.rowCount
    if (count === 0) return []
    const start = this.#pageStart
    const end = start + count - 1
    const scrollTop = Math.max(0, this.viewport?.scrollTop ?? 0)
    // `base + level` is the line behind the level's slot under the header; the page's blank lines come first.
    const base = start + Math.floor(scrollTop / this.#rowHeightPx) - this.#pagePrefix(grouping)
    const stuck: GroupNode[] = []
    for (let level = 0; level < grouping.levels.length; level++) {
      const line = Math.min(end, Math.max(start, base + level))
      const node = groupAtLevel(grouping.items[line], level)
      if (!node || node.position >= Math.max(start, base + level)) break
      stuck.push(node)
    }
    return stuck
  }

  #handleViewportScroll = () => {
    const grouping = this.#grouping()
    if (!grouping) return
    const signature = this.#stuckGroups(grouping)
      .map((node) => node.key)
      .join('\n')
    if (signature !== this.#echoSignature) this.requestUpdate()
  }

  /** The data row index on display line `line`, or -1 for a group row. Lines and rows are the same thing ungrouped. */
  #rowIndexAt(line: number): number {
    const grouping = this.#grouping()
    if (!grouping) return line
    const item = grouping.items[line]
    return item?.kind === 'row' ? item.rowIndex : -1
  }

  /** Scrolls display line `line` into view, below the header and, while grouped, below the groups stuck under it. */
  #scrollToLine(line: number) {
    const grouping = this.#grouping()
    // Wrapped rows have their own heights, so the uniform-height arithmetic below would aim at the wrong place; every
    // row is rendered then, so scroll to the row itself.
    if (this.wrap) {
      const viewport = this.viewport
      const element = this.renderRoot.querySelector<HTMLElement>(
        `.row--body[aria-rowindex="${line + 2}"], .row--group:not(.row--group-echo)[aria-rowindex="${line + 2}"]`,
      )
      if (!viewport || !element) return
      const header = this.#headerHeight()
      const top = element.getBoundingClientRect().top - viewport.getBoundingClientRect().top
      const bottom = top + element.getBoundingClientRect().height
      if (top < header) viewport.scrollTop += top - header
      else if (bottom > viewport.clientHeight) viewport.scrollTop += bottom - viewport.clientHeight
      return
    }
    if (!grouping) {
      this.#virtualizer.scrollToIndex(line - this.#pageStart, this.#headerHeight())
      return
    }
    const viewport = this.viewport
    if (!viewport) return
    const height = this.#rowHeightPx
    const top = (line - this.#pageStart + this.#pagePrefix(grouping)) * height
    const covered = depthOf(grouping.items[line]) * height
    const visible = viewport.clientHeight - this.#headerHeight()
    if (top - covered < viewport.scrollTop) viewport.scrollTop = Math.max(0, top - covered)
    else if (top + height > viewport.scrollTop + visible) viewport.scrollTop = top + height - visible
  }

  #sortBySortModel(rows: TableRow[]): TableRow[] {
    if (this.dataSource || this.sortModel.length === 0) return rows
    const columns = this.resolvedColumns
    return [...rows].sort((left, right) => {
      for (const entry of this.sortModel) {
        const column = columns.find((candidate) => candidate.field === entry.field)
        const comparator = column?.comparator ?? defaultCompare
        const result = comparator(getFieldValue(left, entry.field), getFieldValue(right, entry.field))
        if (result !== 0) return entry.direction === 'desc' ? -result : result
      }
      return 0
    })
  }

  #prepareRowsAnimation(previous: unknown) {
    const displayedPrevious = Array.isArray(previous)
      ? previous.map((row, index) => {
          if (!isRecord(row) || this.#animationFrom.size === 0 || this.#animationProgress >= 1) return row
          const from = this.#animationFrom.get(this.#keyAt(index, row))
          return from ? (interpolateValue(from, row, this.#animationProgress) as TableRow) : row
        })
      : previous
    this.#cancelRowsAnimation()
    if (
      !this.hasUpdated ||
      !this.animateUpdates ||
      this.updateDuration <= 0 ||
      !Array.isArray(displayedPrevious) ||
      !Array.isArray(this.rows) ||
      typeof requestAnimationFrame === 'undefined' ||
      (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches)
    ) {
      return
    }

    const previousByKey = new Map<string, TableRow>()
    displayedPrevious.forEach((row, index) => {
      if (isRecord(row)) previousByKey.set(this.#keyAt(index, row), row)
    })
    const nextKeys = new Set(this.rows.map((row, index) => this.#keyAt(index, row)))
    const previousKeys = new Set(previousByKey.keys())
    const hasAdded = this.rows.some((row, index) => !previousKeys.has(this.#keyAt(index, row)))
    const hasRemoved = displayedPrevious.some((row, index) => isRecord(row) && !nextKeys.has(this.#keyAt(index, row)))
    const hasModified = this.rows.some((row, index) => hasNumericChange(previousByKey.get(this.#keyAt(index, row)), row))
    if (!hasAdded && !hasRemoved && !hasModified) return

    this.#animationFrom = previousByKey
    this.#animationProgress = 0
    this.rows.forEach((row, index) => {
      const key = this.#keyAt(index, row)
      const from = previousByKey.get(key)
      if (!from) {
        this.#rowUpdateStates.set(key, 'added')
        return
      }
      if (!hasNumericChange(from, row)) return
      const watchedFrom = this.updateHighlightField ? getFieldValue(from, this.updateHighlightField) : from
      const watchedTo = this.updateHighlightField ? getFieldValue(row, this.updateHighlightField) : row
      const delta = firstNumericDelta(watchedFrom, watchedTo)
      this.#rowUpdateStates.set(key, delta === undefined ? 'modified' : delta > 0 ? 'increased' : 'decreased')
    })

    // A stable key lets a removed row remain in its former visual position long enough to collapse. Without one,
    // identity is positional, so structural updates stay immediate while numeric modification can still interpolate.
    if (this.#hasRowIdentity && !this.paginated) {
      const previousRows = this.#sortRows(displayedPrevious.filter(isRecord))
      const transitionRows = [...this.#sortRows(this.rows)]
      previousRows.forEach((row, index) => {
        const key = this.#keyAt(index, row)
        if (nextKeys.has(key)) return
        transitionRows.splice(Math.min(index, transitionRows.length), 0, row)
        this.#rowUpdateStates.set(key, 'removed')
      })
      this.#transitionRows = transitionRows
    }

    let started: number | undefined
    const draw = (now: number) => {
      started ??= now
      const progress = Math.min(1, (now - started) / this.updateDuration)
      this.#animationProgress = 1 - Math.pow(1 - progress, 3)
      this.requestUpdate()
      if (progress < 1) this.#animationFrame = requestAnimationFrame(draw)
      else {
        this.#animationFrame = undefined
        this.#animationFrom.clear()
        this.#transitionRows = undefined
        this.#rowUpdateStates.clear()
        this.requestUpdate()
      }
    }
    this.#animationFrame = requestAnimationFrame(draw)
  }

  #cancelRowsAnimation() {
    if (this.#animationFrame !== undefined) cancelAnimationFrame(this.#animationFrame)
    this.#animationFrame = undefined
    this.#animationFrom.clear()
    this.#animationProgress = 1
    this.#transitionRows = undefined
    this.#rowUpdateStates.clear()
  }

  #resetRemote() {
    this.#requestToken++
    this.#blocks.clear()
    this.#pendingBlocks.clear()
    this.#remoteGroups.clear()
    this.#remoteGroupRows.clear()
    this.#remotePending.clear()
    this.#remoteVersion++
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
      const size = this.#effectiveBlockSize
      const result = await dataSource.getRows({ start: block * size, count: size, sort: this.sortModel })
      if (token !== this.#requestToken) return
      this.#blocks.set(block, result.rows ?? [])
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
    this.#pendingFocus = true
    this.#pendingFocusOptions = options
  }

  override connectedCallback() {
    super.connectedCallback()
    this.addEventListener(COLUMN_CHANGE_EVENT, this.#handleColumnChange)
    this.addEventListener(PAGER_CONNECT_EVENT, this.#handlePagerConnect)
    // The table speaks for its pager: swallow the pager's own events so a consumer sees one `page-change`, from here.
    this.addEventListener('page-change', this.#handlePagerEvent)
    this.addEventListener('page-size-change', this.#handlePagerEvent)
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    this.#cancelRowsAnimation()
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
    if (isSynthetic(column) || !column.field) return
    if (!(column.sortable ?? this.sortable)) return
    const existing = this.sortModel.find((entry) => entry.field === column.field)
    const direction: SortDirection | undefined = !existing ? 'asc' : existing.direction === 'asc' ? 'desc' : undefined
    const rest = additive && this.multiSort ? this.sortModel.filter((entry) => entry.field !== column.field) : []
    this.sortModel = direction ? [...rest, { field: column.field, direction }] : rest
    const header = this.#headerText(column)
    this.#announce(
      direction === 'asc'
        ? this.msg.t('sortedAscending', header)
        : direction === 'desc'
          ? this.msg.t('sortedDescending', header)
          : this.sortModel.length
            ? this.msg.t(
                this.sortModel[0].direction === 'asc' ? 'sortedAscending' : 'sortedDescending',
                this.#headerText(this.#fieldColumn(this.sortModel[0].field) ?? { field: this.sortModel[0].field }),
              )
            : this.msg.t('sortCleared'),
    )
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
    const index = this.#rowIndexAt(line)
    const row = this.#rowAt(index)
    if (!row) return
    const key = this.#keyAt(index, row)
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
    const rowIndex = this.#rowIndexAt(line)
    const row = this.#rowAt(rowIndex)
    if (!row) return
    this.focusedCell = { row: line, column: columnIndex }
    this.dispatchEvent(
      new CustomEvent<TableCellEventDetail>('cell-click', {
        detail: { row, rowIndex, key: this.#keyAt(rowIndex, row), column, value },
        bubbles: true,
        composed: true,
      }),
    )
  }

  /** An enclosing `c2-context-menu` asks what was right-clicked: the cell, with the same detail as `cell-click`. */
  #handleContextMenuRequest(event: Event, line: number, columnIndex: number, column: TableColumnConfig, value: unknown) {
    const rowIndex = this.#rowIndexAt(line)
    const row = this.#rowAt(rowIndex)
    if (!row) return
    this.focusedCell = { row: line, column: columnIndex }
    provideContextMenuData(event, this, { row, rowIndex, key: this.#keyAt(rowIndex, row), column, value } satisfies TableCellEventDetail)
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
    const index = this.#rowIndexAt(line)
    const row = this.#rowAt(index)
    if (!row) return
    const key = this.#keyAt(index, row)

    // Clicking the row that is the selection again clears it — with a modifier or without — so a selection can be
    // undone by the same gesture that made it.
    if (this.selection === 'single') {
      this.#selectionAnchor = line
      this.#commitSelection(this.value.includes(key) ? [] : [key])
      return
    }

    if (modifiers.range && this.#selectionAnchor >= 0) {
      const from = Math.min(this.#selectionAnchor, line)
      const to = Math.max(this.#selectionAnchor, line)
      const keys = new Set(modifiers.toggle ? this.value : [])
      for (let cursor = from; cursor <= to; cursor++) {
        const cursorIndex = this.#rowIndexAt(cursor)
        const rangeRow = this.#rowAt(cursorIndex)
        if (rangeRow) keys.add(this.#keyAt(cursorIndex, rangeRow))
      }
      this.#commitSelection([...keys])
      return
    }

    this.#selectionAnchor = line
    if (modifiers.toggle) {
      this.#commitSelection(this.value.includes(key) ? this.value.filter((entry) => entry !== key) : [...this.value, key])
      return
    }
    // A plain click narrows the selection to one row; on the row that already is the whole selection, it clears it.
    this.#commitSelection(this.value.length === 1 && this.value[0] === key ? [] : [key])
  }

  #commitSelection(keys: string[]) {
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
    if (this.#isFromCellControl(event)) return
    // A row's detail is the application's content: its keys are its own.
    if (event.composedPath().some((node) => node instanceof Element && node.classList.contains('row--detail'))) return
    if (this.editing) return
    let { row, column } = this.focusedCell
    const current = columns[column]

    // Ctrl+Shift+←/→ (⌘⇧ on macOS) on a header moves its column.
    if (
      row === HEADER_ROW &&
      this.reorderable &&
      event.shiftKey &&
      (event.ctrlKey || event.metaKey) &&
      (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
    ) {
      event.preventDefault()
      if (!current || isSynthetic(current)) return
      const peers = this.resolvedColumns.filter((candidate) => (candidate.pinned ?? '') === (current.pinned ?? ''))
      const at = peers.indexOf(current)
      const neighbour = peers[at + (event.key === 'ArrowRight' ? 1 : -1)]
      if (!neighbour || !this.#reorderFromUser(columnKey(current), columnKey(neighbour), event.key === 'ArrowRight')) return
      this.focusedCell = { row, column: this.#renderColumns().findIndex((candidate) => columnKey(candidate) === columnKey(current)) }
      this.#pendingFocus = true
      return
    }

    const dataLine = row >= 0 && this.#rowIndexAt(row) >= 0
    if (dataLine && current?.field === DETAIL_FIELD && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault()
      this.#toggleDetailFromUser(row)
      return
    }
    // F2, Enter or a typed character opens the editor of an editable cell; typing replaces the value.
    if (dataLine && this.#isEditable(current) && !event.altKey && !event.ctrlKey && !event.metaKey) {
      const typed = event.key.length === 1 && event.key !== ' '
      if (event.key === 'F2' || event.key === 'Enter' || typed) {
        event.preventDefault()
        this.#beginEdit(row, column, typed ? event.key : undefined)
        return
      }
    }
    // Keyboard movement stays inside the page: rows are numbered across the whole dataset, so page 2 starts at
    // `first`, not at 0.
    const first = this.#pageStart
    const last = first + this.rowCount - 1
    // Rows per viewport, for PageUp/PageDown — unrelated to the `pageSize` property, which is rows per data page.
    const viewportRows = Math.max(1, Math.floor((this.viewport?.clientHeight ?? 0) / this.#rowHeightPx) - 1)
    const summary = this.#hasSummary(columns)
    // A spanning summary cell covers several column indices; on that row, left/right move from cell to cell.
    const summaryCells = summary ? this.#summaryCells(columns) : []
    const summaryCellAt = (index: number) => [...summaryCells].reverse().find((cell) => cell.index <= index) ?? summaryCells[0]
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
      this.#pendingFocus = true
      this.#scrollToLine(row)
      return
    }
    if (groupNode && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault()
      this.#toggleGroup(groupNode)
      return
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
      case 'Enter':
      case ' ': {
        event.preventDefault()
        if (row === SUMMARY_ROW) return
        if (row === HEADER_ROW) {
          this.#toggleSort(columns[column], event.shiftKey)
          return
        }
        if (event.key === 'Enter') {
          const index = this.#rowIndexAt(row)
          const data = this.#rowAt(index)
          if (data) this.#activateRow(index, data, this.#keyAt(index, data))
        }
        if (this.selection !== 'none') this.#applySelection(row, { toggle: event.key === ' ' || event.ctrlKey || event.metaKey, range: event.shiftKey })
        return
      }
      default:
        return
    }

    event.preventDefault()
    this.focusedCell = { row, column }
    this.#pendingFocus = true
    if (row >= 0) this.#scrollToLine(row)
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
    if (event.key === 'Enter' || event.key === ' ') return true
    return origin.matches(
      'input:not([type="checkbox"], [type="radio"], [type="button"], [type="submit"], [type="reset"]), textarea, select, [contenteditable=""], [contenteditable="true"]',
    )
  }

  #headerHeight(): number {
    return this.renderRoot.querySelector('.row--header')?.getBoundingClientRect().height ?? 0
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

  /** Where the stuck group rows start: right under the header, whose height is themed. */
  #measureHeaderHeight() {
    if (!this.#grouping()) return
    const height = this.#headerHeight()
    if (height > 0 && Math.abs(height - this.#headerHeightPx) > 0.01) {
      this.#headerHeightPx = height
      this.requestUpdate()
    }
  }

  #measureViewportWidth() {
    if (typeof this.renderDetail !== 'function' || !this.expandedRows.length) return
    const width = this.viewport?.clientWidth ?? 0
    if (width > 0 && width !== this.#viewportWidth) {
      this.#viewportWidth = width
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
    const offset = this.#pageStart
    const start = offset + this.#virtualizer.range.start
    const end = offset + this.#virtualizer.range.end
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
