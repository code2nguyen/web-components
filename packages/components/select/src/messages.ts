import { defineMessages } from '@c2n/core/localize.js'

const en = {
  valueMissing: 'Please select an option.',
  /** Accessible name of the search field shown with `searchable`. */
  searchLabel: 'Filter options',
  /** Placeholder of the search field, unless `search-placeholder` is set. */
  searchPlaceholder: 'Search…',
  /** Shown in place of the rows when the search matches none (the `empty` slot replaces it). */
  empty: 'No matching options',
  /** Shown while `loading` is set (the `loading` slot replaces it). */
  loading: 'Loading…',
  /** The row that creates an option from the search text, with `creatable`. */
  create: (label: string) => `Create “${label}”`,
}

/** The select's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const selectMessages = defineMessages('select', en)
