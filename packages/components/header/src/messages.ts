import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** Accessible name of the primary navigation landmark. */
  navigation: 'Primary',
}

/** The header's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const headerMessages = defineMessages('header', en)
