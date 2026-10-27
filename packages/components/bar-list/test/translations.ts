import { addTranslations } from '@c2n/core/localize.js'
import { barListMessages } from '../src/messages.js'

// The French an app would add: the library ships its text in English only.

const fr: typeof barListMessages.en = {
  label: 'Classement',
  showAll: (count) => `Tout afficher (${count})`,
  showFewer: 'Afficher moins',
  empty: 'Aucune donnée',
}

addTranslations({ fr: { 'bar-list': fr } })
