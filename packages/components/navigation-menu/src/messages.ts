import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** Accessible name of the button shown in `mobile` mode. */
  mobile: 'Menu',
}

/** The navigation menu's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const navigationMenuMessages = defineMessages('navigation-menu', en)
