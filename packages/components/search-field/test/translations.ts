import { addTranslations } from '@c2n/core/localize.js'
import { searchFieldMessages } from '../src/messages.js'

// The French and Vietnamese an app would add: the library ships its text in English only.

const fr: typeof searchFieldMessages.en = {
  search: 'Rechercher',
  clearSearch: 'Effacer la recherche',
  recent: 'Recherches récentes',
  clear: 'Effacer',
  clearRecent: 'Effacer les recherches récentes',
}

const vi: typeof searchFieldMessages.en = {
  search: 'Tìm kiếm',
  clearSearch: 'Xóa nội dung tìm kiếm',
  recent: 'Tìm kiếm gần đây',
  clear: 'Xóa',
  clearRecent: 'Xóa các tìm kiếm gần đây',
}

addTranslations({ fr: { 'search-field': fr }, vi: { 'search-field': vi } })
