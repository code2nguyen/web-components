import { defineMessages } from '@c2n/core/localize.js'

const en = {
  label: 'Crop area',
  roleDescription: 'crop selection',
  instructions: 'Arrow keys move the selection, Shift + Arrow keys move it further. Alt + Arrow keys resize it, plus and minus scale it.',
  status: (width: number, height: number, x: number, y: number) => `${width} × ${height} pixels at ${x}, ${y}`,
}

/** The image cropper's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const imageCropperMessages = defineMessages('image-cropper', en)
