import { defineMessages } from '@c2n/core/localize.js'

const en = {
  label: 'Upload files',
  selectedFiles: 'Selected files',
  valueMissing: 'Please select a file.',
}

/** The upload's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const uploadMessages = defineMessages('upload', en)
