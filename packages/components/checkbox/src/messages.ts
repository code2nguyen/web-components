import { defineMessages } from '@c2n/core/localize.js'

const en = {
  valueMissing: 'Please check this box.',
  groupValueMissing: 'Please select at least one option.',
}

const fr: typeof en = {
  valueMissing: 'Veuillez cocher cette case.',
  groupValueMissing: 'Veuillez sélectionner au moins une option.',
}

const vi: typeof en = {
  valueMissing: 'Vui lòng đánh dấu vào ô này.',
  groupValueMissing: 'Vui lòng chọn ít nhất một mục.',
}

/** The checkbox's and checkbox group's interface text: English, French and Vietnamese, picked from the nearest `lang`. */
export const checkboxMessages = defineMessages('checkbox', en, { fr, vi })
