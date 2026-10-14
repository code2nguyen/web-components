import { addTranslations } from '@c2n/core/localize.js'
import { switchMessages } from '../src/messages.js'

// The French and Vietnamese an app would add: the library ships its text in English only.

const fr: typeof switchMessages.en = {
  valueMissing: 'Veuillez activer cet interrupteur.',
}

const vi: typeof switchMessages.en = {
  valueMissing: 'Vui lòng bật công tắc này.',
}

addTranslations({ fr: { switch: fr }, vi: { switch: vi } })
