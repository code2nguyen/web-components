import { defineMessages } from '@c2n/core/localize.js'

const en = {
  display: (label: string, text: string) => `${label}: ${text}`,
  save: 'Save',
  cancel: 'Cancel',
  valueMissing: 'Please fill in this field.',
}

/** The inline edit's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const inlineEditMessages = defineMessages('inline-edit', en)
