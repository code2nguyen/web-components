import { addTranslations } from '@c2n/core/localize.js'
import { checkboxMessages } from '../src/messages.js'

// The French and Vietnamese an app would add: the library ships its text in English only.

const fr: typeof checkboxMessages.en = {
  valueMissing: 'Veuillez cocher cette case.',
  groupValueMissing: 'Veuillez sélectionner au moins une option.',
  groupRangeUnderflow: (min: number) => (min === 1 ? 'Veuillez sélectionner au moins une option.' : `Veuillez sélectionner au moins ${min} options.`),
  groupRangeOverflow: (max: number) => (max === 1 ? 'Veuillez sélectionner une seule option.' : `Veuillez sélectionner ${max} options au maximum.`),
}

const vi: typeof checkboxMessages.en = {
  valueMissing: 'Vui lòng đánh dấu vào ô này.',
  groupValueMissing: 'Vui lòng chọn ít nhất một mục.',
  groupRangeUnderflow: (min: number) => `Vui lòng chọn ít nhất ${min} mục.`,
  groupRangeOverflow: (max: number) => `Vui lòng chọn tối đa ${max} mục.`,
}

addTranslations({ fr: { checkbox: fr }, vi: { checkbox: vi } })
