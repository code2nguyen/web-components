import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** The indicator's accessible name, `{0}` being how many items it hides ("3 more"). */
  more: (count: number) => `${count} more`,
  /** Text of the button that collapses an expanded group. */
  collapse: 'Show less',
}

/** The chip group's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const chipGroupMessages = defineMessages('chip-group', en)
