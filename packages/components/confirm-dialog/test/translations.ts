import { addTranslations } from '@c2n/core/localize.js'
import { confirmDialogMessages } from '../src/messages.js'

// The French an app would add: the library ships its text in English only.

const fr: typeof confirmDialogMessages.en = {
  confirm: 'Confirmer',
  cancel: 'Annuler',
}

addTranslations({ fr: { 'confirm-dialog': fr } })
