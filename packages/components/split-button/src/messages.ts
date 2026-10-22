import { defineMessages } from '@c2n/core/localize.js'

const en = {
  caretLabel: (label: string) => `More ${label} options`,
  caretLabelPlain: 'More options',
  currentChoice: (label: string) => `Current: ${label}`,
}

/** The split button's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const splitButtonMessages = defineMessages('split-button', en)
