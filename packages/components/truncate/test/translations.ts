import { addTranslations } from '@c2n/core/localize.js'
import { truncateMessages } from '../src/messages.js'

// The French an app would add: the library ships its text in English only.

const fr: typeof truncateMessages.en = {
  more: 'Afficher plus',
  less: 'Afficher moins',
}

addTranslations({ fr: { truncate: fr } })
