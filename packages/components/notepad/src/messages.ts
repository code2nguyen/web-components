import { defineMessages } from '@c2n/core/localize.js'

const en = {
  padNotebook: 'Notebook',
  padLegal: 'Legal pad',
  padSticky: 'Sticky note',
  padIndexCard: 'Index card',
  /** Name of the `default` paper colour, which is the pad's own colour. */
  colorNotebook: 'White',
  colorLegal: 'Canary',
  colorSticky: 'Lemon',
  colorIndexCard: 'Card',
  colorYellow: 'Yellow',
  colorGreen: 'Green',
  colorBlue: 'Blue',
  colorPink: 'Pink',
  colorNight: 'Night',
  paperLined: 'Lined',
  paperGrid: 'Grid',
  paperDot: 'Dot grid',
  paperBlank: 'Blank',
  /** The "Paper" button and the picker it opens. */
  paper: 'Paper',
  /** Heading of the paper colours in the picker. */
  paperColors: 'Paper',
  pad: 'Pad',
  lines: 'Lines',
  tearOff: 'Tear off',
  done: 'Done',
  valueMissing: 'Please write something.',
  tooLong: (max: number) => `Please use at most ${max} characters.`,
  formatting: 'Formatting',
  bold: 'Bold',
  italic: 'Italic',
  underline: 'Underline',
  strikethrough: 'Strikethrough',
  inkColor: 'Ink colour',
  highlighter: 'Highlighter',
  /** The colour button of the toolbar: its group, then the colour in use. */
  colorButton: (group: string, current: string) => `${group}: ${current}`,
  inkColors: 'Ink colours',
  highlighters: 'Highlighters',
  defaultInk: 'Default ink',
  noHighlighter: 'No highlighter',
  inkBlue: 'Blue ink',
  inkBlack: 'Black ink',
  inkRed: 'Red ink',
  inkGreen: 'Green ink',
  highlightYellow: 'Yellow highlighter',
  highlightGreen: 'Green highlighter',
  highlightPink: 'Pink highlighter',
  /** An ink or highlighter given without a name, by its position. */
  inkN: (position: number) => `Ink ${position}`,
  highlighterN: (position: number) => `Highlighter ${position}`,
}

/** The notepad's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const notepadMessages = defineMessages('notepad', en)
