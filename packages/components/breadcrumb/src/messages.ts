import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** Accessible name of the navigation landmark. */
  label: 'Breadcrumb',
  /** Accessible name of the ellipsis that shows the collapsed items, `{0}` being how many. */
  showMore: (count: number) => `Show ${count} more items`,
}

/** The breadcrumb's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const breadcrumbMessages = defineMessages('breadcrumb', en)
