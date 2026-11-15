import { defineMessages } from '@c2n/core/localize.js'
import { kanbanText } from './kanban-text'

const en = {
  ...kanbanText,
  /** The arrow key points past the top row. */
  atTop: (card: string) => `${card} is already in the top row.`,
  /** The arrow key points past the bottom row. */
  atBottom: (card: string) => `${card} is already in the bottom row.`,
  /** How to move a card, read with each card. */
  instructions: 'Press Space to pick up a card. Use the arrow keys to move it between cells, Home or End within one; Space drops it and Escape cancels.',
  /** An axis value with the axis title, in a cell's name: "Potential: High". */
  axisValue: (title: string, value: string) => `${title}: ${value}`,
  /** A cell's name, from its row and its column. */
  cell: (row: string, column: string) => `${row}, ${column}`,
  /** A cell's name when the cell has a label of its own. */
  namedCell: (label: string, row: string, column: string) => `${label} (${row}, ${column})`,
}

/** The matrix board's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const matrixBoardMessages = defineMessages('matrix-board', en)
