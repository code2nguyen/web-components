import { addTranslations } from '@c2n/core/localize.js'

// The French an app would add: the library ships its text in English only.
addTranslations({
  fr: {
    'camera-capture': {
      label: 'Caméra',
      idle: 'Prenez une photo avec votre caméra.',
      start: 'Activer la caméra',
      capture: 'Prendre la photo',
      retake: 'Reprendre',
      accept: 'Utiliser la photo',
      guideCard: 'Placez la carte dans le cadre.',
      retry: 'Réessayer',
      errorDenied: "L'accès à la caméra a été refusé.",
    },
  },
})
