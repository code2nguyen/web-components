import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** Accessible name of the keypad when it has no `label` and no field label, with an amount display. */
  amount: 'Amount',
  /** Accessible name of the keypad when it has no `label` and no field label, with PIN dots. */
  pin: 'PIN',
  /** Accessible name of the keypad when it has no `label`, no field label and no display. */
  keypad: 'Keypad',
  /** The key that deletes the last character. */
  delete: 'Delete',
  /** The decimal point key, read out. */
  decimal: 'Decimal point',
  /** Read after each key of a PIN: "`{0}` of `{1}` digits entered". */
  entered: (count: number, length: number) => `${count} of ${length} digits entered`,
  /** Validation message of a PIN that is not complete: `{0}` is its length. */
  incomplete: (length: number) => `Enter all ${length} digits.`,
  /** Validation message of a `required` keypad that is empty. */
  required: 'Enter a value.',
}

/** The keypad's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const keypadMessages = defineMessages('keypad', en)
