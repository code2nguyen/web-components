import { addTranslations } from '@c2n/core/localize.js'
import { toastMessages } from '../src/messages.js'

// The French and Vietnamese an app would add: the library ships its text in English only.

const fr: typeof toastMessages.en = {
  dismiss: 'Fermer la notification',
  region: 'Notifications',
}

const vi: typeof toastMessages.en = {
  dismiss: 'Đóng thông báo',
  region: 'Thông báo',
}

addTranslations({ fr: { toast: fr }, vi: { toast: vi } })
