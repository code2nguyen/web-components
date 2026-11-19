import { addTranslations } from '@c2n/core/localize.js'

// The French an app would add: the library ships its text in English only.
addTranslations({
  fr: {
    spreadsheet: {
      editCell: 'Modifier {0}',
      formulaBar: 'Barre de formule, {0}',
      rowHeader: 'Ligne',
    },
  },
})
