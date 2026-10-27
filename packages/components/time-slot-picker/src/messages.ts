import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** Accessible name of the picker when it has no `label` and no field label. */
  label: 'Choose a time',
  /** Accessible name of the row of days. */
  day: 'Choose a day',
  /** Headings of the groups of times, by the hour they start. */
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
  /** Heading of the times when they are not grouped: the day they are on. */
  times: (date: string) => `Times on ${date}`,
  /** The line naming the time zone the times are shown in. */
  timesIn: (zone: string) => `Times in ${zone}`,
  /** A taken slot, as a screen reader hears it. */
  unavailable: (time: string) => `${time}, unavailable`,
  /** Shown on a day with no free time. */
  noTimes: (date: string) => `No times on ${date}`,
  /** The button that jumps to the next day with a free time. */
  nextAvailable: (date: string) => `Next available: ${date}`,
  /** Announced when the day changes. */
  available: (count: number, date: string) => (count === 1 ? `1 time available on ${date}` : `${count} times available on ${date}`),
  /** Announced, and read on the busy list, while the app loads times. */
  loading: 'Loading times',
  /** The validation message of a required picker. */
  valueMissing: 'Please choose a time.',
}

/** The time slot picker's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const timeSlotPickerMessages = defineMessages('time-slot-picker', en)
