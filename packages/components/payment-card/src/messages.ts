import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** Accessible name of the card when it has no `label`. */
  card: 'Payment card',
  /** The button that asks for the details. */
  show: 'Show details',
  /** The button that masks the details again. */
  hide: 'Hide details',
  /** Field caption. */
  holder: 'Cardholder',
  /** Field caption. */
  expires: 'Expires',
  /** Field caption. */
  cvc: 'CVC',
  /** Read for the masked number: `{0}` is the last four digits. */
  endingIn: (last4: string) => `Card ending in ${last4}`,
  /** Read for the shown number: `{0}` is the number, without spaces. */
  number: (number: string) => `Card number ${number}`,
  /** Accessible name of the copy button of the number. */
  copyNumber: 'Copy card number',
  /** Accessible name of the copy button of the expiry. */
  copyExpiry: 'Copy expiry date',
  /** Accessible name of the copy button of the security code. */
  copyCvc: 'Copy security code',
  /** The badge of a frozen card. */
  frozen: 'Frozen',
  /** Announced when the details are shown. */
  shown: 'Card details shown',
  /** Announced when the details are masked again. */
  hidden: 'Card details hidden',
  /** Read while the details load. */
  loading: 'Loading card details',
}

/** The payment card's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const paymentCardMessages = defineMessages('payment-card', en)
