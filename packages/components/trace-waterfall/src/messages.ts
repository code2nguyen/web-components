import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** Accessible name of the span tree. */
  label: 'Trace',
  /** Shown while there are no spans (the `empty` slot's default). */
  empty: 'No spans',
  /** Accessible name of the mark of a failed span. */
  error: 'Error',
}

/** The trace waterfall's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const traceWaterfallMessages = defineMessages('trace-waterfall', en)
