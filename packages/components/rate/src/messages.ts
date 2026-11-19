import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** Accessible name of the rating when nothing else names it. */
  label: 'Rating',
}

/** The rate's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const rateMessages = defineMessages('rate', en)
