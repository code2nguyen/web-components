import { defineMessages } from '@c2n/core/localize.js'

const en = {
  label: 'Phone number',
  country: (name: string, dialCode: string) => `Country: ${name} (+${dialCode})`,
  valueMissing: 'Please enter a phone number.',
  patternMismatch: (country: string) => `Please enter a valid phone number for ${country}.`,
}

/** The phone input's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const phoneInputMessages = defineMessages('phone-input', en)
