import { defineMessages } from '@c2n/core/localize.js'

const en = {
  format: (format: string) => `Format: ${format}`,
  incomplete: (format: string) => `Enter a value in the format ${format}.`,
}

/** The mask input's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const maskInputMessages = defineMessages('mask-input', en)
