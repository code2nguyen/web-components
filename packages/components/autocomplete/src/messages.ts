import { defineMessages } from '@c2n/core/localize.js'

const en = {
  loading: 'Loading suggestions…',
  loadError: 'Could not load suggestions.',
  empty: 'No suggestions found.',
  clear: 'Clear',
  suggestions: 'Suggestions',
  suggestionsFor: (label: string) => `${label} suggestions`,
  valueMissing: 'Please fill out this field.',
}

/** The autocomplete's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const autocompleteMessages = defineMessages('autocomplete', en)
