import { addTranslations } from '@c2n/core/localize.js'

// The French an app would add: the library ships its text in English only.
addTranslations({
  fr: {
    'json-viewer': {
      schema: 'Schéma',
      required: 'obligatoire',
      deprecated: 'obsolète',
      option: 'Option {0}',
      maxLength: '≤ {0} caractères',
      default: 'par défaut {0}',
    },
  },
})
