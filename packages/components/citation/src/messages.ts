import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** The marker's name when it has no number. */
  source: 'Source',
  /** The marker's name with its number. */
  numbered: (index: string) => `Source ${index}`,
  /** The marker's name followed by the cited page's title. */
  named: (source: string, title: string) => `${source}: ${title}`,
}

/** The citation's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const citationMessages = defineMessages('citation', en)
