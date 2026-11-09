import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** Accessible name of the pad when it has no `label` and no field label. */
  label: 'Signature',
  /** The hint shown in an empty pad when no `placeholder` is set. */
  placeholder: 'Sign here',
  /** Read with the pad while it holds no strokes. */
  empty: 'Not signed yet',
  /** Read with the pad once it holds a signature. */
  signed: 'Signed',
  /** The button that takes the last stroke away. */
  undo: 'Undo',
  /** The button that empties the pad. */
  clear: 'Clear',
  /** Validation message of a `required` pad that is empty. */
  required: 'Sign in the box.',
}

/** The signature pad's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const signaturePadMessages = defineMessages('signature-pad', en)
