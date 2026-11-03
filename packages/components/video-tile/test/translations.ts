import { addTranslations } from '@c2n/core/localize.js'
import { videoTileMessages } from '../src/messages.js'

// The French an app would add: the library ships its text in English only.

const fr: typeof videoTileMessages.en = {
  participant: 'Participant',
  you: (name) => `${name} (vous)`,
  screen: (name) => `Écran de ${name}`,
  muted: 'micro coupé',
  handRaised: 'main levée',
  pinned: 'épinglé',
  fairConnection: 'connexion instable',
  poorConnection: 'mauvaise connexion',
  described: (name, states) => `${name}, ${states}`,
  raisedHand: (name) => `${name} a levé la main`,
}

addTranslations({ fr: { 'video-tile': fr } })
