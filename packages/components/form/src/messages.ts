import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** Heading of the error summary. */
  summaryHeading: (count: number) => (count === 1 ? 'There is a problem with this form' : `There are ${count} problems with this form`),
}

/** The form's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const formMessages = defineMessages('form', en)
