import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** Accessible name of the matrix when it has no `label` and no field label. */
  label: 'Choices',
  /** The toggle at the start of a row, which checks or clears every choice in it. */
  toggleRow: (row: string) => `All of ${row}`,
  /** The toggle under a column title, which checks or clears it in every row. */
  toggleColumn: (column: string) => `${column} for all`,
  /** The toggle of a column in a group's header row. */
  toggleGroup: (column: string, group: string) => `${column} for ${group}`,
  /** The validation message of a required matrix. */
  rowsMissing: 'Please answer every row.',
  valueMissing: 'Please select at least one option.',
}

/** The choice matrix's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const choiceMatrixMessages = defineMessages('choice-matrix', en)
