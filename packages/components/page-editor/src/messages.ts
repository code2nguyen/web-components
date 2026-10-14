import { defineMessages, type LocalizeController } from '@c2n/core/localize.js'

const en = {
  // Placeholders of an empty page, an empty heading or the empty line with the caret.
  typeSlash: "Type '/' for commands",
  tapPlus: 'Tap + for blocks',
  heading: (level: number) => `Heading ${level}`,
  quotePlaceholder: 'Quote',
  todoPlaceholder: 'To-do',
  listPlaceholder: 'List',

  // Blocks, as the slash menu, the "Turn into" menu and the toolbar name them.
  paragraph: 'Text',
  paragraphDescription: 'Plain writing',
  heading1Description: 'Big section title',
  heading2Description: 'Medium section title',
  heading3Description: 'Small section title',
  bullet: 'Bulleted list',
  bulletDescription: 'A simple list',
  ordered: 'Numbered list',
  orderedDescription: 'A list with numbers',
  todo: 'To-do list',
  todoDescription: 'Track tasks with checkboxes',
  quote: 'Quote',
  quoteDescription: 'Set a quotation apart',
  code: 'Code block',
  codeDescription: 'Snippet with syntax colours',
  divider: 'Divider',
  dividerDescription: 'Separate sections',

  // Slash menu.
  blocksSection: 'Blocks',
  coloursSection: 'Colours',
  defaultColour: 'Default colour',
  defaultColourDescription: 'Remove text and background colours',
  colourText: (colour: string) => `${colour} text`,
  colourTextDescription: 'Colour the current line',
  colourBackground: (colour: string) => `${colour} background`,
  colourBackgroundDescription: 'Highlight the current line',
  noResults: 'No results',
  menuMove: 'move',
  menuInsert: 'insert',
  menuClose: 'close',

  // Colour names.
  gray: 'Gray',
  brown: 'Brown',
  orange: 'Orange',
  yellow: 'Yellow',
  green: 'Green',
  blue: 'Blue',
  purple: 'Purple',
  red: 'Red',

  // Selection toolbar and the format bar of touch screens.
  formatting: 'Formatting',
  format: 'Format',
  turnInto: 'Turn into',
  bold: 'Bold',
  italic: 'Italic',
  underline: 'Underline',
  strikethrough: 'Strikethrough',
  inlineCode: 'Inline code',
  link: 'Link',
  colour: 'Colour',
  withShortcut: (label: string, keys: string) => `${label} (${keys})`,
  insertBlock: 'Insert a block',
  todoButton: 'To-do',
  indent: 'Indent',
  outdent: 'Outdent',

  // Colour palette.
  paletteText: 'Text',
  paletteBackground: 'Background',
  defaultTextColour: 'Default text colour',
  noBackground: 'No background',
  defaultSwatch: 'Default',
  noneSwatch: 'None',
  lastUsed: 'Last used:',
  toReapply: 'to reapply',

  // Link editor.
  linkPlaceholder: 'Paste or type a link',
  linkAddress: 'Link address',
  applyLink: 'Apply link',
  removeLink: 'Remove link',

  // The note an automatic format leaves next to the caret.
  codeShort: 'Code',
  undoHint: (label: string) => `${label} · ⌫ to undo`,

  valueMissing: 'Please write something.',

  // To-do items and code blocks.
  done: 'Done',
  wrapLines: 'Wrap long lines',
  language: 'Language',
  languageIs: (name: string) => `Language: ${name}`,
  searchLanguagesPlaceholder: 'Search languages…',
  searchLanguages: 'Search languages',
  languages: 'Languages',
  plainText: 'Plain text',
  copy: 'Copy',
  copied: 'Copied',
  copyCode: 'Copy code',
  hintIndent: 'indent',
  hintOr: 'or',
  hintLeave: 'leave the block',
}

export type PageEditorMessages = typeof en

/** The page editor's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const pageEditorMessages = defineMessages('page-editor', en)

/** What the editor's ProseMirror parts read their text from: the host's controller, in the host's language. */
export type PageEditorText = Pick<LocalizeController<PageEditorMessages>, 't'>
