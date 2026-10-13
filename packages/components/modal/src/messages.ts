import { defineMessages } from '@c2n/core/localize.js'

const en = {
  close: 'Close',
}

const fr: typeof en = {
  close: 'Fermer',
}

const vi: typeof en = {
  close: 'Đóng',
}

/** The modal's interface text: English, French and Vietnamese, picked from the nearest `lang`. */
export const modalMessages = defineMessages('modal', en, { fr, vi })
