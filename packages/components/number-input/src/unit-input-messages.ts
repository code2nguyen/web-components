import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** Accessible name of the unit picker. */
  unit: 'Unit',
  /** The value in the base unit, when the conversion is exact: `= 24 ea`. */
  equivalent: (amount: string, unit: string) => `= ${amount} ${unit}`,
  /** The value in the base unit, when it was rounded for display: `≈ 1.134 kg`. */
  approximately: (amount: string, unit: string) => `≈ ${amount} ${unit}`,
}

/** The unit input's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const unitInputMessages = defineMessages('unit-input', en)
