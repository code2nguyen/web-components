import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** The panel's name when it has neither a text title nor a `label`. */
  untitled: 'Panel',
  /** The title-bar handle, named after the panel. */
  move: (name: string) => `Move ${name}`,
  moveHint: 'Arrow keys move the panel',
  /** The corner grip, named after the panel. */
  resize: (name: string) => `Resize ${name}`,
  resizeHint: 'Arrow keys resize the panel',
  minimize: 'Minimise',
  maximize: 'Maximise',
  restore: 'Restore',
  close: 'Close',
  /** Live-region announcements. Coordinates and sizes are already formatted for the language. */
  minimized: (name: string) => `${name} minimised`,
  maximized: (name: string) => `${name} maximised`,
  restored: (name: string) => `${name} restored`,
  moved: (x: string, y: string) => `Moved to ${x}, ${y}`,
  resized: (width: string, height: string) => `Resized to ${width} by ${height}`,
}

/** The floating panel's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const floatingPanelMessages = defineMessages('floating-panel', en)
