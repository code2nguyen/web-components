import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** Accessible name of `c2-attachment-group` when it has no `aria-label`. */
  group: 'Attachments',
  /** Shown in place of a missing name. */
  untitled: 'Untitled attachment',
  /** Stands for a missing name inside the buttons' accessible names. */
  unnamed: 'attachment',
  /** Accessible name of the upload progress bar, `{0}` being the attachment's name. */
  uploadingName: (name: string) => `Uploading ${name}`,
  /** Status line while uploading, `{0}` being the progress as a percentage (`45%`). */
  uploading: (percent: string) => `Uploading · ${percent}`,
  /** Status line once the upload completed. */
  uploaded: 'Uploaded',
  /** Status line of a failed upload. */
  failed: 'Upload failed',
  /** Accessible names of the action buttons, `{0}` being the attachment's name. */
  retry: (name: string) => `Retry ${name}`,
  cancelUpload: (name: string) => `Cancel upload ${name}`,
  remove: (name: string) => `Remove ${name}`,
}

/** The attachment's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const attachmentMessages = defineMessages('attachment', en)
