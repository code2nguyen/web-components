import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** Shown in the body when there are no rows, unless `empty-message` or the `empty` slot replaces it. */
  empty: 'No rows',
  /** Shown in the body when `quick-filter` or `filter` leaves no rows. */
  noMatches: 'No matching rows',
  /** Label of the group of rows whose grouped value is empty, unless `empty-group-label` replaces it. */
  noValue: 'No value',
  /** The select-all checkbox in the header. */
  selectAll: 'Select all rows',
  /** A row's checkbox. */
  selectRow: 'Select row',
  /** A group's checkbox: `{0}` is the group's label. */
  selectGroup: (group: string) => `Select rows in ${group}`,
  /** The cell that shows or hides a row's detail. */
  rowDetails: 'Row details',
  /** The editor of a cell: `{0}` is the column's header. */
  editCell: (column: string) => `Edit ${column}`,
  /** Announced after the user sorts: `{0}` is the column. */
  sortedAscending: (column: string) => `Sorted by ${column}, ascending`,
  sortedDescending: (column: string) => `Sorted by ${column}, descending`,
  /** Announced after the user removes the sort. */
  sortCleared: 'Sort removed',
  /** Announced after the user opens a group: `{0}` is its label, `{1}` its number of rows. */
  groupExpanded: (group: string, count: number) => `${group} expanded, ${count} ${count === 1 ? 'row' : 'rows'}`,
  /** Announced after the user closes a group: `{0}` is its label. */
  groupCollapsed: (group: string) => `${group} collapsed`,
  /** Announced after the quick filter changes: `{0}` rows match out of `{1}`. */
  filtered: (shown: number, total: number) => `${shown} of ${total} ${total === 1 ? 'row' : 'rows'}`,
  /** Announced after the user moves a column: `{0}` is the column, `{1}` its new position and `{2}` the number of columns. */
  columnMoved: (column: string, position: number, total: number) => `${column} moved to position ${position} of ${total}`,
}

/** The table's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const tableMessages = defineMessages('table', en)
