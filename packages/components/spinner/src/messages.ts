import { defineMessages } from '@c2n/core/localize.js'

const en = {
  label: 'Loading',
}

/** The spinner's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const spinnerMessages = defineMessages('spinner', en)
