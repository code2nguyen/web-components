import { addTranslations } from '@c2n/core/localize.js'

// The French an app would add: the library ships its text in English only.
addTranslations({
  fr: {
    'signature-pad': {
      label: 'Signature',
      placeholder: 'Signez ici',
      empty: 'Pas encore signé',
      signed: 'Signé',
      undo: 'Annuler',
      clear: 'Effacer',
      required: 'Signez dans le cadre.',
    },
  },
})
