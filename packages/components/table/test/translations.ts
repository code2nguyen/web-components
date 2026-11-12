import { addTranslations } from '@c2n/core/localize.js'
import { tableMessages } from '../src/messages.js'

// The French an app would add: the library ships its text in English only.
const fr: typeof tableMessages.en = {
  detailToggle: 'Détails',
}

addTranslations({ fr: { table: fr } })
