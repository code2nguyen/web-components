import { addTranslations } from '@c2n/core/localize.js'

// The French an app would add: the library ships its text in English only.
addTranslations({
  fr: {
    'file-preview': {
      label: 'Aperçu de {0}',
      counter: '{0} sur {1}',
      previous: 'Fichier précédent',
      next: 'Fichier suivant',
      text: 'Texte',
    },
  },
})
