import { addTranslations } from '@c2n/core/localize.js'
import { choiceMatrixMessages } from '../src/messages.js'
import type { inputMatrixMessages } from '../src/input-matrix-messages.js'
import type { recordMergeMessages } from '../src/record-merge-messages.js'
import type { scorecardMessages } from '../src/scorecard-messages.js'

// The French an app would add: the library ships its text in English only.

const fr: typeof choiceMatrixMessages.en = {
  label: 'Choix',
  toggleRow: (row) => `Tout ${row}`,
  toggleColumn: (column) => `${column} pour tous`,
  toggleGroup: (column, group) => `${column} pour ${group}`,
  rowsMissing: 'Veuillez répondre à chaque ligne.',
  valueMissing: 'Veuillez sélectionner au moins une option.',
  useAll: 'Tout prendre',
  useAllFrom: (column) => `Tout prendre de ${column}`,
}

const inputMatrix: typeof inputMatrixMessages.en = {
  label: 'Valeurs',
  total: 'Total',
  inputMissing: 'Veuillez saisir au moins une valeur.',
  badInput: (row, column) => `Saisissez une valeur valide pour ${row}, ${column}.`,
  rangeUnderflow: (row, column, min) => `${row}, ${column} doit valoir au moins ${min}.`,
  rangeOverflow: (row, column, max) => `${row}, ${column} doit valoir au plus ${max}.`,
  duration: (hours, minutes) => `${hours} h ${minutes}`,
}

const recordMerge: typeof recordMergeMessages.en = {
  result: 'Résultat',
  emptyValue: 'Vide',
  label: 'Fusionner les fiches',
}

const scorecard: typeof scorecardMessages.en = {
  label: "Grille d'évaluation",
  score: 'Note',
  total: 'Total',
  points: (earned, possible) => `${earned} / ${possible}`,
  notApplicable: 'S.O.',
  critical: 'Critique',
  weight: (weight) => `×${weight}`,
  weightName: (weight) => `, coefficient ${weight}`,
  separator: ', ',
  noScore: '–',
  answered: (answered, total) => `${answered} sur ${total} renseignés`,
  failed: (criteria) => `Échec : ${criteria}`,
}

addTranslations({ fr: { 'choice-matrix': fr, 'input-matrix': inputMatrix, 'record-merge': recordMerge, scorecard } })
