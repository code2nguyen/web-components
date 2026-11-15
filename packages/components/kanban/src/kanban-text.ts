/**
 * What `c2-kanban` announces while a card moves, in English. The board itself is not translated yet; a variant built on
 * it (`c2-matrix-board`) registers these keys in its own message catalog, so its announcements follow the page
 * language. Positions arrive counted from 1.
 */
export const kanbanText = {
  /** Name of a card whose label field is empty. */
  card: 'Card',
  /** A card picked up with the keyboard. */
  pickedUp: (card: string, column: string, position: number, count: number) =>
    `${card} picked up in ${column}, position ${position} of ${count}. Use the arrow keys to move it, Space to drop it, Escape to cancel.`,
  /** A card picked up with a pointer. */
  dragStarted: (card: string) => `${card} picked up.`,
  /** A card the keyboard moved one step. */
  moved: (card: string, column: string, position: number, count: number) => `${card} moved to ${column}, position ${position} of ${count}.`,
  /** A card dropped in a new place. */
  dropped: (card: string, column: string, position: number, count: number) => `${card} dropped in ${column}, position ${position} of ${count}.`,
  /** A card dropped with the keyboard where it was picked up. */
  droppedInPlace: (card: string) => `${card} dropped where it was.`,
  /** Escape after a keyboard pick-up. */
  returned: (card: string, column: string, position: number) => `${card} returned to ${column}, position ${position}.`,
  /** A pointer drag that was canceled. */
  returnedInPlace: (card: string) => `${card} returned to where it was.`,
  /** The application canceled the `card-move` event. */
  refused: (card: string, column: string) => `${card} could not move to ${column} and returned to where it was.`,
  /** The arrow key points past the top of the column. */
  atTop: (card: string) => `${card} is already at the top of its column.`,
  /** The arrow key points past the bottom of the column. */
  atBottom: (card: string) => `${card} is already at the bottom of its column.`,
  /** The arrow key points before the first column. */
  atStart: (card: string) => `${card} is already in the first column.`,
  /** The arrow key points after the last column. */
  atEnd: (card: string) => `${card} is already in the last column.`,
  /** The board stopped being editable during a move. */
  readOnly: 'Moving canceled because the board is no longer editable.',
  /** The application replaced `items` during a move. */
  itemsChanged: 'Cards changed. Moving canceled.',
}

export type KanbanText = typeof kanbanText
export type KanbanTextKey = keyof KanbanText
export type KanbanTextArgs<K extends KanbanTextKey> = KanbanText[K] extends (...args: infer A) => string ? A : []
