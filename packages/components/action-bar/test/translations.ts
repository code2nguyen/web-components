import { addTranslations } from '@c2n/core/localize.js'

// The French an app would add: the library ships its text in English only.
addTranslations({
  fr: {
    'action-bar': {
      selected: { one: '{0} sélectionné', other: '{0} sélectionnés' },
      clear: 'Effacer la sélection',
      actions: 'Actions sur la sélection',
    },
  },
})
