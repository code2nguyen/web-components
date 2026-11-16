import { defineMessages } from '@c2n/core/localize.js'

// Its own module rather than `messages.ts`, which the table of contents imports: only the index bar loads this text.
const en = {
  label: 'Index',
}

/** The index bar's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const indexBarMessages = defineMessages('index-bar', en)
