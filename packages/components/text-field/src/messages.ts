import { defineMessages } from '@c2n/core/localize.js'

const en = {
  clear: 'Clear',
}

const fr: typeof en = {
  clear: 'Effacer',
}

const vi: typeof en = {
  clear: 'Xóa',
}

/** The text field's interface text: English, French and Vietnamese, picked from the nearest `lang`. */
export const textFieldMessages = defineMessages('text-field', en, { fr, vi })
