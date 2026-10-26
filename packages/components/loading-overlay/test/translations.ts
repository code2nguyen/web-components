import { addTranslations } from '@c2n/core/localize.js'
import { loadingOverlayMessages } from '../src/messages.js'

// The French an app would add: the library ships its text in English only.

const fr: typeof loadingOverlayMessages.en = {
  label: 'Chargement',
}

addTranslations({ fr: { 'loading-overlay': fr } })
