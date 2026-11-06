import { addTranslations, type TranslatedMessages } from '@c2n/core/localize.js'
import { mindMapMessages } from '../src/messages.js'

// The French an app would add: the library ships its text in English only.

// Counts take French plural forms (0 and 1 are singular): a choice object when the count comes first, a function when
// it does not.
const fr: TranslatedMessages<typeof mindMapMessages.en> = {
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
  unfold: { one: 'Déplier {0} sujet masqué', other: 'Déplier {0} sujets masqués' },
  ctrlKey: 'Ctrl',
  added: (parent: string) => `Sous-sujet ajouté à ${parent}`,
  addedSibling: (sibling: string) => `Sujet ajouté à côté de ${sibling}`,
  edited: (label: string) => `Renommé en ${label}`,
  deleted: (label: string, count: number, mod: string) =>
    count === 0
      ? `${label} supprimé. ${mod}+Z pour annuler`
      : count === 1
        ? `${label} et 1 sous-sujet supprimés. ${mod}+Z pour annuler`
        : `${label} et ${count} sous-sujets supprimés. ${mod}+Z pour annuler`,
  movedInto: (label: string, parent: string) => `${label} déplacé dans ${parent}`,
  movedTo: (label: string, position: number, total: number) => `${label} déplacé en position ${position} sur ${total}`,
  folded: { one: 'Replié, {0} sujet masqué', other: 'Replié, {0} sujets masqués' },
  unfolded: { one: 'Déplié, {0} sujet affiché', other: 'Déplié, {0} sujets affichés' },
  recoloured: (label: string) => `Couleur de ${label} modifiée`,
  copied: { one: '{0} sujet copié', other: '{0} sujets copiés' },
  pasted: { one: '{0} sujet collé dans {1}', other: '{0} sujets collés dans {1}' },
  undone: 'Annulé',
  redone: 'Rétabli',
  nothingToUndo: 'Rien à annuler',
  nothingToRedo: 'Rien à rétablir',
  cancelled: 'Déplacement annulé',
}

addTranslations({ fr: { 'mind-map': fr } })
