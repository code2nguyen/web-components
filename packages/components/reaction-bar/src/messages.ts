import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** Accessible name of the bar. */
  label: 'Reactions',
  /** The button that opens the choice of reactions, and the popup it opens. */
  add: 'Add reaction',
  /** Accessible name of the row of quick reactions in the popup. */
  quick: 'Quick reactions',
  /** A reaction's accessible name: its emoji and how many people reacted with it. Whether you did is its pressed state. */
  reaction: (emoji: string, count: number) => `${emoji}, ${count === 1 ? '1 reaction' : `${count} reactions`}`,
  /** A read-only reaction's accessible name, which has no pressed state to say whether you reacted. */
  readonlyReaction: (emoji: string, count: number, reacted: boolean) =>
    `${emoji}, ${count === 1 ? '1 reaction' : `${count} reactions`}${reacted ? ', including yours' : ''}`,
}

/** The reaction bar's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const reactionBarMessages = defineMessages('reaction-bar', en)
