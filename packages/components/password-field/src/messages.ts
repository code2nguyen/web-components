import { defineMessages } from '@c2n/core/localize.js'

const en = {
  // The field's own text. Each text property (`toggle-label`, `caps-lock-text`, `requirements-message`,
  // `strength-labels`) still overrides its message on one field.
  // The field's own name when nothing else names it; `password` below is the generator's Password option, which a
  // language may word differently.
  fieldName: 'Password',
  toggle: 'Show password',
  capsLock: 'Caps Lock is on',
  requirementsUnmet: 'The password does not meet every requirement.',
  requirements: 'Password requirements',
  // Appended to a requirement's label for screen readers, with its separator: "One number, met".
  requirementMet: ', met',
  requirementNotMet: ', not met',
  minLength: (min: number) => `At least ${min} characters`,
  lowercaseLetter: 'One lowercase letter',
  uppercaseLetter: 'One uppercase letter',
  number: 'One number',
  symbol: 'One symbol',
  meter: 'Password strength',
  strength0: 'Too weak',
  strength1: 'Weak',
  strength2: 'Fair',
  strength3: 'Good',
  strength4: 'Strong',
  // The generator's text (`generator`): the generate button, then its popover, which loads on first use.
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
