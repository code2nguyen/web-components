import { addTranslations } from '@c2n/core/localize.js'
import { panZoomMessages } from '../src/messages.js'

// The French an app would add: the library ships its text in English only.

const fr: typeof panZoomMessages.en = {
  roleDescription: 'vue zoomable',
  keyHelp: 'Flèches pour déplacer, plus et moins pour zoomer, 0 pour ajuster.',
  controls: 'Commandes de zoom',
  zoomIn: 'Zoom avant',
  zoomOut: 'Zoom arrière',
  fitView: 'Ajuster à la vue',
  resetZoom: (percent: string, actual: string) => `Zoom ${percent}, revenir à ${actual}`,
  zoomed: (percent: string) => `Zoom ${percent}`,
  wheelHint: (key: string) => `Utilisez ${key} + défilement pour zoomer`,
  ctrlKey: 'Ctrl',
  touchHint: 'Utilisez deux doigts pour déplacer la vue',
}

addTranslations({ fr: { 'pan-zoom': fr } })
