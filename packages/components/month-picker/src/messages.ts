import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** Accessible name of the picker in month mode, and in year mode. */
  label: 'Choose a month',
  yearLabel: 'Choose a year',
  /** The buttons that page through the years. */
  previousYear: 'Previous year',
  nextYear: 'Next year',
  previousYears: 'Previous years',
  nextYears: 'Next years',
  /** The title button that switches from the months of a year to a grid of years, and back. */
  chooseYear: (year: string) => `${year}, choose a year`,
  backToMonths: (year: string) => `Back to the months of ${year}`,
  /** The validation message of a required picker. */
  valueMissing: 'Please choose a month.',
  yearMissing: 'Please choose a year.',
}

/** The month picker's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const monthPickerMessages = defineMessages('month-picker', en)
