import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** Accessible name of the trigger while children are folded into the menu. */
  moreItems: (count: number) => (count === 1 ? `${count} more item` : `${count} more items`),
  /** The same, when the folded children include the current page or the selected item. */
  moreItemsCurrent: (count: number) => (count === 1 ? `${count} more item, including current item` : `${count} more items, including current item`),
  /** Accessible name of the trigger when nothing is folded and only `menu` rows are listed, and of the menu itself. */
  more: 'More items',
}

/** The overflow list's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const overflowListMessages = defineMessages('overflow-list', en)
