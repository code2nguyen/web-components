import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** The sheet's heading, with and without the name of what is shared. */
  heading: (name: string) => (name ? `Share “${name}”` : 'Share'),
  /** The read-only field holding the link. */
  link: 'Link',
  copy: 'Copy link',
  copied: 'Copied',
  /** The list of share targets. */
  targets: 'Share to',
  /** A target's accessible name, from its visible name. */
  shareOn: (name: string) => `Share on ${name}`,
  /** Visible names of the targets that are not networks. */
  email: 'Email',
  sms: 'Message',
  more: 'More',
  /** Accessible names of those targets. */
  shareByEmail: 'Share by email',
  shareBySms: 'Share by text message',
  moreOptions: 'More sharing options',
  /** The QR code's accessible name. */
  qr: (url: string) => `QR code for ${url}`,
}

/** The share sheet's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const shareSheetMessages = defineMessages('share-sheet', en)
