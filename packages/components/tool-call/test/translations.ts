import { addTranslations } from '@c2n/core/localize.js'
import { toolCallMessages } from '../src/messages.js'

// The French an app would add: the library ships its text in English only.

const fr: typeof toolCallMessages.en = {
  tool: 'Outil',
  pending: 'En attente',
  running: 'En cours',
  success: 'Terminé',
  error: 'Échec',
  cancelled: 'Annulé',
  input: 'Entrée',
  output: 'Sortie',
  errorLabel: 'Erreur',
}

addTranslations({ fr: { 'tool-call': fr } })
