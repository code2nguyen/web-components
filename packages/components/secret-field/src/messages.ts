import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** Toggle button that shows and hides the secret; its pressed state says which. */
  show: 'Show secret',
  /** Copy button. */
  copy: 'Copy secret',
  /** The copy button's label after a successful copy. */
  copied: 'Copied',
  /** Regenerate button. */
  regenerate: 'Regenerate secret',
  /** What a screen reader hears for a masked secret with nothing left visible. */
  hidden: 'Hidden',
  /** A masked secret that keeps its last characters visible. */
  hiddenEnding: (end: string) => `Hidden, ends with ${end}`,
  /** A masked secret that keeps its first characters visible. */
  hiddenStarting: (start: string) => `Starts with ${start}, hidden`,
  /** A masked secret that keeps its first and last characters visible. */
  hiddenBetween: (start: string, end: string) => `Starts with ${start}, hidden, ends with ${end}`,
  /** What a screen reader hears while there is no secret yet. */
  empty: 'No secret',
}

/** The secret field's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const secretFieldMessages = defineMessages('secret-field', en)
