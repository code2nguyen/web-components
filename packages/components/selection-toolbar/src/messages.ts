import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** Accessible name of the toolbar when it has no `label`. */
  label: 'Selection actions',
  /** Announced when the toolbar appears for a selection. */
  hint: 'Actions available, press Alt+F10',
}

/** The selection toolbar's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const selectionToolbarMessages = defineMessages('selection-toolbar', en)
