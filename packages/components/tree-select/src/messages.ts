import { defineMessages } from '@c2n/core/localize.js'

const en = {
  valueMissing: 'Please select an option.',
  search: 'Search',
  clearSearch: 'Clear search',
  clearSelection: 'Clear selection',
  remove: (label: string) => `Remove ${label}`,
  selected: (count: number) => `${count} selected`,
  matches: (count: number) => (count === 1 ? '1 match' : `${count} matches`),
  noMatch: (query: string) => `No match for “${query}”`,
  clear: 'Clear',
  done: 'Done',
  empty: 'No options',
}

/** The tree select's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const treeSelectMessages = defineMessages('tree-select', en)
