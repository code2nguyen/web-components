import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** A required native select with nothing chosen. The browser's own message follows its UI language, not the page's. */
  valueMissing: 'Please select an option.',
}

/** The native select's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const nativeSelectMessages = defineMessages('native-select', en)
