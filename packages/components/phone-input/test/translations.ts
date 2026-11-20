import { addTranslations } from '@c2n/core/localize.js'

// The French an app would add: the library ships its text in English only.
addTranslations({
  fr: {
    'phone-input': {
      label: 'Numéro de téléphone',
      country: 'Pays : {0} (+{1})',
      valueMissing: 'Saisissez un numéro de téléphone.',
      patternMismatch: 'Saisissez un numéro de téléphone valide pour {0}.',
      search: 'Chercher un pays',
      empty: 'Aucun pays trouvé',
    },
  },
})
