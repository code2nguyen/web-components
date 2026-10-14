import { defineMessages } from '@c2n/core/localize.js'

const en = {
  valueMissing: 'Please select an option.',
}

/** The select's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const selectMessages = defineMessages('select', en)
