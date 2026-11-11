import { addTranslations } from '@c2n/core/localize.js'
import { copyButtonMessages } from '../src/messages.js'

// The French an app would add: the library ships its text in English only.

const fr: typeof copyButtonMessages.en = {
  copy: 'Copier',
  copied: 'Copié',
  failed: 'Échec de la copie',
}

addTranslations({ fr: { 'copy-button': fr } })
