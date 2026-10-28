import { addTranslations } from '@c2n/core/localize.js'
import { choiceMatrixMessages } from '../src/messages.js'

// The French an app would add: the library ships its text in English only.

const fr: typeof choiceMatrixMessages.en = {
  label: 'Choix',
  toggleRow: (row) => `Tout ${row}`,
  toggleColumn: (column) => `${column} pour tous`,
  toggleGroup: (column, group) => `${column} pour ${group}`,
  rowsMissing: 'Veuillez répondre à chaque ligne.',
  valueMissing: 'Veuillez sélectionner au moins une option.',
}

addTranslations({ fr: { 'choice-matrix': fr } })
