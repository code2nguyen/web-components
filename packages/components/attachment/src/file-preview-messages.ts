import { defineMessages } from '@c2n/core/localize.js'

// Its own module rather than `messages.ts`: only the preview, which loads on first use, draws this text.
const en = {
  /** The name of the preview region and of its dialog. */
  label: (name: string) => `Preview of ${name}`,
  /** Which file of the set is shown. */
  counter: (position: number, total: number) => `${position} of ${total}`,
  previous: 'Previous file',
  next: 'Next file',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  fit: 'Fit to view',
  download: (name: string) => `Download ${name}`,
  close: 'Close preview',
  /** Shown while a text file is read. */
  loading: 'Loading preview…',
  /** A file type the browser cannot show. */
  unsupported: 'No preview is available for this file.',
  /** The file could not be loaded. */
  error: 'This file could not be previewed.',
  /** No file was given. */
  empty: 'No file to preview.',
  /** A long text file is cut. */
  truncated: 'Showing the beginning of the file.',
  image: 'Image',
  video: 'Video',
  audio: 'Audio',
  pdf: 'PDF',
  text: 'Text',
  file: 'File',
}

/** The file preview's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const filePreviewMessages = defineMessages('file-preview', en)
