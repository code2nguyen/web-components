import { addTranslations } from '@c2n/core/localize.js'
import type { descriptionListMessages } from '../src/messages.js'

// The French an app would add: the library ships its text in English only.
const fr: typeof descriptionListMessages.en = {
  empty: 'Non renseigné',
  edit: (label) => `Modifier ${label}`,
}

addTranslations({ fr: { 'description-list': fr } })
