import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** Accessible name of the field when nothing else names it. */
  label: 'Search query',
  /** Heading of the suggestions while a key is typed. */
  fields: 'Fields',
  /** Start of a chip's remove button's name, the chip's text following ("Remove filter service:web"). */
  removeFilter: 'Remove filter',
  /** Accessible name of the button that empties the query. */
  clear: 'Clear query',
}

/** The query input's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const queryInputMessages = defineMessages('query-input', en)
