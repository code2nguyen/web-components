import { addTranslations } from '@c2n/core/localize.js'
import { quantityPickerMessages } from '../src/messages.js'

// The French an app would add: the library ships its text in English only.

const fr: typeof quantityPickerMessages.en = {
  none: 'Aucun',
  done: 'Terminé',
  decrease: (label) => `Diminuer ${label}`,
  increase: (label) => `Augmenter ${label}`,
  upTo: (max) => `Jusqu’à ${max}`,
  full: (total, max) => `${total} sur ${max}, le maximum`,
  changed: (summary) => `Maintenant ${summary}`,
}

addTranslations({ fr: { 'quantity-picker': fr } })
