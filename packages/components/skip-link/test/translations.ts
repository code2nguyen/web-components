import { addTranslations } from '@c2n/core/localize.js'
import { skipLinkMessages } from '../src/messages.js'

// The French and Vietnamese an app would add: the library ships its text in English only.

const fr: typeof skipLinkMessages.en = {
  label: 'Aller au contenu principal',
}

const vi: typeof skipLinkMessages.en = {
  label: 'Chuyển đến nội dung chính',
}

addTranslations({ fr: { 'skip-link': fr }, vi: { 'skip-link': vi } })
