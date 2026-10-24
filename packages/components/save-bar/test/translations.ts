import { addTranslations } from '@c2n/core/localize.js'

// The French an app would add: the library ships its text in English only.
addTranslations({
  fr: {
    'save-bar': {
      unsaved: 'Modifications non enregistrées',
      saving: 'Enregistrement…',
      save: 'Enregistrer',
      discard: 'Annuler',
      bar: 'Enregistrer les modifications',
    },
  },
})
