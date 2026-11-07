import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** The stage's accessible name. */
  stage: 'Annotated image',
  /** The toolbar's accessible name. */
  toolbar: 'Annotation tools',
  /** Tool buttons. */
  select: 'Select',
  arrow: 'Arrow',
  line: 'Line',
  rect: 'Rectangle',
  ellipse: 'Ellipse',
  pen: 'Pen',
  text: 'Text',
  number: 'Number',
  blur: 'Blur',
  redact: 'Redact',
  undo: 'Undo',
  redo: 'Redo',
  delete: 'Delete',
  /** The colour choice's accessible name. */
  color: 'Colour',
  /** A colour swatch: `{0}` is its position. */
  colorN: (index: number) => `Colour ${index}`,
  /** The stroke choice's accessible name and its three widths. */
  stroke: 'Stroke width',
  thin: 'Thin',
  medium: 'Medium',
  thick: 'Thick',
  /** Shape names, for assistive technology. */
  shapeArrow: 'Arrow',
  shapeLine: 'Line',
  shapeRect: 'Rectangle',
  shapeEllipse: 'Ellipse',
  shapePen: 'Drawing',
  shapeText: 'Text',
  shapeNumber: 'Number',
  shapeBlur: 'Blur',
  shapeRedact: 'Redaction',
  /** A shape's name: `{0}` is its kind, `{1}` its position, `{2}` how many shapes there are. */
  shapeOf: (kind: string, index: number, count: number) => `${kind} ${index} of ${count}`,
  /** Announced after an edit: `{0}` is the shape's kind. */
  added: (kind: string) => `${kind} added`,
  deleted: (kind: string) => `${kind} deleted`,
  /** The text editor's accessible name. */
  textInput: 'Annotation text',
}

/** The annotator's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const imageAnnotatorMessages = defineMessages('image-annotator', en)
