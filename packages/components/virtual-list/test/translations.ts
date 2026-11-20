import { addTranslations } from '@c2n/core/localize.js'
import { virtualListMessages } from '../src/messages.js'

// The French an app would add: the library ships its text in English only.
const fr: typeof virtualListMessages.en = {
  empty: 'Aucun élément',
  noResults: 'Aucun résultat',
  loadingMore: 'Chargement…',
  loadMoreFailed: 'Impossible de charger la suite',
  retry: 'Réessayer',
  label: 'Éléments',
  search: 'Rechercher',
}

addTranslations({ fr: { 'virtual-list': fr } })
