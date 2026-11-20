import { addTranslations } from '@c2n/core/localize.js'

// The French an app would add: the library ships its text in English only.
addTranslations({
  fr: {
    'query-input': {
      label: 'Requête de recherche',
      fields: 'Champs',
      removeFilter: 'Retirer le filtre',
      clear: 'Effacer la requête',
    },
  },
})
