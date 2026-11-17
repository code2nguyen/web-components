import { addTranslations } from '@c2n/core/localize.js'
import { selectionToolbarMessages } from '../src/messages.js'

// The French an app would add: the library ships its text in English only.

const fr: typeof selectionToolbarMessages.en = {
  label: 'Actions sur la sélection',
  hint: 'Actions disponibles, appuyez sur Alt+F10',
  prompt: 'Demander à propos de la sélection',
}

addTranslations({ fr: { 'selection-toolbar': fr } })
