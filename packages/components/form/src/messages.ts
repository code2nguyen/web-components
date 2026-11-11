import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** Heading of the error summary. */
  summaryHeading: (count: number) => (count === 1 ? 'There is a problem with this form' : `There are ${count} problems with this form`),
}

/** The form's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const formMessages = defineMessages('form', en)

const formListEn = {
  /** Default add button of `c2-form-list`. */
  add: 'Add another',
  /** Announced after a row is added or duplicated. */
  added: (position: number) => `Row ${position} added`,
  /** Announced after a row is removed. */
  removed: (position: number) => `Row ${position} removed`,
  /** Announced after a row is moved. */
  moved: (position: number, total: number) => `Row moved to position ${position} of ${total}`,
}

/** `c2-form-list`'s interface text in English, translated under the `form-list` name. */
export const formListMessages = defineMessages('form-list', formListEn)
