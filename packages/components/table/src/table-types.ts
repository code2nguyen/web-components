export type { SortDirection } from '@c2n/core/data-helper.js'
import type { SortDirection } from '@c2n/core/data-helper.js'

export interface SortModel {
  field: string
  direction: SortDirection
}

export type ColumnAlign = 'start' | 'center' | 'end'
export type ColumnPin = 'start' | 'end'
/** `status` draws each value as a mark and a label from the column's `options`, the legend of the column. */
export type ColumnFormat = 'text' | 'number' | 'percent' | 'currency' | 'date' | 'datetime' | 'time' | 'status'

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

/**
 * Built-in aggregates of the summary row. `count` counts the rows whose value is neither empty nor null; `tally` counts
 * the rows of each value (a `Map` of value to count, drawn as the column's statuses with their counts); `last` is the
 * value of the last row that has one, such as the closing balance of a `running` column.
 */
export type TableSummaryAggregate = 'sum' | 'avg' | 'min' | 'max' | 'count' | 'tally' | 'last'

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

/**
 * The built-in editor of a column of an `editable` table. `checkbox` shows a checkbox in every cell and toggles it in
 * place; the others open one input over the cell being edited.
 */
export type TableCellEditor = 'text' | 'number' | 'date' | 'select' | 'checkbox' | 'url'

/**
 * A value of the column's legend: a value, or the value and the label shown for it. The label is what the cell shows
 * and what a `select` editor offers; with `format="status"`, `color` paints the value's mark and `glyph` is drawn in it.
 */
export type TableCellOption = string | number | { value: unknown; label?: string; color?: string; glyph?: string }

/** What a custom editor (`renderEditor`) is drawn with. */
export interface TableCellEditorContext extends TableCellContext {
  key: string
  /** The value being edited: the cell's value, or the character typed to open the editor. */
  draft: unknown
  /** Keeps `value` as the draft without closing: Enter, Tab or leaving the cell commits it. */
  setDraft(value: unknown): void
  /** Commits `value` and closes the editor. */
  commit(value: unknown): void
  /** Closes the editor without changing the cell. */
  cancel(): void
}

/** Draws the editor of a cell in place of the built-in one; anything Lit can render. */
export type TableCellEditorRenderer = (context: TableCellEditorContext) => unknown

/** Checks a cell's value: returns the message to show, or nothing when the value is valid. */
export type TableCellValidator = (context: TableCellContext) => string | null | undefined

/** Turns text pasted from a spreadsheet into the column's value. */
export type TableCellParser = (text: string, context: { row: TableRow; column: TableColumnConfig }) => unknown

/** What `rowRule` is given: the row with the edited cell already changed, and the row before it. */
export interface TableRowRuleContext {
  row: TableRow
  previousRow: TableRow
  column: TableColumnConfig
  field: string
  value: unknown
  previousValue: unknown
}

/**
 * Adjusts a row after one of its cells is edited, before the table stores it: return the row to keep (typing a debit
 * clears the credit, a new quantity recomputes the line total), or nothing to keep it as it is.
 */
export type TableRowRule = (context: TableRowRuleContext) => TableRow | void

export interface TableCellChangeEventDetail {
  key: string
  /** The row before the change. */
  row: TableRow
  column: TableColumnConfig
  field: string
  value: unknown
  previousValue: unknown
}

/** Why `rows` was replaced: a cell edited or toggled, a block pasted, rows added, duplicated or deleted, or changes reverted. */
export type TableRowsChangeReason = 'edit' | 'paste' | 'add' | 'duplicate' | 'delete' | 'revert'

export interface TableRowsChangeEventDetail {
  /** The new `rows`. */
  rows: TableRow[]
  reason: TableRowsChangeReason
}

/** What has changed since the rows were given or `acceptChanges()` last ran. */
export interface TableChanges {
  /** Rows added by `addRow`, `duplicateRow` or a paste past the last row, as they are now. */
  added: TableRow[]
  /** Edited rows as they are now, each with the row it replaced. */
  updated: { row: TableRow; original: TableRow }[]
  /** Deleted rows, as they were given. */
  removed: TableRow[]
}

/** One invalid cell, as `validate()` reports it. */
export interface TableCellError {
  key: string
  row: TableRow
  column: TableColumnConfig
  message: string
}

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
  /**
   * The value the column's summary must reach, such as 100 for percentages that must add up: while the summary is
   * another number, its cell is marked (`summary-cell-off-target`) and says what it should be.
   */
  summaryTarget?: number
  /** Number of columns the summary cell spans, starting at this one. The spanned columns' summaries are not shown. */
  summarySpan?: number
  /** Renders the summary cell body instead of the formatted value. */
  renderSummary?: TableSummaryRenderer
  /**
   * In a tree (`children-field`), the value a parent row shows in this column: a built-in aggregate, or a function, of
   * the leaf rows under it (the rows with no children of their own). The parent's own value is not used, and sorting
   * reads the rolled-up value.
   */
  rollup?: TableSummaryAggregate | TableSummaryFunction
  /** Client-side sort comparator for the column's values. */
  comparator?: (a: unknown, b: unknown) => number
  /**
   * Puts the group tree in this column while the table is grouped: the chevron, the group's label and its row count
   * on each group row, and the indentation of the rows under it. In a tree (`children-field`) it holds each row's
   * chevron and indentation. Defaults to the first column.
   */
  groupColumn?: boolean
  /**
   * Makes the column a running total, such as a balance: each row shows `opening` plus the fields named here, added
   * up over the rows in the order they are sorted. Fields are comma-separated and a `-` subtracts one:
   * `credit,-debit`. A row with none of them shows no value and leaves the total as it is.
   */
  running?: string
  /** The value a `running` column starts from, such as an opening balance. Defaults to 0. */
  opening?: number
  /** Makes the column count, in each row, the cells of the `status` columns that hold this value. */
  countValue?: string
  /** Adds a filter of the column's values to its header (the table's `filterable` makes every column filterable). */
  filterable?: boolean
  /** Shows each cell's change from the matching row of the table's `baseline`: `delta` as a number, `percent` as a share. */
  compare?: TableCompare
  /**
   * Marks a cell whose value moved from the `baseline` by more than this share of it (`0.1` is 10%): the
   * `cell-variance` part. A cell whose baseline is 0 is marked on any change.
   */
  varianceThreshold?: number
  /**
   * Makes the column a series: it stands for one column per key of the object in this field of the rows, such as the
   * readings of a flowsheet keyed by their time (`{ "2026-11-14T08:00": 82 }`). Every key found in the rows becomes a
   * column, in order, with the other settings of this one. Assign `rows` again after adding a key.
   */
  series?: string
  /** Keys a `series` column always shows, even with no row holding a value: the next reading's time. */
  seriesKeys?: string[]
  /** Order of a `series` column's keys: `asc` (the default) or `desc`, newest first for times. */
  seriesOrder?: 'asc' | 'desc'
  /** How a `series` column writes each key as its header: `datetime` (the default), `date`, `time` or `text`. */
  seriesFormat?: ColumnFormat
  /**
   * Flags a cell outside its row's normal range, as a lab result is: `low,high`, each a number or the field of the row
   * that holds it (`ref_low,ref_high`). Either may be empty. The cell gets the `cell-flag-low` or `cell-flag-high` part
   * and an `L` or `H` mark.
   */
  referenceRange?: string
  /** Flags a cell past its row's critical limits the same way: `cell-flag-critical-low`, `cell-flag-critical-high`. */
  criticalRange?: string
  /** For one column of a `series`: its key in the series object. Set by the table. */
  seriesKey?: string
  /** Makes the column's cells editable while the table is `editable`, with this editor. */
  editor?: TableCellEditor
  /** The choices of a `select` editor. The cell shows the label of its value. */
  options?: TableCellOption[]
  /** An empty value marks the cell invalid while the table is `editable`. */
  required?: boolean
  /** Checks a cell's value after an edit, a paste or `validate()`. */
  validate?: TableCellValidator
  /** Draws the cell's editor in place of the built-in `editor`, which it also makes editable. */
  renderEditor?: TableCellEditorRenderer
  /** Turns pasted text into the column's value; the default follows the `editor`. */
  parseValue?: TableCellParser
}

/** One level of row grouping: the rows are bucketed by the value of `field`, or by `getValue(row)` when given. */
export interface TableGroupBy {
  /** Field whose value names the group; may be a dotted path. Also the level's name in the group keys. */
  field: string
  /** Computes the group value instead of reading `field`, such as the month of a date. Property only. */
  getValue?: (row: TableRow) => unknown
  /**
   * Order of the groups of this level. Defaults to the direction the table is sorted by `field`, ascending when it
   * is not. A function compares two group values.
   */
  sort?: SortDirection | ((a: unknown, b: unknown) => number)
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
  /** Every row of the group, sorted, including the rows of its sub-groups. */
  rows: TableRow[]
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

/** What `loadChildren` is asked for: the children of one parent row of a tree. */
export interface TableChildrenRequest {
  row: TableRow
  key: string
  /** Depth of the parent, 0 for a top-level row. */
  level: number
}

/** Resolves the children of a tree row whose `children-field` holds `true`. */
export type TableChildrenLoader = (request: TableChildrenRequest) => Promise<TableRow[]>

export interface TableRowToggleEventDetail {
  key: string
  row: TableRow
  /** Whether the row is now open. */
  expanded: boolean
}

/** What a detail panel is drawn for: the row it opens under. */
export interface TableDetailContext {
  row: TableRow
  rowIndex: number
  key: string
}

/** Draws the detail panel of an open row; anything Lit can render. */
export type TableDetailRenderer = (context: TableDetailContext) => unknown

export interface TableDetailToggleEventDetail {
  key: string
  row: TableRow
  /** Whether the row's detail panel is now open. */
  expanded: boolean
}

export interface TableChildrenErrorEventDetail {
  key: string
  row: TableRow
  /** Whatever `loadChildren` rejected with. */
  error: unknown
}

export interface TableRowsRequest {
  /** Index of the first row requested. */
  start: number
  /** Number of rows requested. */
  count: number
  /** Sort the server should apply, in priority order. */
  sort: SortModel[]
  /** The column filters the server should apply, keyed by column id (see `filters`). */
  filters: TableFilters
}

/**
 * The filter of one column: the values it keeps (`include`) or drops (`exclude`), compared as text. An empty value is
 * `''`. With both, a value must be included and not excluded.
 */
export interface TableColumnFilter {
  include?: string[]
  exclude?: string[]
}

/** The column filters of a table, keyed by column id (its `field` unless `column-id` is set). */
export type TableFilters = Record<string, TableColumnFilter>

export interface TableFilterChangeEventDetail {
  /** Every column's filter, as `filters` now holds them. */
  filters: TableFilters
  /** The id of the column whose filter changed. */
  column: string
}

/** How a column compares each cell with the matching row of `baseline`: the change as a number or a share. */
export type TableCompare = 'delta' | 'percent'

/** Where a cell stands against its row's `reference-range` and `critical-range`. */
export type TableCellFlag = 'low' | 'high' | 'critical-low' | 'critical-high'

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
