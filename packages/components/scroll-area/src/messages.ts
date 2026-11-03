import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** Accessible name of the scroll region when it has no `label`. */
  label: 'Scrollable content',
}

/** The scroll area's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const scrollAreaMessages = defineMessages('scroll-area', en)
