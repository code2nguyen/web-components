import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** Accessible name of a slider in `angle` mode that has no `label` and no field label. */
  angle: 'Angle',
  /** Accessible name of a slider in `arc` mode that has no `label` and no field label. */
  value: 'Value',
  /** Spoken value in `angle` mode when no `formatValue` is set: `{0}` is the angle. */
  degrees: (angle: string) => `${angle} degrees`,
}

/** The angle slider's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const angleSliderMessages = defineMessages('angle-slider', en)
