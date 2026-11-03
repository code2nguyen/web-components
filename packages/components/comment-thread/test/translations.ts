import { addTranslations } from '@c2n/core/localize.js'
import { commentThreadMessages } from '../src/messages.js'

// The French an app would add: the library ships its text in English only.

const fr: typeof commentThreadMessages.en = {
  label: 'Fil de commentaires',
  commentBy: (name, time) => `${name}, ${time}`,
  edited: 'modifié',
  resolve: 'Résoudre',
  reopen: 'Rouvrir',
  resolvedLine: (replies) => (replies === 0 ? 'Résolu' : replies === 1 ? 'Résolu · 1 réponse' : `Résolu · ${replies} réponses`),
  showEarlier: (count) => (count === 1 ? 'Afficher 1 réponse précédente' : `Afficher ${count} réponses précédentes`),
  edit: 'Modifier',
  editLabel: (name) => `Modifier le commentaire de ${name}`,
  delete: 'Supprimer',
  deleteLabel: (name) => `Supprimer le commentaire de ${name}`,
  deleteQuestion: 'Supprimer ce commentaire ?',
  deleteThreadQuestion: 'Supprimer ce fil ?',
  save: 'Enregistrer',
  cancel: 'Annuler',
  reply: 'Répondre',
  replyPlaceholder: 'Répondre…',
  editPlaceholder: 'Modifier le commentaire',
  quoteLabel: 'À propos de',
  replyAdded: 'Réponse ajoutée',
  commentEdited: 'Commentaire modifié',
  commentDeleted: 'Commentaire supprimé',
  threadResolved: 'Fil résolu',
  threadReopened: 'Fil rouvert',
}

addTranslations({ fr: { 'comment-thread': fr } })
