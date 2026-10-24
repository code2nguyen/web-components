import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** The message while there are changes to save, also announced when the bar shows. */
  unsaved: 'Unsaved changes',
  /** The message while `saving` is set, also announced. */
  saving: 'Saving…',
  /** The save button. */
  save: 'Save',
  /** The discard button. */
  discard: 'Discard',
  /** Accessible name of the bar itself. */
  bar: 'Save changes',
}

/** The save bar's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const saveBarMessages = defineMessages('save-bar', en)
