import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** Accessible name of the generate button and of the generator popover (`generator`). */
  generate: 'Generate password',
  /** Label of the suggested password in the generator. */
  suggestion: 'Suggested password',
  /** The button that draws another suggestion. */
  regenerate: 'Generate another',
  copy: 'Copy password',
  /** The button that puts the suggestion in the field. */
  use: 'Use password',
  /** Accessible name of the password / passphrase switch. */
  kind: 'Kind of password',
  password: 'Password',
  passphrase: 'Passphrase',
  length: 'Length',
  lowercase: 'Lowercase (a–z)',
  uppercase: 'Uppercase (A–Z)',
  numbers: 'Numbers (0–9)',
  symbols: 'Symbols (!@#)',
  words: 'Words',
  separator: 'Separator',
  capitalize: 'Capitalize words',
  includeNumber: 'Include a number',
  /** Shown in place of a suggestion when the options cannot meet the field's length limits or requirements. */
  noSuggestion: 'No suggestion fits the rules of this field.',
  /** Accessible name of the strength meter of the suggestion. */
  strength: 'Strength of the suggestion',
  /** The suggestion's entropy, after its strength label. */
  entropy: (bits: number) => `about ${bits} bits`,
}

/** The password field's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const passwordFieldMessages = defineMessages('password-field', en)
