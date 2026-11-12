import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** Accessible name of the chevron that opens a row's detail panel. */
  detailToggle: 'Details',
}

/** The table's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const tableMessages = defineMessages('table', en)
