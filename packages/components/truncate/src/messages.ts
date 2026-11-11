import { defineMessages } from '@c2n/core/localize.js'

const en = {
  more: 'Show more',
  less: 'Show less',
}

/** The truncate's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const truncateMessages = defineMessages('truncate', en)
