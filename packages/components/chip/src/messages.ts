import { defineMessages } from '@c2n/core/localize.js'

const en = {
  remove: 'Remove',
  removeItem: (text: string) => `Remove ${text}`,
}

/** The chip's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const chipMessages = defineMessages('chip', en)
