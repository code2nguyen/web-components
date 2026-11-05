import { addTranslations } from '@c2n/core/localize.js'
import { audioPlayerMessages } from '../src/messages.js'

// The French an app would add: the library ships its text in English only.

const fr: typeof audioPlayerMessages.en = {
  play: 'Lire',
  pause: 'Mettre en pause',
  playLabel: (label) => `Lire ${label}`,
  pauseLabel: (label) => `Mettre en pause ${label}`,
  player: 'Audio',
  seek: 'Position',
  position: (time, duration) => `${time} sur ${duration}`,
  speed: (speed) => `Vitesse de lecture ${speed}`,
  showTranscript: 'Afficher la transcription',
  hideTranscript: 'Masquer la transcription',
  error: 'Impossible de lire cet enregistrement',
}

addTranslations({ fr: { 'audio-player': fr } })
