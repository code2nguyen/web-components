import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** The summary line of a list with `summary`: how many of its steps are finished. */
  summary: (completed: number, total: number) => `${completed} of ${total} completed`,
}

/** The steps list's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const stepsMessages = defineMessages('steps', en)
