import { addTranslations } from '@c2n/core/localize.js'
import { facetListMessages } from '../src/messages.js'

// The French an app would add: the library ships its text in English only.

const fr: typeof facetListMessages.en = {
  label: 'Filtre',
  clear: 'Effacer',
  clearLabel: (facet) => `Effacer ${facet}`,
  search: 'Filtrer les valeurs',
  onlyText: 'Seul',
  only: (value) => `Seulement ${value}`,
  exclude: (value) => `Exclure ${value}`,
  include: (value) => `Inclure ${value}`,
  valueName: (value, count) => (count ? `${value}, ${count}` : value),
  excluded: (name) => `${name}, exclu`,
  showAll: (count) => `Tout afficher (${count})`,
  showFewer: 'Afficher moins',
  noMatches: 'Aucune valeur',
}

addTranslations({ fr: { 'facet-list': fr } })
