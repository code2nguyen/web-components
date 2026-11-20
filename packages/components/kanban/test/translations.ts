import { addTranslations } from '@c2n/core/localize.js'
import type { matrixBoardMessages } from '../src/matrix-board-messages.js'

// The French an app would add: the library ships its text in English only.

const matrixBoard: typeof matrixBoardMessages.en = {
  card: 'Carte',
  pickedUp: (card, column, position, count) =>
    `${card} prise dans ${column}, position ${position} sur ${count}. Déplacez-la avec les flèches, posez-la avec Espace, annulez avec Échap.`,
  dragStarted: (card) => `${card} prise.`,
  moved: (card, column, position, count) => `${card} déplacée dans ${column}, position ${position} sur ${count}.`,
  dropped: (card, column, position, count) => `${card} posée dans ${column}, position ${position} sur ${count}.`,
  droppedInPlace: (card) => `${card} reposée à sa place.`,
  returned: (card, column, position) => `${card} revenue dans ${column}, position ${position}.`,
  returnedInPlace: (card) => `${card} revenue à sa place.`,
  refused: (card, column) => `${card} ne peut pas aller dans ${column} et revient à sa place.`,
  atTop: (card) => `${card} est déjà sur la première ligne.`,
  atBottom: (card) => `${card} est déjà sur la dernière ligne.`,
  atStart: (card) => `${card} est déjà dans la première colonne.`,
  atEnd: (card) => `${card} est déjà dans la dernière colonne.`,
  readOnly: 'Déplacement annulé : le tableau n’est plus modifiable.',
  itemsChanged: 'Les cartes ont changé. Déplacement annulé.',
  instructions:
    'Appuyez sur Espace pour prendre une carte. Déplacez-la entre les cases avec les flèches, dans une case avec Début ou Fin ; Espace la pose et Échap annule.',
  axisValue: (title, value) => `${title} : ${value}`,
  cell: (row, column) => `${row}, ${column}`,
  namedCell: (label, row, column) => `${label} (${row}, ${column})`,
}

addTranslations({ fr: { 'matrix-board': matrixBoard } })

addTranslations({
  fr: {
    kanban: {
      // The board's announcements are the matrix board's keys: the same French, without its grid words.
      card: matrixBoard.card,
      pickedUp: matrixBoard.pickedUp,
      moved: matrixBoard.moved,
      dropped: matrixBoard.dropped,
      returned: matrixBoard.returned,
      empty: 'Aucune carte',
      instructions: 'Appuyez sur Espace pour prendre une carte. Déplacez-la avec les flèches, Début ou Fin ; Espace la pose et Échap annule.',
    },
  },
})
