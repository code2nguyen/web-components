import { defineMessages } from '@c2n/core/localize.js'

const lines = (count: number) => (count === 1 ? '1 line' : `${count} lines`)

const en = {
  /** The review's accessible name when it has no `label`. */
  review: 'Change review',
  /** The review bar's accessible name. */
  bar: 'Review',
  /** The bar's position: `{0}` is the current hunk, `{1}` how many there are. */
  progress: (current: number, total: number) => `Hunk ${current} of ${total}`,
  /** How many hunks are still open: `{0}`. */
  left: (count: number) => `${count} left`,
  previous: 'Previous change',
  next: 'Next change',
  acceptAll: 'Accept all',
  rejectAll: 'Reject all',
  accept: 'Accept',
  reject: 'Reject',
  undo: 'Undo',
  /** A hunk's Accept button: `{0}` is its number. */
  acceptChange: (index: number) => `Accept change ${index}`,
  /** A hunk's Reject button: `{0}` is its number. */
  rejectChange: (index: number) => `Reject change ${index}`,
  /** A decided hunk's Undo button: `{0}` is its number. */
  undoChange: (index: number) => `Undo change ${index}`,
  /** A button's tooltip with its shortcut: `{0}` is the button's text, `{1}` the keys. */
  shortcut: (label: string, keys: string) => `${label} (${keys})`,
  /** A hunk's title: `{0}` is its number, `{1}` its line range. */
  changeTitle: (index: number, range: string) => `Change ${index} · ${range}`,
  /** A one-line range: `{0}` is the line. */
  line: (line: number) => `line ${line}`,
  /** A line range: `{0}` and `{1}` are its first and last line. */
  lineRange: (first: number, last: number) => `lines ${first}–${last}`,
  /** A hunk's accessible name: `{0}` its number, `{1}` how many hunks, `{2}` lines removed, `{3}` lines added. */
  changeLabel: (index: number, total: number, removed: number, added: number) =>
    `Change ${index} of ${total}: ${removed ? `${lines(removed)} removed` : 'nothing removed'}, ${added ? `${added} added` : 'nothing added'}`,
  /** Read before an added line. */
  added: 'Added:',
  /** Read before a removed line. */
  removed: 'Removed:',
  accepted: 'Accepted',
  rejected: 'Rejected',
  /** An accepted hunk that only removed lines. */
  removedLines: (count: number) => `${lines(count)} removed`,
  /** A rejected hunk that only added lines. */
  notAdded: (count: number) => `${lines(count)} not added`,
  /** The run of unchanged lines between two hunks: `{0}` is how many. */
  unchanged: (count: number) => (count === 1 ? '1 unchanged line' : `${count} unchanged lines`),
  /** The summary once every hunk is decided: `{0}` is how many hunks. */
  allReviewed: (count: number) => (count === 1 ? 'The change is reviewed' : `All ${count} changes reviewed`),
  /** The counts under the summary: `{0}` accepted, `{1}` rejected. */
  summary: (accepted: number, rejected: number) => `${accepted} accepted · ${rejected} rejected`,
  startOver: 'Start over',
  noChanges: 'No changes',
  /** The header's line counts for screen readers: `{0}` added, `{1}` removed. */
  stats: (added: number, removed: number) => `${added} added, ${removed} removed`,
  /** Announced after a decision: `{0}` is the hunk's number, `{1}` how many are left. */
  announceAccepted: (index: number, left: number) => `Change ${index} accepted. ${left} left.`,
  announceRejected: (index: number, left: number) => `Change ${index} rejected. ${left} left.`,
  /** Announced after an undo: `{0}` is the hunk's number. */
  announceUndone: (index: number) => `Change ${index} is open again.`,
  /** Announced once every hunk is decided: `{0}` accepted, `{1}` rejected. */
  announceDone: (accepted: number, rejected: number) => `All changes reviewed: ${accepted} accepted, ${rejected} rejected.`,
  /** Announced after Start over. */
  announceReset: 'Every change is open again.',
}

/** The change review's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const changeReviewMessages = defineMessages('change-review', en)
