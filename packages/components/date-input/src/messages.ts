import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** Accessible name of the calendar popover (`picker="calendar"`). */
  calendar: 'Calendar',
  today: 'Today',
  clear: 'Clear',
}

/** The date input's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const dateInputMessages = defineMessages('date-input', en)
