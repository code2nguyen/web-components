import { addTranslations } from '@c2n/core/localize.js'
import { sheetMessages } from '../src/messages.js'

// The French and Vietnamese an app would add: the library ships its text in English only.

const fr: typeof sheetMessages.en = {
  close: 'Fermer',
}

const vi: typeof sheetMessages.en = {
  close: 'Đóng',
}

addTranslations({ fr: { sheet: fr }, vi: { sheet: vi } })
