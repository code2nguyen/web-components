import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** Accessible name when the indicator has no label. */
  label: 'Range',
  /** Announced value: the shown value, then the label of the band it falls in. */
  valueInBand: (value: string, band: string) => `${value}, ${band}`,
}

/** The range indicator's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const rangeIndicatorMessages = defineMessages('range-indicator', en)
