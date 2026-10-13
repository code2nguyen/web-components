import { defineMessages } from '@c2n/core/localize.js'

const en = {
  dismiss: 'Dismiss notification',
  region: 'Notifications',
}

const fr: typeof en = {
  dismiss: 'Fermer la notification',
  region: 'Notifications',
}

const vi: typeof en = {
  dismiss: 'Đóng thông báo',
  region: 'Thông báo',
}

/** The toast's and toast region's interface text: English, French and Vietnamese, picked from the nearest `lang`. */
export const toastMessages = defineMessages('toast', en, { fr, vi })
