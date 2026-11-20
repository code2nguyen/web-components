import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** Accessible name of the calendar in `range` mode, unless `aria-label` or an enclosing field names it. */
  chooseRange: 'Choose a date range',
  /** Accessible name of the calendar in `single` mode. */
  chooseDate: 'Choose a date',
  /** Accessible name of the calendar in `multiple` mode. */
  chooseDates: 'Choose dates',
  previousMonth: 'Previous month',
  nextMonth: 'Next month',
  /** Validation message of a `required` range that is not complete. */
  missingRange: 'Choose a start and end date',
  /** Validation message of a `required` selector in `single` mode with no date. */
  missingDate: 'Choose a date',
  /** Validation message of a `required` selector in `multiple` mode with no date. */
  missingDates: 'Choose at least one date',
  /** Validation message of a `required` selector whose chosen day was closed afterwards (`disabled-dates`). */
  closedSelection: 'The chosen date is no longer available',
  /** Description of each day inside the comparison range (`compare-from` to `compare-to`). */
  inComparison: 'In the comparison period',
  /** A day given in `disabled-dates` with a reason: the date, then the reason. */
  disabledReason: (date: string, reason: string) => `${date}, ${reason}`,
}

/** The date selector's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const dateSelectorMessages = defineMessages('date-selector', en)
