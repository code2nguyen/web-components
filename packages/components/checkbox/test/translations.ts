import { addTranslations } from '@c2n/core/localize.js'
import { checkboxMessages } from '../src/messages.js'

// The French and Vietnamese an app would add: the library ships its text in English only.

const fr: typeof checkboxMessages.en = {
  valueMissing: 'Veuillez cocher cette case.',
  groupValueMissing: 'Veuillez sélectionner au moins une option.',
}

const vi: typeof checkboxMessages.en = {
  valueMissing: 'Vui lòng đánh dấu vào ô này.',
  groupValueMissing: 'Vui lòng chọn ít nhất một mục.',
}

addTranslations({ fr: { checkbox: fr }, vi: { checkbox: vi } })
