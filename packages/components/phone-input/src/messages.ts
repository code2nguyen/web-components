import { defineMessages } from '@c2n/core/localize.js'

const en = {
  label: 'Phone number',
  country: (name: string, dialCode: string) => `Country: ${name} (+${dialCode})`,
  valueMissing: 'Please enter a phone number.',
  patternMismatch: (country: string) => `Please enter a valid phone number for ${country}.`,
  /** Placeholder and accessible name of the country search field. */
  search: 'Search countries',
  /** Shown when no country matches the search. */
  empty: 'No country found',
}

/** The phone input's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const phoneInputMessages = defineMessages('phone-input', en)
