import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** Accessible name of the tile grid when the element has no `aria-label` and no enclosing field label. */
  label: 'Images',
  add: 'Add image',
  addMany: 'Add images',
  /** Images in the queue over `max-files`, under the add tile. */
  count: (count: number, max: number) => `${count} / ${max}`,
  cover: 'Cover',
  uploading: (name: string) => `Uploading ${name}`,
  failed: 'Upload failed',
  retry: 'Retry',
  retryLabel: (name: string) => `Retry ${name}`,
  remove: (name: string) => `Remove ${name}`,
  cancel: (name: string) => `Cancel upload ${name}`,
  replace: 'Replace',
  replaceLabel: (name: string) => `Replace ${name}`,
  /** Name of a tile's reorder handle. */
  reorder: (name: string, position: number, count: number) => `Reorder ${name}, position ${position} of ${count}`,
  grabHint: 'Space to reorder',
  movingHint: 'Arrows to move · Space to drop · Esc to cancel',
  pickedUp: (name: string, position: number, count: number) =>
    `${name} picked up, position ${position} of ${count}. Use Arrow keys, Home or End to move; Space drops and Escape cancels.`,
  moved: (name: string, position: number, count: number) => `${name} moved to position ${position} of ${count}.`,
  returned: (name: string, position: number) => `${name} returned to position ${position}.`,
  rejectMultiple: 'Only one image can be selected.',
  rejectLimit: (max: number) => `A maximum of ${max} images is allowed.`,
  rejectType: (file: string) => `${file} is not an accepted image type.`,
  rejectSize: (file: string, limit: string) => `${file} exceeds the ${limit} size limit.`,
}

/** The image uploader's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const imageUploaderMessages = defineMessages('image-uploader', en)
