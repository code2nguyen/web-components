import { addTranslations } from '@c2n/core/localize.js'
import { pivotTableMessages } from '../src/messages.js'
import { agingTableMessages } from '../src/aging-table-messages.js'

// The French an app would add: the library ships its text in English only.

const fr: typeof pivotTableMessages.en = {
  table: 'Tableau croisé',
  total: 'Total',
  grandTotal: 'Total général',
  groupTotal: (group) => `Total ${group}`,
  valueOf: (aggregate, field) => `${aggregate} de ${field}`,
  sum: 'Somme',
  count: 'Nombre',
  avg: 'Moyenne',
  min: 'Min',
  max: 'Max',
  distinct: 'Nombre distinct',
  computedOf: (compute, a, b) => `${compute} : ${a} et ${b}`,
  difference: 'Écart',
  'percent-difference': 'Écart en %',
  ratio: 'Ratio',
  fields: 'Champs',
  rows: 'Lignes',
  columns: 'Colonnes',
  values: 'Valeurs',
  fieldList: 'Champs du tableau croisé',
  moveToRows: 'Déplacer vers les lignes',
  moveToColumns: 'Déplacer vers les colonnes',
  moveToValues: 'Déplacer vers les valeurs',
  remove: 'Retirer',
  fieldOptions: (field) => `Options de ${field}`,
  layout: (rows, columns, values) => `Lignes : ${rows}. Colonnes : ${columns}. Valeurs : ${values}.`,
  none: 'aucun',
  empty: 'Aucune donnée',
  sortBy: (column) => `Trier par ${column}`,
}

addTranslations({ fr: { 'pivot-table': fr } })

const agingFr: typeof agingTableMessages.en = {
  table: 'Balance âgée',
  asOf: (date) => `Au ${date}`,
  current: 'Non échu',
  range: (from, to) => `${from} à ${to} j`,
  over: (days) => `Plus de ${days} j`,
  noDate: 'Sans date',
  age: 'Ancienneté',
}

addTranslations({ fr: { 'aging-table': agingFr } })
