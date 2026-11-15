import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** Accessible name when the meter has no label. */
  label: 'Meter',
  /** Shown and announced for a segmented meter: the segments' sum against the maximum. */
  total: (value: string, max: string) => `${value} of ${max}`,
  /** One segment as the screen reader hears it. */
  segment: (label: string, value: string) => `${label}: ${value}`,
  /** Legend label and announced name of the part past `max` in a meter with `overage`. */
  overage: 'Over limit',
}

/** The meter's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const meterMessages = defineMessages('meter', en)
