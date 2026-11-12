import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** Accessible name of the thumb when the element has no `aria-label`. */
  label: 'Saturation and brightness',
  /** Spoken value of the thumb: `{0}` is the saturation and `{1}` the brightness, both in percent. */
  valueText: (saturation: number, brightness: number) => `Saturation ${saturation}%, brightness ${brightness}%`,
}

/** The colour area's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const colorAreaMessages = defineMessages('color-area', en)
