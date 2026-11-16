import { addTranslations } from '@c2n/core/localize.js'
import { progressMessages } from '../src/messages.js'
import { navigationProgressMessages } from '../src/navigation-progress-messages.js'

// The French an app would add: the library ships its text in English only.

const fr: typeof progressMessages.en = {
  loading: 'Chargement',
  markReached: (value) => `${value}, atteint`,
  markClaimable: (value) => `${value}, à réclamer`,
  markLocked: (value, remaining) => `${value}, encore ${remaining}`,
  markAhead: (value) => `${value}, pas atteint`,
}

const navigationFr: typeof navigationProgressMessages.en = {
  loading: 'Chargement de la page',
}

addTranslations({ fr: { progress: fr, 'navigation-progress': navigationFr } })
