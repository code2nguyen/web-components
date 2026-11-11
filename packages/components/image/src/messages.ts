import { defineMessages } from '@c2n/core/localize.js'

const en = {
  image: 'Image',
  load: 'Load image',
  openPreview: 'Open image full screen',
  openNamedPreview: (alt: string) => `Open ${alt} full screen`,
}

/** The image's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const imageMessages = defineMessages('image', en)
