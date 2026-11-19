import { addTranslations } from '@c2n/core/localize.js'

// The French an app would add: the library ships its text in English only.
addTranslations({
  fr: {
    attachment: {
      group: 'Pièces jointes',
      untitled: 'Pièce jointe sans nom',
      unnamed: 'pièce jointe',
      uploadingName: 'Envoi de {0}',
      uploading: 'Envoi · {0}',
      uploaded: 'Envoyé',
      failed: "Échec de l'envoi",
      retry: 'Réessayer {0}',
      cancelUpload: "Annuler l'envoi de {0}",
      remove: 'Retirer {0}',
    },
    'file-preview': {
      label: 'Aperçu de {0}',
      counter: '{0} sur {1}',
      previous: 'Fichier précédent',
      next: 'Fichier suivant',
      text: 'Texte',
    },
  },
})
