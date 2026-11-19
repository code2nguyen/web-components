import { addTranslations } from '@c2n/core/localize.js'

// The French an app would add: the library ships its text in English only.
addTranslations({
  fr: {
    'state-timeline': {
      label: "Chronologie d'états",
      noData: 'Aucune donnée',
      segment: '{0}, {1}, {2}',
      inSeries: '{0} : {1}',
      now: 'actuellement {0}',
      outside: '{0} hors {1}',
      noTime: 'aucun temps',
      left: 'encore {0}',
    },
  },
})
