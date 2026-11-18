import { addTranslations } from '@c2n/core/localize.js'

// The French an app would add: the library ships its text in English only.
addTranslations({
  fr: {
    'json-viewer': {
      label: 'Données JSON',
      noData: 'Aucune donnée',
      noMatch: 'Aucun résultat',
      showMore: '{0} de plus sur {1}',
      itemCount: { one: '{0} élément', other: '{0} éléments' },
      keyCount: { one: '{0} clé', other: '{0} clés' },
      copyPath: 'Copier le chemin',
      copyValue: 'Copier la valeur',
      schema: 'Schéma',
      required: 'obligatoire',
      deprecated: 'obsolète',
      option: 'Option {0}',
      maxLength: '≤ {0} caractères',
      default: 'par défaut {0}',
    },
  },
})
