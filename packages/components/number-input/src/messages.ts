import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** Accessible name of the decrement control. */
  decrease: 'Decrease value',
  /** Accessible name of the increment control. */
  increase: 'Increase value',
  /** Accessible name of the decrement control of a named field: two fields on a page then have steppers a screen reader can tell apart. */
  decreaseNamed: (name: string) => `Decrease ${name}`,
  /** Accessible name of the increment control of a named field. */
  increaseNamed: (name: string) => `Increase ${name}`,
}

/** The number input's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const numberInputMessages = defineMessages('number-input', en)
