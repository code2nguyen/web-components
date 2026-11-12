import { addTranslations } from '@c2n/core/localize.js'
import { reorderListMessages } from '../src/messages.js'

// The French an app would add: the library ships its text in English only.

const fr: typeof reorderListMessages.en = {
  instructions: 'Appuyez sur Espace pour saisir un élément. Déplacez-le avec les flèches, Début ou Fin ; Espace le dépose et Échap annule.',
  swipeShortcut: (key: string, action: string) => `Appuyez sur ${key} pour ${action.toLowerCase()}.`,
  item: 'Élément',
  pickedUp: (label: string, position: number, count: number) =>
    `${label} saisi, position ${position} sur ${count}. Déplacez-le avec les flèches, Début ou Fin ; Espace le dépose et Échap annule.`,
  returned: (label: string, position: number) => `${label} revenu à la position ${position}.`,
  atFirst: (label: string) => `${label} est déjà à la première position permise.`,
  atLast: (label: string) => `${label} est déjà à la dernière position permise.`,
  moved: (label: string, position: number, count: number) => `${label} déplacé à la position ${position} sur ${count}.`,
  dropped: (label: string, from: number, to: number) => `${label} déplacé de la position ${from} à ${to}.`,
  swipeOpen: (label: string, actions: string) => `${label} : ${actions} disponible. Échap pour fermer.`,
  deleted: (label: string) => `${label} supprimé.`,
  actionDone: (action: string, label: string) => `${action} : ${label}.`,
  duplicateKey: (key: string) => `Réorganisation impossible : la clé ${key} est utilisée plusieurs fois.`,
  canceled: "Réorganisation annulée. L'élément est revenu à sa position d'origine.",
  canceledNotEditable: "Réorganisation annulée : la modification n'est plus disponible.",
  canceledItemsChanged: 'Les éléments ont changé. Réorganisation annulée.',
  canceledItemHidden: "Réorganisation annulée : l'élément n'est pas visible.",
  canceledListHidden: "Réorganisation annulée : l'élément ou la liste n'est pas visible.",
  canceledPointerLost: 'Réorganisation annulée : le pointeur a été perdu.',
}

addTranslations({ fr: { 'reorder-list': fr } })
