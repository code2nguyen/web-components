import { defineMessages } from '@c2n/core/localize.js'

const en = {
  valueMissing: 'Please turn on this switch.',
}

const fr: typeof en = {
  valueMissing: 'Veuillez activer cet interrupteur.',
}

const vi: typeof en = {
  valueMissing: 'Vui lòng bật công tắc này.',
}

/** The switch's interface text: English, French and Vietnamese, picked from the nearest `lang`. */
export const switchMessages = defineMessages('switch', en, { fr, vi })
