import { defineMessages } from '@c2n/core/localize.js'

const en = {
  label: 'Loading',
}

const fr: typeof en = {
  label: 'Chargement',
}

const vi: typeof en = {
  label: 'Đang tải',
}

/** The spinner's interface text: English, French and Vietnamese, picked from the nearest `lang`. */
export const spinnerMessages = defineMessages('spinner', en, { fr, vi })
