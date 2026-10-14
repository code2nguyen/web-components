import { defineMessages } from '@c2n/core/localize.js'

const en = {
  search: 'Search',
  clearSearch: 'Clear search',
  recent: 'Recent searches',
  clear: 'Clear',
  clearRecent: 'Clear recent searches',
}

/** The search field's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const searchFieldMessages = defineMessages('search-field', en)
