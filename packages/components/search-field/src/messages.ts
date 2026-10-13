import { defineMessages } from '@c2n/core/localize.js'

const en = {
  search: 'Search',
  clearSearch: 'Clear search',
  recent: 'Recent searches',
  clear: 'Clear',
  clearRecent: 'Clear recent searches',
}

const fr: typeof en = {
  search: 'Rechercher',
  clearSearch: 'Effacer la recherche',
  recent: 'Recherches récentes',
  clear: 'Effacer',
  clearRecent: 'Effacer les recherches récentes',
}

const vi: typeof en = {
  search: 'Tìm kiếm',
  clearSearch: 'Xóa nội dung tìm kiếm',
  recent: 'Tìm kiếm gần đây',
  clear: 'Xóa',
  clearRecent: 'Xóa các tìm kiếm gần đây',
}

/** The search field's interface text: English, French and Vietnamese, picked from the nearest `lang`. */
export const searchFieldMessages = defineMessages('search-field', en, { fr, vi })
