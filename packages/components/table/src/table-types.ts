export type SortDirection = 'asc' | 'desc'

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

/** Returns anything Lit can render: a `TemplateResult`, a string, a number, a node. */
export type TableCellRenderer = (context: TableCellContext) => unknown
export type TableHeaderRenderer = (context: TableHeaderContext) => unknown

export interface TableColumnConfig {
  /** Key of the value in the row object; may be a dotted path. */
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
  renderCell?: TableCellRenderer
  renderHeader?: TableHeaderRenderer
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
  /** Keys of the selected rows (`row-key` field, or the row index when no `row-key` is set). */
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
  field: string
  width: number
}

/** Reads a possibly dotted `field` path out of a row. */
export function getFieldValue(row: TableRow | undefined, field: string): unknown {
  if (!row || !field) return undefined
  if (!field.includes('.')) return row[field]
  let current: unknown = row
  for (const part of field.split('.')) {
    if (current === null || current === undefined) return undefined
    current = (current as TableRow)[part]
  }
  return current
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
