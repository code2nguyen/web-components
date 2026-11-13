import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** Accessible name of the chevron that opens a row's detail panel. */
  detailToggle: 'Details',
  /** Tooltip of a value of a `status` column: `{0}` is the column's header, `{1}` the value's label. */
  statusTitle: (column: string, label: string) => `${column}: ${label}`,
  /** Said after a summary that misses its `summary-target`, `{0}` being the target as the column formats it. */
  summaryOffTarget: (target: string) => `should be ${target}`,
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
