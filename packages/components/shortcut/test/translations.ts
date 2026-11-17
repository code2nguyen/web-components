import { addTranslations } from '@c2n/core/localize.js'

// The French an app would add: the library ships its text in English only.
addTranslations({
  fr: {
    shortcut: {
      title: 'Raccourcis clavier',
      search: 'Rechercher un raccourci',
      general: 'Général',
      show: 'Afficher les raccourcis clavier',
      or: 'ou',
      then: 'puis',
      results: { one: '{0} raccourci', other: '{0} raccourcis' },
      noResults: 'Aucun raccourci ne correspond à « {0} »',
      empty: 'Aucun raccourci clavier',
    },
  },
})
