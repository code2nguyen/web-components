import { defineMessages } from '@c2n/core/localize.js'

const en = {
  label: 'Upload files',
  selectedFiles: 'Selected files',
  valueMissing: 'Please select a file.',
  // The drop zone's prompt. `{0}` is the action word, drawn as a link-like span (`browse`, `uploadMoreAction`).
  drop: (action: string) => `Drop files here or ${action}`,
  dropMore: (action: string) => `Drop more files here or ${action}`,
  browse: 'browse',
  uploadMoreAction: 'upload more',
  // The hint under the zone, its parts joined by ` · `: the accepted types come first, as written in `accept`.
  upTo: (size: string) => `up to ${size}`,
  filesRemaining: (count: number) => (count === 1 ? '1 file remaining' : `${count} files remaining`),
  filesMaximum: (count: number) => (count === 1 ? '1 file maximum' : `${count} files maximum`),
  selectFiles: 'Select one or more files',
  selectFile: 'Select one file',
  // The compact variant's button.
  uploadFiles: 'Upload files',
  uploadFile: 'Upload file',
  uploadMore: 'Upload more',
  uploadMoreRemaining: (count: number) => `Upload more (${count} remaining)`,
  // A refused file, shown in the errors region and announced.
  rejectMultiple: 'Only one file can be selected.',
  rejectLimit: (count: number) => `A maximum of ${count} files is allowed.`,
  rejectType: (file: string) => `${file} is not an accepted file type.`,
  rejectSize: (file: string, limit: string) => `${file} exceeds the ${limit} size limit.`,
}

/** The upload's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const uploadMessages = defineMessages('upload', en)
