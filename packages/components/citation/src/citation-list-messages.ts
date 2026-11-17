import { defineMessages } from '@c2n/core/localize.js'

// Its own module rather than `messages.ts`: only the list of sources loads this text.
const en = {
  /** The toggle's text: how many sources the answer used. */
  summary: (count: number) => (count === 1 ? 'Used 1 source' : `Used ${count} sources`),
  /** The name of the list of source cards. */
  label: 'Sources',
  /** A card's name: the source's number and its title. */
  card: (index: string, title: string) => `Source ${index}: ${title}`,
}

/** The list of sources' interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const citationListMessages = defineMessages('citation-list', en)
