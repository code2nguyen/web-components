import { defineMessages } from '@c2n/core/localize.js'

const en = {
  find: 'Find',
  replaceWith: 'Replace with',
  previous: 'Previous match',
  next: 'Next match',
  matchCase: 'Match case',
  /** The match case toggle's glyph. */
  matchCaseGlyph: 'Aa',
  wholeWord: 'Match whole word',
  /** The whole word toggle's glyph. */
  wholeWordGlyph: 'ab',
  close: 'Close',
  replace: 'Replace',
  replaceAll: 'Replace all',
  count: (current: number, total: number) => `${current} of ${total}`,
  noResults: 'No results',
}

/** The find bar's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const findBarMessages = defineMessages('highlight', en)
