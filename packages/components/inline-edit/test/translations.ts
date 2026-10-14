import { addTranslations } from '@c2n/core/localize.js'
import { inlineEditMessages } from '../src/messages.js'

// The French and Vietnamese an app would add: the library ships its text in English only.

const fr: typeof inlineEditMessages.en = {
  display: (label, text) => `${label}\u202f: ${text}`,
  save: 'Enregistrer',
  cancel: 'Annuler',
  valueMissing: 'Veuillez renseigner ce champ.',
}

const vi: typeof inlineEditMessages.en = {
  display: (label, text) => `${label}: ${text}`,
  save: 'Lưu',
  cancel: 'Hủy',
  valueMissing: 'Vui lòng điền vào trường này.',
}

addTranslations({ fr: { 'inline-edit': fr }, vi: { 'inline-edit': vi } })
