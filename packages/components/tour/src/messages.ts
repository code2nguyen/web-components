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
  /** The footer button that ends the tour early. */
  skip: 'Skip',
  /** Accessible name of the close button, which ends the tour early. */
  close: 'Close tour',
  /** The progress line, e.g. "2 of 5". */
  progress: (index: number, count: number) => `${index} of ${count}`,
  /** `c2-beacon`: the button in a tip that dismisses it for good. */
  dismiss: 'Got it',
  /** `c2-beacon`: accessible name of the pulsing dot that opens a tip, with the tip's heading. */
  beacon: (heading: string) => `Show tip: ${heading}`,
  /** `c2-beacon`: accessible name of the pulsing dot of a tip without a heading. */
  beaconUnnamed: 'Show tip',
}

/** The tour's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const tourMessages = defineMessages('tour', en)
