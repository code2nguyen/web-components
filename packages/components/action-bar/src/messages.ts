import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** The count line, also announced when the count changes. */
  selected: (count: number) => `${count} selected`,
  /** Accessible name of the clear button. */
  clear: 'Clear selection',
  /** Accessible name of the bar itself. */
  actions: 'Selection actions',
}

/** The action bar's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const actionBarMessages = defineMessages('action-bar', en)
