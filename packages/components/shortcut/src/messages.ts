import { defineMessages } from '@c2n/core/localize.js'

/** The interface text of `c2-shortcut-sheet`: its heading, the search field, the words between keys and its empty states. */
const en = {
  /** Heading of the dialog. */
  title: 'Keyboard shortcuts',
  /** Accessible name and placeholder of the search field. */
  search: 'Search shortcuts',
  /** Heading of the shortcuts that name no `group`, when others do. */
  general: 'General',
  /** Description of the sheet's own `keys`. */
  show: 'Show keyboard shortcuts',
  /** Between two alternatives of one shortcut: `⌘K or ⌘/`. */
  or: 'or',
  /** Between the strokes of a sequence: `G then D`. */
  then: 'then',
  /** Announced while a search is under way. */
  results: (count: number) => (count === 1 ? '1 shortcut' : `${count} shortcuts`),
  /** Shown when the search matches nothing. */
  noResults: (query: string) => `No shortcuts match “${query}”`,
  /** Shown when there is no shortcut to list. */
  empty: 'No keyboard shortcuts',
}

export type ShortcutMessages = typeof en

/** The sheet's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const shortcutMessages = defineMessages('shortcut', en)
