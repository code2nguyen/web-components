import { addTranslations } from '@c2n/core/localize.js'
import { imageCropperMessages } from '../src/messages.js'

// The French an app would add: the library ships its text in English only.

const fr: typeof imageCropperMessages.en = {
  label: 'Zone de recadrage',
  roleDescription: 'sélection de recadrage',
  instructions:
    'Les flèches déplacent la sélection, Maj + flèches la déplacent plus loin. Alt + flèches la redimensionnent, plus et moins la mettent à l’échelle.',
  status: (width, height, x, y) => `${width} × ${height} pixels à ${x}, ${y}`,
}

addTranslations({ fr: { 'image-cropper': fr } })
