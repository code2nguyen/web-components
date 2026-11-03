import { addTranslations } from '@c2n/core/localize.js'
import { promoCodeFieldMessages } from '../src/messages.js'

// The French an app would add: the library ships its text in English only.

const fr: typeof promoCodeFieldMessages.en = {
  label: 'Code promo',
  apply: 'Appliquer',
  add: 'Ajouter un code promo',
  remove: (code) => `Retirer ${code}`,
  applied: (code) => `${code} appliqué`,
  appliedWith: (code, label) => `${code} appliqué : ${label}`,
  removed: (code) => `${code} retiré`,
  alreadyApplied: (code) => `${code} est déjà appliqué`,
  failed: 'Ce code n’a pas pu être vérifié. Réessayez.',
  codes: 'Codes appliqués',
}

addTranslations({ fr: { 'promo-code-field': fr } })
