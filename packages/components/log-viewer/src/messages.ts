import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** Accessible name of the scroll area when the element has no `aria-label`. */
  content: 'Log content',
  /** Empty state with no retained entries. */
  noEntries: 'No log entries',
  /** Empty state when the filter hides every entry. */
  noMatches: 'No matching entries',
  /** Tooltip of an entry's copy button. */
  copy: 'Copy message',
  /** Accessible name of an entry's copy button. */
  copyEntry: (index: number) => `Copy message ${index}`,
  /** Tooltip of the copy button after a copy. */
  copied: 'Copied',
  /** Announced after a copy. */
  copiedEntry: (index: number) => `Copied message ${index}`,
  /** Announced when the clipboard refused the copy. */
  copyFailed: 'Unable to copy message. Try again.',
  /** Accessible name and placeholder of the find field, and name of the find bar. */
  find: 'Find in log',
  /** The find bar's counter. */
  findCount: (current: number, total: number) => `${current} of ${total}`,
  /** Announced when the current match changes. */
  findMatch: (current: number, total: number) => `Match ${current} of ${total}`,
  /** Announced when moving past the last match back to the first, or the reverse. */
  findWrapped: (current: number, total: number) => `Match ${current} of ${total}, wrapped`,
  /** Counter and announcement when nothing matches. */
  findNone: 'No results',
  /** The match case toggle. */
  matchCase: 'Match case',
  /** The previous match button. */
  previousMatch: 'Previous match',
  /** The next match button. */
  nextMatch: 'Next match',
  /** The button closing the find bar. */
  closeFind: 'Close find',
}

/** The log viewer's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const logViewerMessages = defineMessages('log-viewer', en)
