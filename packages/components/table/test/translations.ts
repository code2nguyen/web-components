import { addTranslations } from '@c2n/core/localize.js'
import { tableMessages } from '../src/messages.js'

// The French an app would add: the library ships its text in English only.
const fr: typeof tableMessages.en = {
  detailToggle: 'Détails',
  statusTitle: (column, label) => `${column} : ${label}`,
  summaryOffTarget: (target) => `devrait être ${target}`,
  selectGroupRows: 'Sélectionner les lignes du groupe',
  emptyGroup: 'Sans valeur',
  editCell: (column) => `Modifier ${column}`,
  errorRequired: 'Obligatoire',
  errorNumber: 'Saisissez un nombre',
  errorDate: 'Saisissez une date',
  errorUrl: 'Saisissez une adresse web',
  errorOption: 'Choisissez une des options',
}

addTranslations({ fr: { table: fr } })
