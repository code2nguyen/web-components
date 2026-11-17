import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** Visible text of the trigger that opens the folded tabs (`overflow="menu"`). */
  more: 'More',
  /** Accessible name of that trigger, with the number of folded tabs. */
  moreTabs: (count: number) => (count === 1 ? `${count} more tab` : `${count} more tabs`),
  /** Accessible name of the menu listing the folded tabs. */
  moreMenu: 'More tabs',
}

/** The tab strip's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const tabsMessages = defineMessages('tabs', en)
