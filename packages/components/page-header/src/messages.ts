import { defineMessages } from '@c2n/core/localize.js'

const en = {
  moreActions: 'More actions',
  backTo: (label: string) => `Back to ${label}`,
}

/** The page header's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const pageHeaderMessages = defineMessages('page-header', en)
