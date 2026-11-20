import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** Placeholder of the search field. */
  placeholder: 'Type a command or search…',
  /** Accessible name of the search field and the list. */
  label: 'Search commands',
  /** Shown when no row matches (the `empty` slot's default). */
  empty: 'No results found.',
}

/** The command palette's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const commandMessages = defineMessages('command', en)
