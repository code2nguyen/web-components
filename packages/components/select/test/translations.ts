import { addTranslations } from '@c2n/core/localize.js'
import { selectMessages } from '../src/messages.js'

// The French and Vietnamese an app would add: the library ships its text in English only.

const fr: typeof selectMessages.en = {
  valueMissing: 'Veuillez sélectionner une option.',
}

const vi: typeof selectMessages.en = {
  valueMissing: 'Vui lòng chọn một mục.',
}

addTranslations({ fr: { select: fr }, vi: { select: vi } })
