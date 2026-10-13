import { defineMessages } from '@c2n/core/localize.js'

const en = {
  display: (label: string, text: string) => `${label}: ${text}`,
  save: 'Save',
  cancel: 'Cancel',
  valueMissing: 'Please fill in this field.',
}

const fr: typeof en = {
  display: (label, text) => `${label}\u202f: ${text}`,
  save: 'Enregistrer',
  cancel: 'Annuler',
  valueMissing: 'Veuillez renseigner ce champ.',
}

const vi: typeof en = {
  display: (label, text) => `${label}: ${text}`,
  save: 'Lưu',
  cancel: 'Hủy',
  valueMissing: 'Vui lòng điền vào trường này.',
}

/** The inline edit's interface text: English, French and Vietnamese, picked from the nearest `lang`. */
export const inlineEditMessages = defineMessages('inline-edit', en, { fr, vi })
