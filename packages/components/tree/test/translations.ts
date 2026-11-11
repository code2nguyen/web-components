import { addTranslations } from '@c2n/core/localize.js'

// The French an app would add: the library ships its text in English only.
addTranslations({
  fr: {
    tree: {
      moved: '{0} déplacé en position {1} sur {2}.',
      movedInto: '{0} déplacé dans {1}, position {2} sur {3}.',
      cannotMove: '{0} ne peut pas aller là.',
      cancelled: 'Déplacement de {0} annulé.',
    },
  },
})
