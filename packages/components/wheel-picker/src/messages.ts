import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** Accessible name of the picker when it has no `label` and no field label. */
  label: 'Choose a value',
  /** Accessible name of a wheel whose column has no label: its place among the wheels. */
  wheel: (index: number, count: number) => `Wheel ${index} of ${count}`,
}

/** The wheel picker's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const wheelPickerMessages = defineMessages('wheel-picker', en)
