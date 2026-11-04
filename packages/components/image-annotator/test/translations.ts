import { addTranslations } from '@c2n/core/localize.js'
import { imageAnnotatorMessages } from '../src/messages.js'

// The French an app would add: the library ships its text in English only.

const fr: typeof imageAnnotatorMessages.en = {
  stage: 'Image annotée',
  toolbar: "Outils d'annotation",
  select: 'Sélection',
  arrow: 'Flèche',
  line: 'Ligne',
  rect: 'Rectangle',
  ellipse: 'Ellipse',
  pen: 'Crayon',
  text: 'Texte',
  number: 'Numéro',
  blur: 'Flou',
  redact: 'Masquer',
  undo: 'Annuler',
  redo: 'Rétablir',
  delete: 'Supprimer',
  color: 'Couleur',
  colorN: (index) => `Couleur ${index}`,
  stroke: 'Épaisseur',
  thin: 'Fine',
  medium: 'Moyenne',
  thick: 'Épaisse',
  shapeArrow: 'Flèche',
  shapeLine: 'Ligne',
  shapeRect: 'Rectangle',
  shapeEllipse: 'Ellipse',
  shapePen: 'Dessin',
  shapeText: 'Texte',
  shapeNumber: 'Numéro',
  shapeBlur: 'Flou',
  shapeRedact: 'Masque',
  shapeOf: (kind, index, count) => `${kind} ${index} sur ${count}`,
  added: (kind) => `${kind} ajouté`,
  deleted: (kind) => `${kind} supprimé`,
  textInput: "Texte de l'annotation",
}

addTranslations({ fr: { 'image-annotator': fr } })
