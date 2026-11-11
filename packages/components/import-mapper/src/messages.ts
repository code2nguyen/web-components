import { defineMessages } from '@c2n/core/localize.js'

const count = (value: number) => value.toLocaleString('en')

const en = {
  /** The mapper's accessible name when it has no `label`. */
  mapper: 'Import mapping',
  /** Heading over the source columns. */
  sourceColumn: 'Column in your file',
  /** Heading over each column's first values. */
  samples: 'Sample values',
  /** Heading over the field pickers. */
  target: 'Import as',
  /** The picker's option that leaves a column out. */
  skip: "Don't import",
  /** Badge on a column the mapper matched from its header. */
  auto: 'Auto-matched',
  /** Badge on a column that is not imported. */
  notImported: 'Not imported',
  /** A picker's accessible name: `{0}` is the column's header. */
  pickerLabel: (header: string) => `Import column “${header}” as`,
  /** A column with no values in its first rows. */
  noSamples: 'No values',
  /** The name of a column whose header is blank: `{0}` is its position. */
  untitled: (position: number) => `Column ${position}`,
  /** Under a required field's name in the picker. */
  required: 'Required',
  /** Title of the list of required fields. */
  requiredFields: 'Required fields',
  /** Read after a required field that a column is mapped to. */
  mapped: 'mapped',
  /** Read after a required field that no column is mapped to. */
  notMapped: 'not mapped',
  /** The summary once every required field has a column. */
  allRequiredMapped: 'All required fields are mapped',
  /** The summary while required fields lack a column: `{0}` is how many, `{1}` their names. */
  missingRequired: (missing: number, names: string) =>
    missing === 1 ? `1 required field is not mapped: ${names}` : `${count(missing)} required fields are not mapped: ${names}`,
  /** How many columns are imported: `{0}` mapped, `{1}` in the file. */
  mappedColumns: (mapped: number, total: number) => `${count(mapped)} of ${count(total)} columns mapped`,
  /** Announced when a column is mapped: `{0}` is its header, `{1}` the field. */
  announceMapped: (header: string, field: string) => `Column “${header}” imports as ${field}.`,
  /** Announced when a column is left out: `{0}` is its header. */
  announceSkipped: (header: string) => `Column “${header}” will not be imported.`,
  /** Announced when a field moves to another column: `{0}` is the field, `{1}` the header it left. */
  announceMoved: (field: string, header: string) => `${field} is no longer imported from “${header}”.`,
  /** Shown while there is no file to map. */
  empty: 'No file to map yet. Choose a file to see its columns here.',
  /** Shown while a data source loads rows. */
  loading: 'Loading rows…',
  /** Shown when a data source fails. */
  loadError: 'The rows could not be loaded.',
  /** The preview's first column: the row's number in the file. */
  rowNumber: 'Row',
  /** The preview table's accessible name. */
  preview: 'Preview of the imported rows',
  /** The preview's summary without errors: `{0}` rows checked. */
  noErrors: (rows: number) => (rows === 1 ? '1 row, no errors' : `${count(rows)} rows, no errors`),
  /** The preview's summary with errors: `{0}` rows checked, `{1}` rows with errors, `{2}` errors. */
  errorSummary: (rows: number, invalid: number, errors: number) =>
    `${count(rows)} ${rows === 1 ? 'row' : 'rows'}, ${count(invalid)} with errors (${errors === 1 ? '1 error' : `${count(errors)} errors`})`,
  /** With a data source, only loaded rows are checked: `{0}` is how many. */
  loadedOnly: (rows: number) => `checked on the ${count(rows)} rows loaded`,
  /** The rows the page shows: `{0}` first, `{1}` last, `{2}` how many. */
  pageRange: (first: number, last: number, total: number) => `Rows ${count(first)}–${count(last)} of ${count(total)}`,
  previousPage: 'Previous rows',
  nextPage: 'Next rows',
  /** Shown while `errors-only` hides every row. */
  noInvalidRows: 'No rows with errors',
  /** The preview while no column is mapped. */
  nothingMapped: 'Map at least one column to preview the import.',
  /** Read before a cell's error. */
  errorPrefix: 'Error:',
  errRequired: 'Required',
  errNumber: 'Not a number',
  errInteger: 'Not a whole number',
  errDate: 'Not a date',
  errEmail: 'Not an email address',
  errUrl: 'Not a web address',
  errBoolean: 'Not yes or no',
  /** A value outside a field's options: `{0}` lists them. */
  errOptions: (options: string) => `Must be one of: ${options}`,
  errPattern: 'Not in the expected format',
}

/** The import mapper's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const importMapperMessages = defineMessages('import-mapper', en)
