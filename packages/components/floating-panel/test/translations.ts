import { addTranslations } from '@c2n/core/localize.js'

// The French an app would add: the library ships its text in English only.
addTranslations({
  fr: {
    'floating-panel': {
      untitled: 'Panneau',
      move: 'Déplacer {0}',
      moveHint: 'Les flèches déplacent le panneau',
      resize: 'Redimensionner {0}',
      resizeHint: 'Les flèches redimensionnent le panneau',
      minimize: 'Réduire',
      maximize: 'Agrandir',
      restore: 'Restaurer',
      close: 'Fermer',
      minimized: '{0} réduit',
      maximized: '{0} agrandi',
      restored: '{0} restauré',
      moved: 'Déplacé en {0}, {1}',
      resized: 'Redimensionné à {0} sur {1}',
    },
  },
})
