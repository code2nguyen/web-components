import { defineMessages } from '@c2n/core/localize.js'

const en = {
  hours: 'Hours',
  minutes: 'Minutes',
  seconds: 'Seconds',
  period: 'AM/PM',
  now: 'Now',
  done: 'Done',
  open: 'Open time picker',
}

/** The time input's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const timeInputMessages = defineMessages('time-input', en)
