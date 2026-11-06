import { addTranslations } from '@c2n/core/localize.js'
import { terminalMessages } from '../src/messages.js'

// The French an app would add: the library ships its text in English only.

const fr: typeof terminalMessages.en = {
  terminal: 'Terminal',
  command: 'Commande',
  clearHint: 'effacer',
  cancelHint: 'annuler',
  running: (name) => `${name} en cours…`,
  stopHint: 'Ctrl+C pour arrêter',
  helpClear: 'Effacer l’écran (Ctrl+L)',
  helpHelp: 'Afficher cette liste',
  outputSummary: (lines) => `Sortie : ${lines} lignes`,
  cancelled: 'Annulé',
  completions: (count) => `${count} complétions`,
  cleared: 'Écran effacé',
}

addTranslations({ fr: { terminal: fr } })
