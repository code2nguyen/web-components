import { addTranslations } from '@c2n/core/localize.js'
import type { documentChecklistMessages } from '../src/document-checklist-messages.js'
import type { imageUploaderMessages } from '../src/image-uploader-messages.js'

// The French an app would add: the library ships its text in English only.

const documentChecklist: typeof documentChecklistMessages.en = {
  label: 'Documents',
  summary: (provided, total) =>
    `${provided} document${provided > 1 ? 's' : ''} obligatoire${provided > 1 ? 's' : ''} fourni${provided > 1 ? 's' : ''} sur ${total}`,
  optional: '(facultatif)',
  needed: 'À fournir',
  uploaded: 'Envoyé',
  'in-review': 'En cours de vérification',
  approved: 'Validé',
  rejected: 'Refusé',
  expired: 'Expiré',
  due: (date) => `À fournir avant le ${date}`,
  overdue: (date) => `En retard · attendu le ${date}`,
  expires: (date) => `Expire le ${date}`,
  expiredOn: (date) => `Expiré le ${date}`,
  reason: (reason) => `Refusé : ${reason}`,
  upload: 'Envoyer',
  replace: 'Remplacer',
  addFile: 'Ajouter un fichier',
  uploadLabel: (action, document) => `${action} : ${document}`,
  files: (document) => `Fichiers de ${document}`,
  rejectType: (file) => `${file} n’est pas d’un type accepté.`,
  rejectSize: (file, limit) => `${file} dépasse la limite de ${limit}.`,
  rejectOne: (file) => `${file} n’a pas été ajouté : ce document prend un seul fichier.`,
  rejectLocked: (file, document) => `${file} n’a pas été ajouté : ${document} est déjà vérifié.`,
  rejectTarget: (file) => `${file} ne correspond à aucun document attendu.`,
  valueMissing: 'Fournissez chaque document obligatoire.',
}

const imageUploader: typeof imageUploaderMessages.en = {
  label: 'Images',
  add: 'Ajouter une image',
  addMany: 'Ajouter des images',
  count: (count, max) => `${count} / ${max}`,
  cover: 'Couverture',
  uploading: (name) => `Envoi de ${name}`,
  failed: 'Échec de l’envoi',
  retry: 'Réessayer',
  retryLabel: (name) => `Réessayer ${name}`,
  remove: (name) => `Retirer ${name}`,
  cancel: (name) => `Annuler l’envoi de ${name}`,
  replace: 'Remplacer',
  replaceLabel: (name) => `Remplacer ${name}`,
  reorder: (name, position, count) => `Déplacer ${name}, position ${position} sur ${count}`,
  grabHint: 'Espace pour déplacer',
  movingHint: 'Flèches pour déplacer · Espace pour poser · Échap pour annuler',
  pickedUp: (name, position, count) =>
    `${name} prise, position ${position} sur ${count}. Déplacez-la avec les flèches, Début ou Fin ; Espace la pose et Échap annule.`,
  moved: (name, position, count) => `${name} déplacée en position ${position} sur ${count}.`,
  returned: (name, position) => `${name} revenue en position ${position}.`,
  rejectMultiple: 'Une seule image peut être choisie.',
  rejectLimit: (max) => `${max} images au plus.`,
  rejectType: (file) => `${file} n’est pas une image acceptée.`,
  rejectSize: (file, limit) => `${file} dépasse la limite de ${limit}.`,
}

// The drop zone's announcement comes from `@c2n/core`, under its own name; JSON choices pick the plural.
const dropZone = {
  added: { one: '{0} fichier ajouté', other: '{0} fichiers ajoutés' },
  rejected: { one: '{0} fichier refusé', other: '{0} fichiers refusés' },
}

// JSON-style, as an app loading translations from a file writes them: `{0}` placeholders and plural objects.
const upload = {
  drop: 'Déposez des fichiers ici ou {0}',
  browse: 'parcourez',
  filesMaximum: { one: '{0} fichier au maximum', other: '{0} fichiers au maximum' },
  rejectType: '{0} n’est pas d’un type accepté.',
  upTo: "jusqu'à {0}",
}

addTranslations({ fr: { 'document-checklist': documentChecklist, 'image-uploader': imageUploader, 'drop-zone': dropZone, upload } })

// A translation whose sentence leaves out the action's `{0}`: the action still follows it.
addTranslations({ de: { upload: { drop: 'Dateien hier ablegen', browse: 'durchsuchen' } } })

// A translation that uses the action's `{0}` twice.
addTranslations({ nl: { upload: { drop: '{0}: sleep bestanden of {0} hier', browse: 'bladeren' } } })
