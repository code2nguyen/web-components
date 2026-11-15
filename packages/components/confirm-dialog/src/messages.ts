import { defineMessages } from '@c2n/core/localize.js'

const en = {
  confirm: 'Confirm',
  cancel: 'Cancel',
  /** Instruction above the typed-confirmation field, and that field's accessible name; `{0}` is the phrase. */
  typeToConfirm: (phrase: string) => `Type ${phrase} to confirm`,
  /** Name of the prompt's input when it has no label and the dialog no heading. */
  answer: 'Answer',
  /** Read before a prompt's error by screen readers, so the error does not rely on colour. */
  errorPrefix: 'Error:',
  /** Shown when a required prompt input is empty. */
  valueMissing: 'Fill in this field.',
  /** Shown when the input is invalid and gives no message of its own. */
  invalid: 'Enter a valid value.',
}

export type ConfirmDialogMessages = typeof en

/** The confirm dialog's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const confirmDialogMessages = defineMessages('confirm-dialog', en)
