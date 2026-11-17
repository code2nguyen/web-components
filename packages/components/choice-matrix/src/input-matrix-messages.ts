import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** Accessible name of a matrix with no `label` and no field label. */
  label: 'Values',
  /** The title of the totals row and the totals column. */
  total: 'Total',
  /** A required input matrix with no value. */
  inputMissing: 'Please enter at least one value.',
  /** A cell whose text is not a value of its column's type. */
  badInput: (row: string, column: string) => `Enter a valid value for ${row}, ${column}.`,
  /** A number below its column's `min`. */
  rangeUnderflow: (row: string, column: string, min: string) => `${row}, ${column} must be ${min} or more.`,
  /** A number above its column's `max`. */
  rangeOverflow: (row: string, column: string, max: string) => `${row}, ${column} must be ${max} or less.`,
  /** A duration as hours and minutes, in a cell or a total. */
  duration: (hours: string, minutes: string) => `${hours}:${minutes}`,
}

/** The input matrix's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const inputMatrixMessages = defineMessages('input-matrix', en)
