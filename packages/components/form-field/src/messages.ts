import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** Shown after the label of an optional field when `necessity="optional"`. */
  optional: 'Optional',
  /** Read before an error by screen readers, so the error does not rely on colour. */
  errorPrefix: 'Error:',
  /** Read before a warning by screen readers. */
  warningPrefix: 'Warning:',
  /** Announced as the counter nears the limit. */
  charactersLeft: (count: number) => (count === 1 ? `${count} character left` : `${count} characters left`),
  valueMissing: 'Fill in this field.',
  valueMissingChoice: 'Select an option.',
  valueMissingCheck: 'Check this box to continue.',
  typeMismatch: 'Enter a valid value.',
  typeMismatchEmail: 'Enter an email address, like name@example.com.',
  typeMismatchUrl: 'Enter a web address, like https://example.com.',
  patternMismatch: 'Use the requested format.',
  tooShort: (min: number) => `Use at least ${min} characters.`,
  tooLong: (max: number) => `Use ${max} characters or fewer.`,
  rangeUnderflow: (min: string) => `Enter ${min} or more.`,
  rangeOverflow: (max: string) => `Enter ${max} or less.`,
  stepMismatch: 'Enter a valid value.',
  badInput: 'Enter a valid value.',
}

/** The field's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const formFieldMessages = defineMessages('form-field', en)
