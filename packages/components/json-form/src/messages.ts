import { defineMessages } from '@c2n/core/localize.js'

const en = {
  required: 'Fill in this field.',
  requiredChoice: 'Select an option.',
  invalid: 'Enter a valid value.',
  formatEmail: 'Enter an email address, like name@example.com.',
  formatUri: 'Enter a web address, like https://example.com.',
  formatDate: 'Enter a date.',
  formatTime: 'Enter a time.',
  pattern: 'Use the requested format.',
  enum: 'Select one of the options.',
  minLength: (limit: number) => `Use at least ${limit} characters.`,
  maxLength: (limit: number) => `Use ${limit} characters or fewer.`,
  minimum: (limit: number) => `Enter ${limit} or more.`,
  maximum: (limit: number) => `Enter ${limit} or less.`,
  exclusiveMinimum: (limit: number) => `Enter more than ${limit}.`,
  exclusiveMaximum: (limit: number) => `Enter less than ${limit}.`,
  multipleOf: (limit: number) => `Enter a multiple of ${limit}.`,
  minItems: (limit: number) => (limit === 1 ? 'Add at least 1 item.' : `Add at least ${limit} items.`),
  maxItems: (limit: number) => (limit === 1 ? 'Add no more than 1 item.' : `Add no more than ${limit} items.`),
  uniqueItems: 'Remove the duplicate items.',
  /** Placeholder of a select with nothing chosen. */
  selectPlaceholder: 'Select…',
  /** Button under a list of repeated items. */
  addItem: 'Add',
  /** Button on each repeated item. */
  removeItem: 'Remove',
  /** Heading of one repeated item, e.g. "Item 2". */
  item: (position: number) => `Item ${position}`,
  /** Stepper navigation. */
  previous: 'Back',
  next: 'Next',
}

/** The form's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const jsonFormMessages = defineMessages('json-form', en)
