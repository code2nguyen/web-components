import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** Accessible name of the picker in month, quarter, half-year and year mode. */
  label: 'Choose a month',
  quarterLabel: 'Choose a quarter',
  halfYearLabel: 'Choose a half-year',
  yearLabel: 'Choose a year',
  /** The buttons that page through the years. */
  previousYear: 'Previous year',
  nextYear: 'Next year',
  previousYears: 'Previous years',
  nextYears: 'Next years',
  /** The title button that switches from the months of a year to a grid of years, and back. */
  chooseYear: (year: string) => `${year}, choose a year`,
  backToMonths: (year: string) => `Back to the months of ${year}`,
  /** The same button back from the grid of years in quarter and half-year mode. */
  backToPeriods: (year: string) => `Back to ${year}`,
  /** The short name of a quarter and of a half-year, given its number. */
  quarter: (number: string) => `Q${number}`,
  halfYear: (number: string) => `H${number}`,
  /** A quarter or half-year with its year: "Q3 2026", "H1 FY2027". */
  period: (period: string, year: string) => `${period} ${year}`,
  /** A quarter or half-year cell's accessible name: its name and the months it covers. */
  periodMonths: (period: string, months: string) => `${period}, ${months}`,
  /** A fiscal year, named after the calendar year it ends in (with `fiscal-start`). */
  fiscalYear: (year: string) => `FY${year}`,
  /** The stepper's buttons, which move the value by one whole period. */
  previousPeriod: 'Previous period',
  nextPeriod: 'Next period',
  /** The validation message of a required picker. */
  valueMissing: 'Please choose a month.',
  quarterMissing: 'Please choose a quarter.',
  halfYearMissing: 'Please choose a half-year.',
  yearMissing: 'Please choose a year.',
}

/** The month picker's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const monthPickerMessages = defineMessages('month-picker', en)
