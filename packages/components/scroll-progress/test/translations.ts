import { addTranslations } from '@c2n/core/localize.js'
import { scrollProgressMessages } from '../src/messages.js'

// The French an app would add: the library ships its text in English only.

const fr: typeof scrollProgressMessages.en = {
  label: 'Progression de la lecture',
}

addTranslations({ fr: { 'scroll-progress': fr } })
