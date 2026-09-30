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
import { COLUMN_CHANGE_EVENT, TableColumn } from './table-column.js'
import {
  getFieldValue,
  groupByConverter,
  sortModelConverter,
  type ColumnPin,
  type SortDirection,
  type SortModel,
  type TableCellEventDetail,
  type TableColumnConfig,
  type TableColumnResizeEventDetail,
  type TableDataSource,
  type TableGroupBy,
  type TableGroupContext,
  type TableGroupDisplay,
  type TableGroupRenderer,
  type TableGroupToggleEventDetail,
  type TableRow,
  type TableRowEventDetail,
  type TableRowStyler,
  type TableSelectionChangeEventDetail,
  type TableSortChangeEventDetail,
  type TableSummaryAggregate,
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

/** Keys of the expanded groups: a `;`-separated list in the attribute, since a key holds `/` and `=`. */
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

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && value.trim() !== '') return Number(value)
  return Number.NaN
}

/** Reduces a column's values to one of the built-in aggregates; non-numeric values are skipped by all but `count`. */
function aggregate(kind: TableSummaryAggregate, values: unknown[]): unknown {
  if (kind === 'count') return values.filter((value) => value !== null && value !== undefined && value !== '').length
  let sum = 0
  let count = 0
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  for (const value of values) {
    const number = toNumber(value)
    if (!Number.isFinite(number)) continue
    sum += number
    count++
    if (number < min) min = number
    if (number > max) max = number
  }
  switch (kind) {
    case 'sum':
      return sum
    case 'avg':
      return count ? sum / count : undefined
    case 'min':
      return count ? min : undefined
    case 'max':
      return count ? max : undefined
    default:
      return undefined
  }
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

function dateFormatOptions(base: Intl.DateTimeFormatOptions, extra: Record<string, unknown> | undefined): Intl.DateTimeFormatOptions {
  return Object.assign({}, base, extra ?? {})
}

function humanize(field: string): string {
  const last = field.split('.').pop() ?? field
  const spaced = last.replace(/[_-]+/g, ' ').replace(/([a-z\d])([A-Z])/g, '$1 $2')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
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
  'cell-click': CustomEvent<TableCellEventDetail>
  'column-resize': CustomEvent<TableColumnResizeEventDetail>
  'page-change': CustomEvent<TablePageChangeEventDetail>
  'group-toggle': CustomEvent<TableGroupToggleEventDetail>
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
 * **Virtualization** windows the rows to the visible range plus an overscan margin. It needs a uniform row height, which
 * it measures from the first rendered row, so theme the height with `--c2-table__row--height` (`row-height` is only the
 * estimate used for the first paint). It turns on automatically past `virtual-threshold` rows; `virtual="always"` and
 * `virtual="never"` force it.
 *
 * **Realtime updates.** Add `animate-updates` when replacing `rows` with successive snapshots. Matching rows are found
 * by `row-key` (or index), and their finite numeric fields are interpolated over `update-duration`. With a stable key,
 * added rows expand in and deleted rows collapse out. Nested numbers in arrays and objects animate too, so a custom
 * `renderCell` such as a sparkline receives the same transient row as the formatted cells around it. Add
 * `highlight-updates` to pulse row backgrounds, and optionally choose its numeric direction with
 * `update-highlight-field`. Only rendered rows are interpolated, and reduced-motion preferences are respected.
 *
 * **Row keys.** Selection, `value`, events and cell slots name a row by its key: the `row-key` field of the row (or
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
 * count in the first column (or the one marked `group-column`), and under every column with a `summary` that
 * aggregate over the group's rows, formatted like the column. `group-display="band"` draws one full-width band per
 * group instead. A group is named by its path, `region=EMEA/status=Paid`: `expanded-groups` lists the open ones
 * (every group is open until then, or closed with `groups-collapsed`), `group-toggle` reports a click, and a group's
 * checkbox selects its rows. The groups of the rows at the top stay under the header while their rows scroll, and
 * a page that starts inside a group repeats its headers; pages count display lines, so a closed group takes one.
 * Grouping is done on the client and does not apply to a `dataSource`.
 *
 * ```html
 * <c2-table row-key="id" group-by="region" selection="multiple" checkbox-selection>
 *   <c2-table-column field="customer" header="Customer"></c2-table-column>
 *   <c2-table-column field="region" hidden></c2-table-column>
 *   <c2-table-column field="amount" format="currency" align="end" summary="sum"></c2-table-column>
 * </c2-table>
 * ```
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
 * @slot cell:{rowKey}:{field} - Body of one cell of a column marked `cell-slot`, e.g. `slot="cell:AAPL:change"`. Lets a framework render a cell with its own template language instead of a `renderCell` function; the column's `renderCell` or formatted value stays as the fallback.
 *
 * @slotcomponent c2-table-column
 * @slotcomponent c2-pagination
 *
 * @event {CustomEvent<TableSelectionChangeEventDetail>} selection-change - Fired after the user changes the selection. `detail.value` is the array of selected row keys, `detail.rows` the matching rows. Does not bubble: several components fire `selection-change`, so a listener belongs on the element itself rather than on an ancestor.
 * @event {CustomEvent<TableSortChangeEventDetail>} sort-change - Fired after the user clicks a sortable header. `detail.sort` is the new sort model, in priority order.
 * @event {CustomEvent<TableRowEventDetail>} row-click - Fired when a row is clicked, before the selection is applied.
 * @event {CustomEvent<TableCellEventDetail>} cell-click - Fired when a cell is clicked; adds `detail.column` and `detail.value`.
 * @event {CustomEvent<TableColumnResizeEventDetail>} column-resize - Fired when the user releases a column's resize handle.
 * @event {CustomEvent<TableGroupToggleEventDetail>} group-toggle - Fired after the user opens or closes a group, with its `key`, whether it is now `expanded`, and the `group` itself (its rows and aggregates). `expandedGroups` already holds the new state. Does not bubble.
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
 * @csspart row - Every rendered body row.
 * @csspart row-selected - A body row while it is selected; exposed in addition to `row`.
 * @csspart summary-row - The totals row kept at the bottom of the grid.
 * @csspart summary-cell - Every cell of the summary row. Each also carries `summary-cell-<id>`, named after its column.
 * @csspart summary-content - The content wrapper inside a summary cell; also `summary-content-<id>`.
 * @csspart group-row - Every group row. Also `group-row-level-<n>` (0 for the outermost level), `group-band` with `group-display="band"`, and `group-row-echo` on a copy kept under the header.
 * @csspart group-cell - Every cell of a group row. Each also carries `group-cell-<id>`, named after its column.
 * @csspart group-toggle - The chevron of a group row.
 * @csspart group-label - The group's value, or what `renderGroup` returned.
 * @csspart group-count - The number of rows in the group.
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

  /** Pulses changed row backgrounds: green for additions/increases, red for removals/decreases, blue otherwise. */
  @property({ type: Boolean, attribute: 'highlight-updates', reflect: true }) highlightUpdates = false

  /** Numeric field that determines whether a modified row highlights as increased or decreased. Defaults to its first changed number. */
  @property({ type: String, attribute: 'update-highlight-field' }) updateHighlightField = ''

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
   * Keys of the open groups (`region=EMEA/status=Paid`). While unset, every group follows `groups-collapsed`; the
   * first toggle writes the full list here, so it can be read, stored and handed back. `;`-separated in the attribute.
   */
  @property({ converter: groupKeysConverter, attribute: 'expanded-groups' }) expandedGroups?: string[]

  /** Starts every group closed while `expandedGroups` is unset. */
  @property({ type: Boolean, attribute: 'groups-collapsed' }) groupsCollapsed = false

  /** Renders a group's label in place of its formatted value. The slot `group:<key>` wins over both. */
  @property({ attribute: false }) renderGroup?: TableGroupRenderer

  /** Label of the group of rows whose value is empty. */
  @property({ type: String, attribute: 'empty-group-label' }) emptyGroupLabel = 'No value'

  @state() private columnElements: TableColumn[] = []
  @state() private widthOverrides: Record<string, number> = {}
  @state() private focusedCell: { row: number; column: number } = { row: HEADER_ROW, column: 0 }
  private readonly slotPresence = new SlotPresenceController(this, ['toolbar', 'footer'])
  @state() private remoteTotal = -1

  #sortedRows: TableRow[] = []
  #blocks = new Map<number, TableRow[]>()
  #pendingBlocks = new Set<number>()
  #measuredWidths = new Map<string, number>()
  #measuredRowHeight = 0
  #selectionAnchor = -1
  #pendingFocus = false
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
  #warnedGroupedSource = false
  #headerHeightPx = 0
  /** Keys of the group rows stuck under the header at the last render, to re-render only when they change. */
  #echoSignature = ''

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
    const visible = source.filter((column) => columnKey(column) && !column.hidden)
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

  /** Opens every group. */
  expandAll() {
    const grouping = this.#grouping()
    if (grouping) this.expandedGroups = [...grouping.nodes.keys()]
  }

  /** Closes every group. */
  collapseAll() {
    this.expandedGroups = []
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
    if (!this.hasUpdated || regroup || changed.has('rows') || changed.has('sortModel') || changed.has('columns') || changed.has('columnElements'))
      this.#applySort()
    if (this.dataSource && this.#groupLevels().length && !this.#warnedGroupedSource) {
      this.#warnedGroupedSource = true
      console.warn(
        '[c2-table] group-by is ignored with a dataSource: the table only holds the rows it has fetched, so it cannot know every group. Group the rows yourself, or pass them in rows.',
      )
    }
    // Another page size re-cuts the blocks, so the cache has to go; another page does not — and must not, or
    // `remoteTotal` would drop back to "unknown" and the pager would collapse to a single page mid-navigation.
    if (changed.has('dataSource') || changed.has('blockSize') || changed.has('pageSize') || (this.dataSource && changed.has('sortModel'))) {
      this.#resetRemote()
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
          class="grid"
          role=${grouping ? 'treegrid' : 'grid'}
          part="grid"
          aria-rowcount=${this.#lineCount + (summary ? 2 : 1)}
          aria-colcount=${columns.length}
          aria-busy=${this.loading || this.#isBootstrapping ? 'true' : 'false'}
          style=${styleMap({ '--_grid-template': this.#gridTemplate(columns) })}
          @keydown=${this.#handleKeyDown}
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
          return this.#keyAt(item.rowIndex, grouping.source[item.rowIndex])
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
        ? this.emptyGroupLabel
        : column
          ? this.#formatValue(column, node.value)
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
      aria-label="Select group rows"
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
            @click=${() => this.#focusLine(line, columnIndex)}
          >
            ${toggle} ${this.#renderGroupLabel(node, grouping, echo)}
          </div>`
        }
        const value = values.get(columnKey(column))
        const content =
          value === undefined || value === null || value === ''
            ? ''
            : column.summary === 'count'
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
        @click=${(event: MouseEvent) => {
          this.focusedCell = { row: HEADER_ROW, column: columnIndex }
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

    return html`
      <div
        class=${classMap({
          row: true,
          'row--body': true,
          'row--odd': line % 2 === 1,
          'row--selected': selected,
          'row--clickable': selectable,
          'row--highlighted': Boolean(updateState && this.highlightUpdates),
          [`row--${updateState}`]: Boolean(updateState),
        })}
        role="row"
        part=${['row', selected ? 'row-selected' : '', updateState ? `row-${updateState}` : ''].filter(Boolean).join(' ')}
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
    `
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
      'cell--selection': column.field === SELECTION_FIELD,
      ...this.#pinClasses(column, pins),
      ...(column.cellClass ? { [column.cellClass]: true } : {}),
    }
    const shared = {
      class: classMap(classes),
      tabindex: this.#tabIndexFor(line, columnIndex),
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
                  @change=${() => this.#handleCheckboxToggle(line)}
                ></c2-checkbox>`
              : nothing
          }
        </div>
      `
    }

    const value = getFieldValue(row, column.field)
    const rendered = row ? (column.renderCell ? column.renderCell({ value, row, rowIndex, column }) : this.#formatValue(column, value)) : undefined
    // A `cell-slot` column takes its body from a light-DOM child, which is how React, Vue and Angular render a
    // cell with their own template language instead of building DOM nodes by hand. Whatever `renderCell` or the
    // formatter produced stays as the slot's fallback, so a row with no child still shows its value.
    const content = row
      ? column.cellSlot
        ? html`<slot name=${`cell:${this.#keyAt(rowIndex, row)}:${columnKey(column)}`}>${rendered}</slot>`
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
          'cell--selection': column.field === SELECTION_FIELD,
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
    return Object.keys(first).map((field) => ({ field, header: humanize(field) }))
  }

  #gridTemplate(columns: TableColumnConfig[]): string {
    return columns
      .map((column) => {
        const override = this.widthOverrides[columnKey(column)]
        return override ? `${override}px` : column.width || '1fr'
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
    const row = (this.#transitionRows ?? this.#sortedRows)[index]
    if (!row || this.#animationFrom.size === 0 || this.#animationProgress >= 1) return row
    const from = this.#animationFrom.get(this.#keyAt(index, row))
    return from ? (interpolateValue(from, row, this.#animationProgress) as TableRow) : row
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
    this.#sortedRows = this.#sortRows(rows)
  }

  /** Sorts by `sortModel`, then, while grouped, gathers the rows of each group together in the order of the groups. */
  #sortRows(rows: TableRow[]): TableRow[] {
    const sorted = this.#sortBySortModel(rows)
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
    const source = this.#transitionRows ?? this.#sortedRows
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
    node.keys ??= node.rowIndices.map((index) => this.#keyAt(index, grouping.source[index]))
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
      else if (column.summary && column.field)
        values.set(
          columnKey(column),
          aggregate(
            column.summary,
            rows.map((row) => getFieldValue(row, column.field)),
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
    return this.paginated && this.#pageStart > 0 ? this.#depthOf(grouping.items[this.#pageStart]) : 0
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
      const node = this.#groupAtLevel(grouping.items[line], level)
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
    if (!grouping) {
      this.#virtualizer.scrollToIndex(line - this.#pageStart, this.#headerHeight())
      return
    }
    const viewport = this.viewport
    if (!viewport) return
    const height = this.#rowHeightPx
    const top = (line - this.#pageStart + this.#pagePrefix(grouping)) * height
    const covered = this.#depthOf(grouping.items[line]) * height
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
    if (column.field === SELECTION_FIELD || !column.field) return
    if (!(column.sortable ?? this.sortable)) return
    const existing = this.sortModel.find((entry) => entry.field === column.field)
    const direction: SortDirection | undefined = !existing ? 'asc' : existing.direction === 'asc' ? 'desc' : undefined
    const rest = additive && this.multiSort ? this.sortModel.filter((entry) => entry.field !== column.field) : []
    this.sortModel = direction ? [...rest, { field: column.field, direction }] : rest
    this.dispatchEvent(new CustomEvent<TableSortChangeEventDetail>('sort-change', { detail: { sort: this.sortModel }, bubbles: true, composed: true }))
  }

  #handleRowClick(event: MouseEvent, line: number) {
    const index = this.#rowIndexAt(line)
    const row = this.#rowAt(index)
    if (!row) return
    const key = this.#keyAt(index, row)
    this.dispatchEvent(new CustomEvent<TableRowEventDetail>('row-click', { detail: { row, rowIndex: index, key }, bubbles: true, composed: true }))
    if (this.selection === 'none') return
    this.#applySelection(line, { toggle: event.metaKey || event.ctrlKey, range: event.shiftKey })
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
    const minWidth = column.minWidth ?? 64
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
    let { row, column } = this.focusedCell
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
    if (row >= 0) this.#scrollToLine(row)
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
