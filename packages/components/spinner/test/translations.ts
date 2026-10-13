import { addTranslations } from '@c2n/core/localize.js'
import { spinnerMessages } from '../src/messages.js'

// The French and Vietnamese an app would add: the library ships its text in English only.

const fr: typeof spinnerMessages.en = {
  label: 'Chargement',
}

const vi: typeof spinnerMessages.en = {
  label: 'Đang tải',
}

addTranslations({ fr: { spinner: fr }, vi: { spinner: vi } })
