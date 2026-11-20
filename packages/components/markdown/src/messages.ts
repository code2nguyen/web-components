import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** Accessible name of the scrolling region around a table. */
  table: 'Table',
}

/** The markdown's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const markdownMessages = defineMessages('markdown', en)
