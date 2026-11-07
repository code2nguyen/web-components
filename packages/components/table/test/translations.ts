import { addTranslations } from '@c2n/core/localize.js'
import { tableMessages } from '../src/messages.js'

// The French an app would add: the library ships its text in English only.

const fr: typeof tableMessages.en = {
  empty: 'Aucune ligne',
  noMatches: 'Aucune ligne correspondante',
  noValue: 'Sans valeur',
  selectAll: 'Sélectionner toutes les lignes',
  selectRow: 'Sélectionner la ligne',
  selectGroup: (group) => `Sélectionner les lignes de ${group}`,
  rowDetails: 'Détails de la ligne',
  editCell: (column) => `Modifier ${column}`,
  sortedAscending: (column) => `Trié par ${column}, croissant`,
  sortedDescending: (column) => `Trié par ${column}, décroissant`,
  sortCleared: 'Tri retiré',
  groupExpanded: (group, count) => `${group} déplié, ${count} ${count === 1 ? 'ligne' : 'lignes'}`,
  groupCollapsed: (group) => `${group} replié`,
  filtered: (shown, total) => `${shown} sur ${total} lignes`,
  columnMoved: (column, position, total) => `${column} déplacée en position ${position} sur ${total}`,
}

addTranslations({ fr: { table: fr } })
