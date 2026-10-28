import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** Accessible name of the indicator when it has no `label`. */
  label: 'Reading progress',
}

/** The scroll progress's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const scrollProgressMessages = defineMessages('scroll-progress', en)
