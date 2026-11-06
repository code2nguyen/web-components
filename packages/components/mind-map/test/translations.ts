import { addTranslations } from '@c2n/core/localize.js'
import { mindMapMessages } from '../src/messages.js'

// The French an app would add: the library ships its text in English only.

const fr: typeof mindMapMessages.en = {
  label: 'Carte mentale',
  roleDescription: 'carte mentale',
  topicRoleDescription: 'sujet',
  keyHelp: 'Tab ajoute un sous-sujet, Entrée un sujet voisin, F2 modifie, Suppr supprime. Échap, puis Tab, quitte la carte.',
  keyHelpReadOnly: 'Les flèches suivent le dessin, Espace replie, Origine va au sujet central.',
  canvas: 'Fond de la carte mentale',
  editTopic: 'Modifier le sujet',
  newTopic: 'Nouveau sujet',
  addSubtopic: 'Ajouter un sous-sujet',
  fold: 'Replier',
  unfold: (count: number) => `Déplier ${count} sujets masqués`,
  ctrlKey: 'Ctrl',
  added: (parent: string) => `Sous-sujet ajouté à ${parent}`,
  addedSibling: (sibling: string) => `Sujet ajouté à côté de ${sibling}`,
  edited: (label: string) => `Renommé en ${label}`,
  deleted: (label: string, count: number, mod: string) => `${label} et ${count} sous-sujets supprimés. ${mod}+Z pour annuler`,
  movedInto: (label: string, parent: string) => `${label} déplacé dans ${parent}`,
  movedTo: (label: string, position: number, total: number) => `${label} déplacé en position ${position} sur ${total}`,
  folded: (count: number) => `Replié, ${count} sujets masqués`,
  unfolded: (count: number) => `Déplié, ${count} sujets affichés`,
  recoloured: (label: string) => `Couleur de ${label} modifiée`,
  copied: (count: number) => `${count} sujets copiés`,
  pasted: (count: number, parent: string) => `${count} sujets collés dans ${parent}`,
  undone: 'Annulé',
  redone: 'Rétabli',
  nothingToUndo: 'Rien à annuler',
  nothingToRedo: 'Rien à rétablir',
  cancelled: 'Déplacement annulé',
}

addTranslations({ fr: { 'mind-map': fr } })
