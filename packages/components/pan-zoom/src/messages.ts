import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** `aria-roledescription` of the viewport. */
  roleDescription: 'zoomable view',
  /** Read after the viewport's name: the keys it answers. */
  keyHelp: 'Arrow keys to pan, plus and minus to zoom, 0 to fit.',
  /** Name of the toolbar. */
  controls: 'Zoom controls',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  fitView: 'Fit to view',
  /** Name of the percent button: the zoom now (`250%`) and the zoom it goes to (`100%`). */
  resetZoom: (percent: string, actual: string) => `Zoom ${percent}, reset to ${actual}`,
  /** Announced once a zoom settles. */
  zoomed: (percent: string) => `Zoom ${percent}`,
  /** The hint a plain wheel shows; `key` is `ctrlKey` below, or ⌘ on Apple platforms. */
  wheelHint: (key: string) => `Use ${key} + scroll to zoom`,
  /** The Ctrl key's name in `wheelHint`. */
  ctrlKey: 'Ctrl',
  /** The hint a one-finger swipe shows. */
  touchHint: 'Use two fingers to move the view',
}

/** The pan-zoom's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const panZoomMessages = defineMessages('pan-zoom', en)
