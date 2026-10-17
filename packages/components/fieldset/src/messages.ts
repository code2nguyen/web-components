import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** Read after the legend of a required group, in place of the asterisk that is hidden from screen readers. */
  required: 'required',
  /** Read before the group's error by screen readers, so the error does not rely on colour. */
  errorPrefix: 'Error:',
}

/** The fieldset's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const fieldsetMessages = defineMessages('fieldset', en)
