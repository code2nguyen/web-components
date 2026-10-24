import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** Accessible name of the button, and of its speed dial, when `label` is not set. */
  actions: 'Actions',
}

/** The float button's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const floatButtonMessages = defineMessages('float-button', en)
