import { addTranslations } from '@c2n/core/localize.js'
import { richTextEditorMessages } from '../src/messages.js'

// The French an app would add: the library ships its text in English only.

const fr: typeof richTextEditorMessages.en = {
  formatting: 'Mise en forme',
  moreFormatting: 'Plus de mise en forme',
  bold: 'Gras',
  italic: 'Italique',
  underline: 'Souligné',
  strike: 'Barré',
  code: 'Code en ligne',
  link: 'Lien',
  bullet: 'Liste à puces',
  ordered: 'Liste numérotée',
  quote: 'Citation',
  codeBlock: 'Bloc de code',
  withShortcut: (name, keys) => `${name} (${keys})`,
  linkAddress: 'Adresse du lien',
  linkSave: 'Enregistrer',
  linkRemove: 'Supprimer le lien',
  counter: (count, max) => `${count} / ${max}`,
  valueMissing: 'Veuillez remplir ce champ.',
  tooLong: (max) => `Utilisez ${max} caractères au maximum.`,
}

addTranslations({ fr: { 'rich-text-editor': fr } })
