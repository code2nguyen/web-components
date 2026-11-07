import { addTranslations } from '@c2n/core/localize.js'
import { videoGridMessages } from '../src/messages.js'

// The French an app would add: the library ships its text in English only.

const fr: typeof videoGridMessages.en = {
  participants: (count) => `Participants (${count})`,
  more: (count) => `+${count} autres`,
  showMore: (count) => `Afficher ${count} autres participants`,
}

addTranslations({ fr: { 'video-grid': fr } })
