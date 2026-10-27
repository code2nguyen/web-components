import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** Accessible name of the list when it has no `label`. */
  label: 'Ranking',
  /** The button that shows the rows past `max-items`, and the one that hides them again. */
  showAll: (count: number) => `Show all ${count}`,
  showFewer: 'Show fewer',
  /** Shown when there are no items. */
  empty: 'No data',
}

/** The bar list's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const barListMessages = defineMessages('bar-list', en)
