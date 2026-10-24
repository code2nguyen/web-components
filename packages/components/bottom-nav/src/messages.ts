import { defineMessages } from '@c2n/core/localize.js'

const en = {
  navigationLabel: 'Main',
  newCount: (count: string) => `${count} new`,
  newActivity: 'new activity',
}

/** The bottom navigation's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const bottomNavMessages = defineMessages('bottom-nav', en)
