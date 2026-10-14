import { defineMessages } from '@c2n/core/localize.js'

const en = {
  currency: 'Currency',
  valueMissing: 'Enter an amount.',
  rangeUnderflow: (min: string) => `Enter ${min} or more.`,
  rangeOverflow: (max: string) => `Enter ${max} or less.`,
}

/** The money input's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const moneyInputMessages = defineMessages('money-input', en)
