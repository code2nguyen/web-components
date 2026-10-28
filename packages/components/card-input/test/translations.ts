import { addTranslations } from '@c2n/core/localize.js'
import { cardInputMessages } from '../src/messages.js'

// The French an app would add: the library ships its text in English only.

const fr: typeof cardInputMessages.en = {
  label: 'Coordonnées de la carte',
  number: 'Numéro de carte',
  expiry: "Date d'expiration (MM / AA)",
  cvc: 'Code de sécurité',
  numberPlaceholder: '1234 1234 1234 1234',
  expiryPlaceholder: 'MM / AA',
  cvcPlaceholder: 'CVC',
  valueMissing: 'Veuillez saisir les coordonnées de votre carte.',
  numberIncomplete: 'Le numéro de carte est incomplet.',
  numberInvalid: 'Le numéro de carte est invalide.',
  unsupported: (brand) => `Les cartes ${brand} ne sont pas acceptées.`,
  unsupportedUnknown: "Ce type de carte n'est pas accepté.",
  expiryIncomplete: "La date d'expiration est incomplète.",
  expiryInvalid: "Le mois d'expiration est invalide.",
  expiryPast: "La date d'expiration est passée.",
  cvcIncomplete: 'Le code de sécurité est incomplet.',
}

addTranslations({ fr: { 'card-input': fr } })
