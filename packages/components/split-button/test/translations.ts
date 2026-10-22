import { addTranslations } from '@c2n/core/localize.js'
import { splitButtonMessages } from '../src/messages.js'

// The French an app would add: the library ships its text in English only.

const fr: typeof splitButtonMessages.en = {
  caretLabel: (label: string) => `Plus d’options : ${label}`,
  caretLabelPlain: 'Plus d’options',
  currentChoice: (label: string) => `Actuel : ${label}`,
}

addTranslations({ fr: { 'split-button': fr } })
