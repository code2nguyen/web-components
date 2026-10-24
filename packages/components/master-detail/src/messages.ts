import { defineMessages } from '@c2n/core/localize.js'

const en = {
  back: 'Back',
  details: 'Details',
}

/** The master-detail layout's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const masterDetailMessages = defineMessages('master-detail', en)
