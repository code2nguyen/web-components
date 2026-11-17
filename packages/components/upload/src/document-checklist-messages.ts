import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** Accessible name of the list when the element has no `aria-label` and no enclosing field label. */
  label: 'Documents',
  /** Summary over the list: required documents provided, of all required documents. */
  summary: (provided: number, total: number) => `${provided} of ${total} required documents provided`,
  optional: '(optional)',
  needed: 'Needed',
  uploaded: 'Uploaded',
  'in-review': 'In review',
  approved: 'Approved',
  rejected: 'Rejected',
  expired: 'Expired',
  due: (date: string) => `Due ${date}`,
  overdue: (date: string) => `Overdue · due ${date}`,
  expires: (date: string) => `Expires ${date}`,
  expiredOn: (date: string) => `Expired ${date}`,
  reason: (reason: string) => `Rejected: ${reason}`,
  upload: 'Upload',
  replace: 'Replace',
  addFile: 'Add file',
  /** Accessible name of a row's upload button: its visible text, then the document. */
  uploadLabel: (action: string, document: string) => `${action} ${document}`,
  files: (document: string) => `Files for ${document}`,
  rejectType: (file: string) => `${file} is not an accepted file type.`,
  rejectSize: (file: string, limit: string) => `${file} exceeds the ${limit} size limit.`,
  rejectOne: (file: string) => `${file} was not added: this document takes one file.`,
  rejectLocked: (file: string, document: string) => `${file} was not added: ${document} is already reviewed.`,
  rejectTarget: (file: string) => `${file} has no document to go to.`,
  valueMissing: 'Please provide every required document.',
}

/** The document checklist's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const documentChecklistMessages = defineMessages('document-checklist', en)
