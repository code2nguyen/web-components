import { addTranslations } from '@c2n/core/localize.js'
import { pageHeaderMessages } from '../src/messages.js'

// The French an app would add: the library ships its text in English only.

const fr: typeof pageHeaderMessages.en = {
  moreActions: 'Plus d’actions',
  backTo: (label: string) => `Retour à ${label}`,
}

addTranslations({ fr: { 'page-header': fr } })
