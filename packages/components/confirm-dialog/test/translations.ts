import { addTranslations } from '@c2n/core/localize.js'
import { confirmDialogMessages } from '../src/messages.js'

// The French an app would add: the library ships its text in English only.

const fr: typeof confirmDialogMessages.en = {
  confirm: 'Confirmer',
  cancel: 'Annuler',
  typeToConfirm: (phrase: string) => `Saisissez ${phrase} pour confirmer`,
  answer: 'Réponse',
  errorPrefix: 'Erreur :',
  valueMissing: 'Remplissez ce champ.',
  invalid: 'Saisissez une valeur valide.',
}

addTranslations({ fr: { 'confirm-dialog': fr } })
