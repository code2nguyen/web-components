import { addTranslations } from '@c2n/core/localize.js'
import { appShellMessages } from '../src/messages.js'

// The French an app would add: the library ships its text in English only.

const fr: typeof appShellMessages.en = {
  skipToContent: 'Aller au contenu principal',
  navigation: 'Principale',
  openNavigation: 'Ouvrir la navigation',
  closeNavigation: 'Fermer la navigation',
  openDetails: 'Afficher les détails',
  closeDetails: 'Fermer les détails',
}

addTranslations({ fr: { 'app-shell': fr } })
