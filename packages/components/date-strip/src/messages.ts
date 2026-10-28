import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** Accessible name of the strip when it has no `label` and no field label. */
  label: 'Choose a day',
  /** The buttons that page through the days. */
  previous: 'Earlier days',
  next: 'Later days',
  /** A day with a marker, as a screen reader hears it: the date, then the marker's label or this word. */
  marked: (date: string, marker: string) => `${date}, ${marker}`,
  hasEvents: 'has events',
  /** The validation message of a required strip. */
  valueMissing: 'Please choose a day.',
}

/** The date strip's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const dateStripMessages = defineMessages('date-strip', en)
