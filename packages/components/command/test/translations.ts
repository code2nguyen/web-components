import { addTranslations } from '@c2n/core/localize.js'

// The French an app would add: the library ships its text in English only.
addTranslations({
  fr: {
    command: {
      placeholder: 'Saisissez une commande ou cherchez…',
      label: 'Chercher une commande',
      empty: 'Aucun résultat.',
    },
  },
})
