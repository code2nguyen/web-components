import { addTranslations } from '@c2n/core/localize.js'
import { shareSheetMessages } from '../src/messages.js'

// The French an app would add: the library ships its text in English only.

const fr: typeof shareSheetMessages.en = {
  heading: (name) => (name ? `Partager « ${name} »` : 'Partager'),
  link: 'Lien',
  copy: 'Copier le lien',
  copied: 'Copié',
  targets: 'Partager vers',
  shareOn: (name) => `Partager sur ${name}`,
  email: 'E-mail',
  sms: 'Message',
  more: 'Plus',
  shareByEmail: 'Partager par e-mail',
  shareBySms: 'Partager par SMS',
  moreOptions: 'Plus d’options de partage',
  qr: (url) => `QR code de ${url}`,
}

addTranslations({ fr: { 'share-sheet': fr } })
