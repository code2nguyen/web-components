import { addTranslations } from '@c2n/core/localize.js'

// The French an app would add: the library ships its text in English only.
addTranslations({
  fr: {
    'number-input': {
      decrease: 'Diminuer la valeur',
      increase: 'Augmenter la valeur',
      decreaseNamed: 'Diminuer « {0} »',
      increaseNamed: 'Augmenter « {0} »',
    },
    'unit-input': {
      unit: 'Unité',
      equivalent: '= {0} {1}',
      approximately: '≈ {0} {1}',
    },
  },
})
