import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** Accessible name of the chevron that opens a row's detail panel. */
  detailToggle: 'Details',
  /** Tooltip of a value of a `status` column: `{0}` is the column's header, `{1}` the value's label. */
  statusTitle: (column: string, label: string) => `${column}: ${label}`,
  /** Said after a summary that misses its `summary-target`, `{0}` being the target as the column formats it. */
  summaryOffTarget: (target: string) => `should be ${target}`,
  /** Accessible name of a group's checkbox in `c2-group-table`, which selects the group's rows. */
  selectGroupRows: 'Select group rows',
  /** Label of the group of rows whose value is empty, in `c2-group-table`. */
  emptyGroup: 'No value',
  /** Accessible name of a column's filter button, `{0}` being the column's header. */
  filterColumn: (column: string) => `Filter ${column}`,
  /** The value of an empty cell in a column's filter. */
  filterBlank: '(Blanks)',
  /** Buttons of a column's filter. */
  sortAscending: 'Sort A to Z',
  sortDescending: 'Sort Z to A',
  clearFilter: 'Clear filter',
  /** Tooltip of a cell's change from the baseline, `{0}` being the baseline value. */
  previousValue: (value: string) => `Was ${value}`,
  /** The mark of a cell outside its row's `reference-range` or `critical-range`, as a lab report prints it. */
  flagLow: 'L',
  flagHigh: 'H',
  flagCriticalLow: 'LL',
  flagCriticalHigh: 'HH',
  /** What a screen reader says for each mark. */
  flagLowName: 'Low',
  flagHighName: 'High',
  flagCriticalLowName: 'Critically low',
  flagCriticalHighName: 'Critically high',
  /** Tooltip of a mark: `{0}` is its name, `{1}` the row's normal range (`3.5–5.1`). */
  flagRange: (flag: string, range: string) => `${flag}, normal ${range}`,
  /** The load of a cell of `c2-allocation-grid`, read after its value. */
  allocationUnder: 'under capacity',
  allocationAt: 'at capacity',
  allocationOver: 'over capacity',
  /** Header of the total column of `c2-allocation-grid` (`row-totals`). */
  rowTotal: 'Total',
  /** Accessible name of a row's selection checkbox. */
  selectRow: 'Select row',
  /** Accessible name of the header checkbox, which selects the rows on show. */
  selectAllRows: 'Select all rows',
  /** Accessible name of the caret beside it (`bulk-select`), and the rows of its menu. */
  selectionOptions: 'Selection options',
  selectPageRows: (count: string) => `Select this page (${count})`,
  selectAllCount: (count: string) => `Select all ${count}`,
  clearSelection: 'Clear selection',
  /** Accessible name of the input that edits a cell, `{0}` being the column's header. */
  editCell: (column: string) => `Edit ${column}`,
  /** A `required` cell is empty. */
  errorRequired: 'Required',
  /** A `number` cell holds text that is not a number. */
  errorNumber: 'Enter a number',
  /** A `date` cell holds text that is not a date. */
  errorDate: 'Enter a date',
  /** A `url` cell holds text that is not a web address. */
  errorUrl: 'Enter a web address',
  /** A `select` cell holds a value that is not one of its options. */
  errorOption: 'Choose one of the options',
}

/** The table's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const tableMessages = defineMessages('table', en)
