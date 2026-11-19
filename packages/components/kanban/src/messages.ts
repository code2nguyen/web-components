import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** Shown while a column holds no card (the `empty` slot's default). */
  empty: 'No cards',
  /** How to move a card with the keyboard, read as the description of an editable column's cards. */
  instructions: 'Press Space to pick up a card. Use the arrow keys, Home or End to move it; Space drops it and Escape cancels.',
}

/** The kanban column's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const kanbanMessages = defineMessages('kanban', en)
