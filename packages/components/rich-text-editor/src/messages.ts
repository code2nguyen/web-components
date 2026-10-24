import { defineMessages } from '@c2n/core/localize.js'

const en = {
  // The toolbar, its buttons and the overflow menu.
  formatting: 'Formatting',
  moreFormatting: 'More formatting',
  bold: 'Bold',
  italic: 'Italic',
  underline: 'Underline',
  strike: 'Strikethrough',
  code: 'Inline code',
  link: 'Link',
  bullet: 'Bulleted list',
  ordered: 'Numbered list',
  quote: 'Quote',
  codeBlock: 'Code block',
  // A button's tooltip: its name and its keyboard shortcut.
  withShortcut: (name: string, keys: string) => `${name} (${keys})`,

  // The link popover.
  linkAddress: 'Link address',
  linkSave: 'Save',
  linkRemove: 'Remove link',

  // The character counter and validation.
  counter: (count: number, max: number) => `${count} / ${max}`,
  valueMissing: 'Please fill in this field.',
  tooLong: (max: number) => `Use ${max} characters or fewer.`,
}

export type RichTextEditorMessages = typeof en

/** The editor's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const richTextEditorMessages = defineMessages('rich-text-editor', en)
