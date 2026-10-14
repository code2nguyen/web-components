import { defineMessages } from '@c2n/core/localize.js'

const en = {
  open: 'Open date and time picker',
  calendar: 'Choose a date',
  previousMonth: 'Previous month',
  nextMonth: 'Next month',
  time: 'Time',
  timeZone: 'Time zone',
  now: 'Now',
  done: 'Done',
}

/** The date-time picker's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const dateTimePickerMessages = defineMessages('date-time-picker', en)
