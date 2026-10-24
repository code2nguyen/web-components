/**
 * The editing core of the page editor, for the other ProseMirror editors in this repository (`c2-rich-text-editor`):
 * the schema, the Markdown value, the block commands and input rules, and the HTML export. Not public API: the
 * umbrella does not re-export this subpath.
 */
export {
  autoformatHint,
  autoformatKey,
  backspaceAtStart,
  buildInputRules,
  currentBlock,
  enterInCode,
  enterInItem,
  enterInTextblock,
  exitCode,
  indentCode,
  indentItems,
  lineBreak,
  listNumbering,
  markExtent,
  normalize,
  setBlock,
  toggleBlock,
} from './commands'
export { pageToHTML, splitPastedLines } from './html'
export { fromMarkdown, toMarkdown } from './markdown'
export { BLOCK_NAMES, MARK_NAMES, blockOf, formatOf, safeHref, schema, type PageEditorBlock, type PageEditorFormat, type PageEditorMark } from './schema'
