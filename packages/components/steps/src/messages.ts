import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** The summary line of a list with `summary`: how many of its steps are finished. */
  summary: (completed: number, total: number) => `${completed} of ${total} completed`,
  /** A group's count under its label, with `group-progress`. */
  groupProgress: (completed: number, total: number) => `${completed} of ${total}`,
  // Read after each step's label, one per status, since the marker is a glyph.
  pending: 'Pending',
  current: 'Current',
  running: 'Running',
  success: 'Completed',
  error: 'Failed',
  warning: 'Completed with warnings',
  skipped: 'Skipped',
  locked: 'Locked',
}

/** The steps list's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const stepsMessages = defineMessages('steps', en)
