import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** Accessible name of the field when it has no `label` and no field label. */
  label: 'Card details',
  /** The three inputs' accessible names. */
  number: 'Card number',
  expiry: 'Expiry date (MM / YY)',
  cvc: 'Security code',
  /** Their placeholders. */
  numberPlaceholder: '1234 1234 1234 1234',
  expiryPlaceholder: 'MM / YY',
  cvcPlaceholder: 'CVC',
  /** Validation messages. */
  valueMissing: 'Please enter your card details.',
  numberIncomplete: 'Your card number is incomplete.',
  numberInvalid: 'Your card number is invalid.',
  unsupported: (brand: string) => `${brand} cards are not accepted.`,
  unsupportedUnknown: 'This card type is not accepted.',
  expiryIncomplete: "Your card's expiry date is incomplete.",
  expiryInvalid: "Your card's expiry month is invalid.",
  expiryPast: "Your card's expiry date is in the past.",
  cvcIncomplete: "Your card's security code is incomplete.",
}

/** The card input's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const cardInputMessages = defineMessages('card-input', en)
