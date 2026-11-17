import { defineMessages } from '@c2n/core/localize.js'

// The generator's text (`generator`): the generate button, then its popover, which loads on first use.
const en = {
  generate: 'Generate password',
  suggestion: 'Suggested password',
  regenerate: 'Generate another',
  copy: 'Copy password',
  use: 'Use password',
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
  noSuggestion: 'No suggestion fits the rules of this field.',
  strength: 'Strength of the suggestion',
  entropy: (bits: number) => `about ${bits} bits`,
}

// The password field's interface text in English. An app adds its languages with `addTranslations`.
export const passwordFieldMessages = defineMessages('password-field', en)
