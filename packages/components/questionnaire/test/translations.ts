import { addTranslations } from '@c2n/core/localize.js'

// The French an app would add: the library ships its text in English only.
addTranslations({
  fr: {
    questionnaire: {
      next: 'Suivant',
      complete: 'Enregistrer',
      previous: 'Précédent',
      skip: 'Passer',
      skipped: 'Passée',
      progress: 'Question {0} sur {1}',
      summary: 'Récapitulatif',
      empty: 'Aucune question.',
      required: 'Choisissez une réponse pour continuer.',
      requiredSkippable: 'Choisissez une réponse ou passez cette question.',
    },
  },
})
