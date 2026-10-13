import { defineMessages } from '@c2n/core/localize.js'

const en = {
  valueMissing: 'Please select an option.',
}

const fr: typeof en = {
  valueMissing: 'Veuillez sélectionner une option.',
}

const vi: typeof en = {
  valueMissing: 'Vui lòng chọn một mục.',
}

/** The select's interface text: English, French and Vietnamese, picked from the nearest `lang`. */
export const selectMessages = defineMessages('select', en, { fr, vi })
