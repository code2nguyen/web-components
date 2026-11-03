import { addTranslations } from '@c2n/core/localize.js'
import { paymentCardMessages } from '../src/messages.js'

// The French an app would add: the library ships its text in English only.

const fr: typeof paymentCardMessages.en = {
  card: 'Carte de paiement',
  show: 'Afficher les détails',
  hide: 'Masquer les détails',
  holder: 'Titulaire',
  expires: 'Expire',
  cvc: 'CVC',
  endingIn: (last4) => `Carte se terminant par ${last4}`,
  number: (number) => `Numéro de carte ${number}`,
  copyNumber: 'Copier le numéro de carte',
  copyExpiry: 'Copier la date d’expiration',
  copyCvc: 'Copier le code de sécurité',
  frozen: 'Gelée',
  shown: 'Détails de la carte affichés',
  hidden: 'Détails de la carte masqués',
  loading: 'Chargement des détails de la carte',
}

addTranslations({ fr: { 'payment-card': fr } })
