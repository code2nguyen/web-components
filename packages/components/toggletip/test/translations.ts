import { addTranslations } from '@c2n/core/localize.js'
import { toggletipMessages } from '../src/messages.js'

// The French an app would add: the library ships its text in English only.

const fr: typeof toggletipMessages.en = {
  label: 'Plus d’informations',
}

addTranslations({ fr: { toggletip: fr } })
