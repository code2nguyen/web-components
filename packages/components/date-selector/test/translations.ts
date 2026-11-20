import { addTranslations } from '@c2n/core/localize.js'

// The French an app would add: the library ships its text in English only.
addTranslations({
  fr: {
    'date-selector': {
      previousMonth: 'Mois précédent',
      inComparison: 'Dans la période de comparaison',
      disabledReason: (date: string, reason: string) => `${date}, ${reason}`,
      missingRange: 'Choisissez une date de début et de fin',
    },
  },
})
