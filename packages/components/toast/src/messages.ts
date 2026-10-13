import { defineMessages } from '@c2n/core/localize.js'

const en = {
  dismiss: 'Dismiss notification',
  region: 'Notifications',
}

/** The toast's and toast region's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const toastMessages = defineMessages('toast', en)
