import { addTranslations } from '@c2n/core/localize.js'
import { modalMessages } from '../src/messages.js'

// The French and Vietnamese an app would add: the library ships its text in English only.

const fr: typeof modalMessages.en = {
  close: 'Fermer',
}

const vi: typeof modalMessages.en = {
  close: 'Đóng',
}

addTranslations({ fr: { modal: fr }, vi: { modal: vi } })
