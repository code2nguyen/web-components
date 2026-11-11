import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** The accessible name of the grid when it has no `label`. */
  table: 'Pivot table',
  /** The header of the grand total row and column. */
  total: 'Total',
  /** The grand total row. */
  grandTotal: 'Grand total',
  /** A group's subtotal row: `{0}` is the group. */
  groupTotal: (group: string) => `${group} total`,
  /** A value's header: `{0}` is the aggregate's name, `{1}` the field. */
  valueOf: (aggregate: string, field: string) => `${aggregate} of ${field}`,
  sum: 'Sum',
  count: 'Count',
  avg: 'Average',
  min: 'Min',
  max: 'Max',
  distinct: 'Distinct count',
  /** A computed value's header when it has no `label`: `{0}` is the computation, `{1}` and `{2}` the two values. */
  computedOf: (compute: string, a: string, b: string) => `${compute}: ${a} vs ${b}`,
  difference: 'Difference',
  'percent-difference': '% difference',
  ratio: 'Ratio',
  /** The field list's zones. */
  fields: 'Fields',
  rows: 'Rows',
  columns: 'Columns',
  values: 'Values',
  /** The field list's accessible name. */
  fieldList: 'Pivot fields',
  /** Chip menu commands. */
  moveToRows: 'Move to rows',
  moveToColumns: 'Move to columns',
  moveToValues: 'Move to values',
  remove: 'Remove',
  /** The chip menu's button: `{0}` is the field. */
  fieldOptions: (field: string) => `Options for ${field}`,
  /** Announced after the layout changes: `{0}` the row fields, `{1}` the column fields, `{2}` the values. */
  layout: (rows: string, columns: string, values: string) => `Rows: ${rows}. Columns: ${columns}. Values: ${values}.`,
  /** In the layout announcement, for a zone with no field. */
  none: 'none',
  /** Shown when there is nothing to summarise. */
  empty: 'No data',
  /** A column header's sort button: `{0}` is the column. */
  sortBy: (column: string) => `Sort by ${column}`,
}

/** The pivot table's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const pivotTableMessages = defineMessages('pivot-table', en)
