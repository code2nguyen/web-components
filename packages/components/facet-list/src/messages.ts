import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** Accessible name of the facet when it has no `label`. */
  label: 'Filter',
  /** The button that empties the selection, and its accessible name. */
  clear: 'Clear',
  clearLabel: (facet: string) => `Clear ${facet}`,
  /** Placeholder and accessible name of the field that filters the values. */
  search: 'Filter values',
  /** The per-value actions: the visible text of the Only button, and the accessible names. */
  onlyText: 'Only',
  only: (value: string) => `Only ${value}`,
  exclude: (value: string) => `Exclude ${value}`,
  include: (value: string) => `Include ${value}`,
  /** A value's checkbox as a screen reader hears it: its label and count, and whether it is excluded. */
  valueName: (value: string, count: string) => (count ? `${value}, ${count}` : value),
  excluded: (name: string) => `${name}, excluded`,
  /** The button that shows the values past `max-items`, and the one that hides them again. */
  showAll: (count: number) => `Show all ${count}`,
  showFewer: 'Show fewer',
  /** Shown when the search matches no value. */
  noMatches: 'No values match',
}

/** The facet list's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const facetListMessages = defineMessages('facet-list', en)
