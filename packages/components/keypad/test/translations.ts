import { addTranslations } from '@c2n/core/localize.js'

// The French an app would add: the library ships its text in English only.
addTranslations({
  fr: {
    keypad: {
      amount: 'Montant',
      pin: 'Code',
      keypad: 'Pavé numérique',
      delete: 'Effacer',
      decimal: 'Virgule',
      entered: { one: '{0} chiffre sur {1}', other: '{0} chiffres sur {1}' },
      incomplete: 'Saisissez les {0} chiffres.',
      required: 'Saisissez une valeur.',
    },
  },
})
