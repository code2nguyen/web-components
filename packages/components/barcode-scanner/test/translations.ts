import { addTranslations } from '@c2n/core/localize.js'

// The French an app would add: the library ships its text in English only.
addTranslations({
  fr: {
    'barcode-scanner': {
      label: 'Lecteur de codes-barres',
      idle: 'Scannez un code-barres ou un QR code avec votre caméra.',
      start: 'Activer la caméra',
      hint: 'Visez un code avec la caméra.',
      scanned: 'Code lu : {0}',
      scanAgain: 'Scanner à nouveau',
    },
  },
})
