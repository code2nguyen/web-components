import { addTranslations } from '@c2n/core/localize.js'
import { scrollAreaMessages } from '../src/messages.js'

// The French an app would add: the library ships its text in English only.

const fr: typeof scrollAreaMessages.en = {
  label: 'Contenu défilant',
}

addTranslations({ fr: { 'scroll-area': fr } })
