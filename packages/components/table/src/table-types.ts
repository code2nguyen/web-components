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

/** Renders the detail of a row, shown under it while it is expanded. */
export type TableRowDetailRenderer = (context: TableRowContext) => unknown

export type TableRowStyle = Record<string, string | number | null | undefined>
export type TableRowStyler = (context: TableRowContext) => TableRowStyle | undefined

/**
 * Returns extra part names for a row, added beside `row`: `'row-failed'` (or `['row-failed', 'row-revised']`) makes
 * the row reachable as `c2-table::part(row-failed)`. Whitespace-separated names in one string work too; `undefined`,
 * `null` or an empty string adds none.
 */
export type TableRowPartResolver = (context: TableRowContext) => string | readonly string[] | null | undefined

/** One data row of the rendered window, as `range-change` reports it. */
export interface TableRenderedRow {
  /**
   * Display line of the row, counted across the whole dataset after sort, filter and grouping (page offset
   * included). Its `cell-slot` cells take the children named `cell:{line}:{field}`.
   */
  line: number
  /** The row's key (see `row-key`). */
  key: string
  /** The row itself, as the application gave it. */
  row: TableRow
}

/** Detail of `range-change`: the body rows the table has rendered, which is the window while it virtualizes. */
export interface TableRangeChangeEventDetail {
  /** Display line of the first rendered body row, counted across the whole dataset (page offset included). */
  start: number
  /** Display line after the last rendered body row. */
  end: number
  /** Keys of the data rows rendered in that window, in display order: the `key` of each entry of `rows`. */
  keys: string[]
  /**
   * One entry per data row rendered in that window, in display order — the lines whose `cell:{line}:{field}` slots
   * are in the shadow DOM right now. Group rows and rows a `dataSource` has not delivered yet are left out. A
   * framework maps this to the children of its `cell-slot` columns.
   */
  rows: TableRenderedRow[]
}

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
  /** Lower bound in pixels: the floor of a flexible (`fr`) track, and while resizing. Defaults to 64. */
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
   * body with its own template language. The table puts a `<slot name="cell:<line>:<field>">` in the cell, `line`
   * being the row's display line as `range-change` counts it; `renderCell` (or the formatted value) stays as the
   * fallback while nothing is slotted into it.
   *
   * Children are needed only for the lines `range-change` reports (`detail.rows`); a child whose line is outside the
   * rendered window is left unassigned. After a sort, filter or page change the same line holds a different row, so
   * re-render the children from the next `range-change`.
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
  /**
   * Value of the column on a group row, when it should differ from the summary row: a built-in aggregate, a function
   * of the group's rows, or `none` to leave the group cell empty. Defaults to `summary`.
   */
  groupSummary?: TableSummaryAggregate | TableSummaryFunction | 'none'
  /** Client-side sort comparator for the column's values. */
  comparator?: (a: unknown, b: unknown) => number
  /**
   * Lets the user edit the column's cells: double-click, Enter, F2 or typing on a focused cell opens an editor, Enter
   * or leaving it commits, Escape cancels. Defaults to the table's `editable`. Needs a `field`.
   */
  editable?: boolean
  /** Renders the editor of a cell instead of the built-in input; call `commit(value)` or `cancel()` from it. */
  renderEditor?: TableEditorRenderer
  /** Leaves the column out of `quick-filter` matching. */
  filterable?: boolean
  /**
   * Puts the group tree in this column while the table is grouped: the chevron, the group's label and its row count
   * on each group row, and the indentation of the rows under it. Defaults to the first column.
   */
  groupColumn?: boolean
}

/** One level of row grouping: the rows are bucketed by the value of `field`, or by `getValue(row)` when given. */
export interface TableGroupBy {
  /** Field whose value names the group; may be a dotted path. Also the level's name in the group keys. */
  field: string
  /** Computes the group value instead of reading `field`, such as the month of a date. Property only. */
  getValue?: (row: TableRow) => unknown
  /**
   * Order of the groups of this level. Defaults to the direction the table is sorted by `field`, ascending when it
   * is not. A function compares two group values. With `sortBy` it is the direction of that aggregate.
   */
  sort?: SortDirection | ((a: unknown, b: unknown) => number)
  /**
   * Orders the groups by one of their aggregates instead of their value: the `id` of a column with a `summary` (or
   * `group-summary`), such as `amount` for the regions by revenue, or `count` for their number of rows unless a column
   * has that id. `sort` is the direction, ascending unless it says `desc`.
   */
  sortBy?: string
  /** Orders the groups by anything else: compares two whole groups (value, rows, aggregates). Wins over `sortBy`. Property only. */
  compare?: (a: TableGroupContext, b: TableGroupContext) => number
}

/**
 * `group-display`: `row` puts each group on a row of the grid, with the column aggregates of its rows under their own
 * columns; `band` draws one full-width band per group, holding its label and row count.
 */
export type TableGroupDisplay = 'row' | 'band'

export interface TableGroupContext {
  /** Stable key of the group, built from its path: `region=EMEA/status=Paid`. */
  key: string
  /** Depth of the group, 0 for the outermost level. */
  level: number
  /** The `field` of the level. */
  field: string
  /** The value every row of the group shares. */
  value: unknown
  /**
   * Every row of the group, sorted, including the rows of its sub-groups. With a data source only the rows fetched so
   * far; `count` is the full number.
   */
  rows: TableRow[]
  /** Number of rows in the group, sub-groups included. */
  count: number
  expanded: boolean
  /** The aggregates of the group's rows, keyed by column `id`: one entry per column with a `summary`. */
  summary: Record<string, unknown>
}

/** Renders the label of a group in place of its formatted value. */
export type TableGroupRenderer = (context: TableGroupContext) => unknown

export interface TableGroupToggleEventDetail {
  key: string
  expanded: boolean
  group: TableGroupContext
}

/** One step of a group's path: the level's field and the value the group's rows share. */
export interface TableGroupPathEntry {
  field: string
  value: unknown
}

export interface TableRowsRequest {
  /** Index of the first row requested: within the group when `group` is set. */
  start: number
  /** Number of rows requested. */
  count: number
  /** Sort the server should apply, in priority order. */
  sort: SortModel[]
  /** The table's `quick-filter` text, which the server applies; absent when there is none. */
  filter?: string
  /** While grouped, the bottom-level group whose rows are asked for, outermost level first. */
  group?: TableGroupPathEntry[]
}

/** What the table asks a grouping data source for: the groups of one level, under `parent`. */
export interface TableGroupsRequest {
  /** Depth of the level, 0 for the outermost. */
  level: number
  /** The level as `group-by` names it: `field` and, when given, `sort` (a direction) and `sortBy`. */
  groupBy: Pick<TableGroupBy, 'field' | 'sortBy'> & { sort?: SortDirection }
  /** The group these are the sub-groups of, outermost level first; empty for the top level. */
  parent: TableGroupPathEntry[]
  /** Sort of the rows, which also orders the groups of a sorted field. */
  sort: SortModel[]
  /** The table's `quick-filter` text. */
  filter?: string
}

export interface TableGroupsResult {
  /**
   * The groups in display order: each one's `value`, its number of rows `count` (sub-groups included), and the
   * aggregates shown on its group row, keyed by column `id`.
   */
  groups: { value: unknown; count: number; summary?: Record<string, unknown> }[]
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
  /**
   * Lists the groups of one level, which lets the table group a dataset it does not hold: with `group-by` set, it asks
   * for the top-level groups, for the sub-groups of a group when it is opened, and for the rows of an open bottom-level
   * group through `getRows` with `request.group`. Without it, `group-by` is ignored for a data source.
   */
  getGroups?(request: TableGroupsRequest): Promise<TableGroupsResult>
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

/** Handed to `renderEditor`: the cell being edited, and the two ways out of editing it. */
export interface TableEditorContext extends TableCellContext {
  /** Ends editing with this value; the table fires `cell-edit` and, unless that is cancelled, writes it into the row. */
  commit: (value: unknown) => void
  /** Ends editing and keeps the value as it was. */
  cancel: () => void
}

export type TableEditorRenderer = (context: TableEditorContext) => unknown

export interface TableCellEditEventDetail extends TableCellEventDetail {
  /** The column's field, which the new value is written to. */
  field: string
  /** The value before the edit; `value` is the new one. */
  previousValue: unknown
}

export interface TableRowDetailToggleEventDetail extends TableRowEventDetail {
  /** Whether the row's detail is now shown. */
  expanded: boolean
}

export interface TableColumnReorderEventDetail {
  /** The `id` of the column that moved. */
  id: string
  /** Every column's `id` in the new order: what `columnOrder` now holds. */
  order: string[]
}

/** Options of `toCSV()` and `downloadCSV()`. */
export interface TableCsvOptions {
  /**
   * The rows written: `all` rows after filter and sort (grouped rows in group order), only the `selected` ones, or
   * the `page` on show. With a data source, only the rows fetched so far. Defaults to `all`.
   */
  rows?: 'all' | 'selected' | 'page'
  /** The `visible` columns, or `all` of them including hidden ones. Defaults to `visible`. */
  columns?: 'visible' | 'all'
  /** Writes the header labels as the first line. Defaults to `true`. */
  header?: boolean
  /** Writes values as the cells show them (`$1,200.00`) rather than raw (`1200`). Defaults to `false`. */
  formatted?: boolean
  /** Field separator. Defaults to `,`. */
  separator?: string
  /**
   * Prefixes a value that a spreadsheet would read as a formula (starting with `=`, `+`, `-`, `@`, tab or carriage
   * return, and not a plain number) with `'`. Defaults to `true`; turn it off only for data you trust.
   */
  escapeFormulas?: boolean
}

export interface TableColumnResizeEventDetail {
  /** The column's `id`, which is its `field` unless one was set. */
  id: string
  field: string
  width: number
}

/** Reads a possibly dotted `field` path out of a row. Re-exported from `@c2n/core` so the table keeps its own subpath. */
export { getFieldValue } from '@c2n/core/data-helper.js'

/** Splits the `group-by` attribute: a JSON array, or field names separated by commas or semicolons. */
function parseGroupBy(value: string): (string | TableGroupBy)[] {
  const text = value.trim()
  if (text.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(text)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return text
    .split(/[;,]/)
    .map((field) => field.trim())
    .filter(Boolean)
}

/** `region,status` ⇄ `['region', 'status']`; a string assigned to the property is parsed the same way. */
export const groupByConverter = {
  toAttribute: (value: (string | TableGroupBy)[]) =>
    Array.isArray(value) && value.length && value.every((entry) => typeof entry === 'string') ? value.join(',') : null,
  fromAttribute: (value: string | null): (string | TableGroupBy)[] => (value ? parseGroupBy(value) : []),
  fromProperty: (value: unknown) => (typeof value === 'string' ? parseGroupBy(value) : value),
}

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
