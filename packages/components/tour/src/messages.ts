import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** Accessible name of the tour panel when the step has no heading. */
  label: 'Tour',
  /** The button that moves to the next step. */
  next: 'Next',
  /** The button that moves back one step. */
  previous: 'Back',
  /** The button on the last step that ends the tour. */
  done: 'Done',
  /** Accessible name of the close button, which ends the tour early. */
  close: 'Close tour',
  /** The progress line, e.g. "2 of 5". */
  progress: (index: number, count: number) => `${index} of ${count}`,
}

/** The tour's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const tourMessages = defineMessages('tour', en)
