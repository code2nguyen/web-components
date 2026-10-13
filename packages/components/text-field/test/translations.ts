import { addTranslations } from '@c2n/core/localize.js'
import { textFieldMessages } from '../src/messages.js'

// The French and Vietnamese an app would add: the library ships its text in English only.

const fr: typeof textFieldMessages.en = {
  clear: 'Effacer',
}

const vi: typeof textFieldMessages.en = {
  clear: 'Xóa',
}

addTranslations({ fr: { 'text-field': fr }, vi: { 'text-field': vi } })
