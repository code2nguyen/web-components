import { defineMessages } from '@c2n/core/localize.js'

const en = {
  day: 'Day',
  month: 'Month',
  year: 'Year',
  required: 'Enter a date',
  incomplete: 'Enter a full date',
  missingDay: 'Date must include a day',
  missingMonth: 'Date must include a month',
  missingYear: 'Date must include a year',
  badDay: 'Day must be a number from 1 to 31',
  badMonth: 'Month must be a number from 1 to 12',
  badYear: 'Year must have 4 digits',
  /** A day the month does not have: 31 April. */
  notReal: 'Date must be a real date',
  /** `{0}` is the earliest date, written out. */
  min: (date: string) => `Date must be on or after ${date}`,
  /** `{0}` is the latest date, written out. */
  max: (date: string) => `Date must be on or before ${date}`,
}

/** The date fields' interface text in English. An app adds its languages with `addTranslations`. */
export const dateFieldsMessages = defineMessages('date-fields', en)
