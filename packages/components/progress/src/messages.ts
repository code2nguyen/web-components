import { defineMessages } from '@c2n/core/localize.js'

const en = {
  loading: 'Loading',
}

/** The progress indicator's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const progressMessages = defineMessages('progress', en)
