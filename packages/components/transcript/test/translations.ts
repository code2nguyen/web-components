import { addTranslations } from '@c2n/core/localize.js'
import { transcriptMessages } from '../src/messages.js'

// The French an app would add: the library ships its text in English only.

const fr: typeof transcriptMessages.en = {
  transcript: 'Transcription',
  group: (speaker, time) => `${speaker}, ${time}`,
  playFrom: (time) => `Lire à partir de ${time}`,
  jump: 'Revenir à la lecture',
  matches: (current, count) => `${current} sur ${count} résultats`,
  noMatches: 'Aucun résultat',
}

addTranslations({ fr: { transcript: fr } })
