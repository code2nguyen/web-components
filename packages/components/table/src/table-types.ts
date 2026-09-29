export type { SortDirection } from '@c2n/core/data-helper.js'
import type { SortDirection } from '@c2n/core/data-helper.js'

export interface SortModel {
  field: string
  direction: SortDirection
}

export type ColumnAlign = 'start' | 'center' | 'end'
export type ColumnPin = 'start' | 'end'
export type ColumnFormat = 'text' | 'number' | 'percent' | 'currency' | 'date' | 'datetime' | 'time'

/** A row is any plain object; values are read by `field`, which may be a dotted path (`user.name`). */
export type TableRow = Record<string, unknown>

export interface TableCellContext {
  value: unknown
  row: TableRow
  rowIndex: number
  column: TableColumnConfig
}

export interface TableHeaderContext {
  column: TableColumnConfig
}

export interface TableRowContext {
  row: TableRow
  rowIndex: number
  key: string
}

/** Built-in aggregates of the summary row. `count` counts the rows whose value is neither empty nor null. */
export type TableSummaryAggregate = 'sum' | 'avg' | 'min' | 'max' | 'count'

export interface TableSummaryContext {
  column: TableColumnConfig
  /** The rows the summary covers: every row, or the current page with `summary-scope="page"`. */
  rows: TableRow[]
}

export interface TableSummaryRenderContext extends TableSummaryContext {
  /** The value for the column: the table's `summaryValues` entry when it has one, otherwise the column's aggregate. */
  value: unknown
}

/** Computes a column's summary value from its rows; the result is formatted like a cell of the column. */
export type TableSummaryFunction = (context: TableSummaryContext) => unknown
export type TableSummaryRenderer = (context: TableSummaryRenderContext) => unknown

export type TableRowStyle = Record<string, string | number | null | undefined>
export type TableRowStyler = (context: TableRowContext) => TableRowStyle | undefined

/** Returns anything Lit can render: a `TemplateResult`, a string, a number, a node. */
export type TableCellRenderer = (context: TableCellContext) => unknown
export type TableHeaderRenderer = (context: TableHeaderContext) => unknown

export interface TableColumnConfig {
  /**
   * Stable identity of the column. Defaults to `field`; set it when two columns show the same field, or when a
   * computed column has no field. Widths, pinning, the `cell-<id>` parts and the summary row are keyed by it.
   */
  id?: string
  /** Key of the value in the row object; may be a dotted path. May be empty for a computed column that has an `id`. */
  field: string
  /** Header label. Defaults to the field. */
  header?: string
  /** Grid track for the column: `1fr`, `160px`, `minmax(120px, 1fr)`… Defaults to `1fr`. */
  width?: string
  /** Lower bound in pixels while resizing. Defaults to 64. */
  minWidth?: number
  align?: ColumnAlign
  sortable?: boolean
  resizable?: boolean
  /** Freezes the column against the left (`start`) or right (`end`) edge while scrolling horizontally. */
  pinned?: ColumnPin
  hidden?: boolean
  /** Built-in `Intl` formatting applied when no `renderCell` is given. */
  format?: ColumnFormat
  /** Options passed to the `Intl` formatter of `format`. */
  formatOptions?: Record<string, unknown>
  /** Currency code for `format="currency"`. Defaults to `USD`. */
  currency?: string
  /** BCP 47 locale for `format`. Defaults to the browser locale. */
  locale?: string
  /** Class set on every cell of the column, for `::part(cell)`-free styling from the light DOM. */
  cellClass?: string
  /**
   * Renders each cell of the column from a light-DOM child instead of a function, so a framework can build the
   * body with its own template language. The table puts a `<slot name="cell:<row key>:<field>">` in the cell;
   * `renderCell` (or the formatted value) stays as the fallback while nothing is slotted into it.
   *
   * Requires a row key (`rowKey` or `getRowKey`). Only the rows the virtualizer has rendered have a slot, so children for the rest simply
   * wait — write one child per row and let the table pick.
   */
  cellSlot?: boolean
  renderCell?: TableCellRenderer
  renderHeader?: TableHeaderRenderer
  /** Value of the column in the summary row: a built-in aggregate, or a function of the rows. */
  summary?: TableSummaryAggregate | TableSummaryFunction
  /** Text shown in the column's summary cell when it has no value, such as `Total`. */
  summaryLabel?: string
  /** Alignment of the summary cell. Defaults to the column's `align`. */
  summaryAlign?: ColumnAlign
  /** Number of columns the summary cell spans, starting at this one. The spanned columns' summaries are not shown. */
  summarySpan?: number
  /** Renders the summary cell body instead of the formatted value. */
  renderSummary?: TableSummaryRenderer
  /** Client-side sort comparator for the column's values. */
  comparator?: (a: unknown, b: unknown) => number
}

export interface TableRowsRequest {
  /** Index of the first row requested. */
  start: number
  /** Number of rows requested. */
  count: number
  /** Sort the server should apply, in priority order. */
  sort: SortModel[]
}

export interface TableRowsResult {
  rows: TableRow[]
  /** Total number of rows on the server. Required on the first response so the scrollbar can be sized. */
  total?: number
}

/**
 * Lazy row source: the table asks for one block of rows at a time as they scroll into view, instead of holding the
 * whole dataset in `rows`. Sorting is delegated to the source.
 */
export interface TableDataSource {
  getRows(request: TableRowsRequest): Promise<TableRowsResult>
}

export interface TableSelectionChangeEventDetail {
  /** Keys of the selected rows, as strings: the `row-key` field (or `getRowKey`), or the row's position when there is neither. */
  value: string[]
  /** The selected rows themselves; only the loaded ones when a `dataSource` is used. */
  rows: TableRow[]
}

export interface TableSortChangeEventDetail {
  sort: SortModel[]
}

export interface TableRowEventDetail {
  row: TableRow
  rowIndex: number
  key: string
}

export interface TableCellEventDetail extends TableRowEventDetail {
  column: TableColumnConfig
  value: unknown
}

export interface TableColumnResizeEventDetail {
  /** The column's `id`, which is its `field` unless one was set. */
  id: string
  field: string
  width: number
}

/** Reads a possibly dotted `field` path out of a row. Re-exported from `@c2n/core` so the table keeps its own subpath. */
export { getFieldValue } from '@c2n/core/data-helper.js'

/** `name:asc;age:desc` ⇄ `SortModel[]`, so the sort can be set from markup. */
export const sortModelConverter = {
  toAttribute: (value: SortModel[]) => (Array.isArray(value) && value.length ? value.map((item) => `${item.field}:${item.direction}`).join(';') : null),
  fromAttribute: (value: string | null): SortModel[] => {
    if (!value) return []
    return value
      .split(';')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const [field, direction] = entry.split(':')
        return { field: field.trim(), direction: direction?.trim() === 'desc' ? ('desc' as const) : ('asc' as const) }
      })
  },
}
