import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** Accessible name and placeholder of the field when it has no `label`. */
  label: 'Promo code',
  /** The button that applies the typed code. */
  apply: 'Apply',
  /** The link that opens a collapsed field. */
  add: 'Add a promo code',
  /** Accessible name of a token's remove button: `{0}` is the code. */
  remove: (code: string) => `Remove ${code}`,
  /** Announced when a code is accepted: `{0}` is the code. */
  applied: (code: string) => `${code} applied`,
  /** Announced when a code with a saving is accepted: `{0}` is the code, `{1}` the saving ("−$12.00"). */
  appliedWith: (code: string, label: string) => `${code} applied: ${label}`,
  /** Announced when a token is removed: `{0}` is the code. */
  removed: (code: string) => `${code} removed`,
  /** The error for a code typed again: `{0}` is the code. */
  alreadyApplied: (code: string) => `${code} is already applied`,
  /** The error when `validate` throws instead of answering. */
  failed: 'This code could not be checked. Try again.',
  /** Accessible name of the list of applied codes. */
  codes: 'Applied codes',
}

/** The promo code field's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const promoCodeFieldMessages = defineMessages('promo-code-field', en)
