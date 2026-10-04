import { Fragment, type Node as ProseNode, type NodeType } from 'prosemirror-model'
import { NodeSelection, Plugin, PluginKey, TextSelection, type Command, type EditorState, type Transaction } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'
import { InputRule } from 'prosemirror-inputrules'
import { MAX_INDENT, blockOf, listNumbers, schema, type ListKind, type PageEditorBlock } from './schema'

const { paragraph, heading, item, quote, code_block: codeBlock, divider, hard_break: hardBreak } = schema.nodes

/** A top-level block and where it starts. */
interface Located {
  node: ProseNode
  pos: number
  index: number
}

/** The top-level blocks the selection touches, in order. */
export function selectedBlocks(state: EditorState): Located[] {
  const { $from, $to, from, to } = state.selection
  const last = state.doc.childCount - 1
  const start = Math.min($from.index(0), last)
  let end = Math.min($to.index(0), last)
  // A selection that ends at the very start of a block does not touch it.
  if (to > from && end > start && ($to.depth === 0 || $to.parentOffset === 0)) end--
  if (state.selection instanceof NodeSelection) end = start
  const blocks: Located[] = []
  let pos = $from.posAtIndex(start, 0)
  for (let index = start; index <= end; index++) {
    const node = state.doc.child(index)
    blocks.push({ node, pos, index })
    pos += node.nodeSize
  }
  return blocks
}

/** The type and attributes a textblock gets when it becomes `block`. */
function targetOf(block: PageEditorBlock, current: ProseNode): { type: NodeType; attrs: Record<string, unknown> | null } | null {
  switch (block) {
    case 'paragraph':
      return { type: paragraph, attrs: null }
    case 'heading1':
    case 'heading2':
    case 'heading3':
      return { type: heading, attrs: { level: Number(block.slice(-1)) } }
    case 'bullet':
    case 'ordered':
    case 'todo':
      return {
        type: item,
        attrs: {
          kind: block,
          indent: current.type === item ? current.attrs.indent : 0,
          checked: current.type === item && block === 'todo' ? current.attrs.checked && current.attrs.kind === 'todo' : false,
        },
      }
    case 'quote':
      return { type: quote, attrs: null }
    default:
      return null
  }
}

/** Plain text of a textblock, line breaks as newlines. */
function plainText(node: ProseNode): string {
  let text = ''
  node.forEach((child) => {
    text += child.type === hardBreak ? '\n' : (child.text ?? '')
  })
  return text
}

/** Inline content for a line of plain text. */
const line = (text: string) => (text ? schema.text(text) : null)

/**
 * Turns the blocks the selection touches into `block`. Text blocks keep their formatting; a code block takes their
 * plain text (several blocks become one code block, one line each) and gives it back one block per line.
 */
export function setBlock(block: PageEditorBlock): Command {
  return (state, dispatch) => {
    const blocks = selectedBlocks(state)
    if (block === 'divider') return insertDivider(state, dispatch)
    if (block === 'code') {
      const textblocks = blocks.filter(({ node }) => node.isTextblock)
      if (!textblocks.length) return false
      if (textblocks.every(({ node }) => node.type === codeBlock)) return true
      if (dispatch) {
        const first = textblocks[0]
        const last = textblocks[textblocks.length - 1]
        const text = textblocks.map(({ node }) => plainText(node)).join('\n')
        const offset = state.selection.from - first.pos - 1
        const tr = state.tr.replaceWith(first.pos, last.pos + last.node.nodeSize, codeBlock.create({ language: '' }, line(text)))
        const caret = Math.max(first.pos + 1, Math.min(first.pos + 1 + Math.max(0, offset), first.pos + 1 + text.length))
        tr.setSelection(TextSelection.create(tr.doc, textblocks.length === 1 ? caret : first.pos + 1 + text.length))
        dispatch(tr.scrollIntoView())
      }
      return true
    }
    const tr = state.tr
    let changed = false
    // Back to front, so a code block split into lines does not shift the blocks still to come.
    for (const { node, pos } of [...blocks].reverse()) {
      if (!node.isTextblock) continue
      const target = targetOf(block, node)
      if (!target) return false
      if (node.type === codeBlock) {
        const lines = node.textContent.split('\n')
        const nodes = lines.map((text) => target.type.create(target.attrs, line(text)))
        tr.replaceWith(pos, pos + node.nodeSize, nodes)
        changed = true
        continue
      }
      if (node.type === target.type && JSON.stringify(node.attrs) === JSON.stringify({ ...node.attrs, ...target.attrs })) continue
      tr.setNodeMarkup(pos, target.type, target.attrs)
      changed = true
    }
    if (changed && dispatch) {
      if (blocks.length === 1 && blocks[0].node.type === codeBlock) {
        // The caret goes to the end of the first line the code block became.
        const pos = blocks[0].pos
        const first = tr.doc.nodeAt(pos)
        if (first) tr.setSelection(TextSelection.create(tr.doc, pos + 1 + first.content.size))
      }
      dispatch(tr.scrollIntoView())
    }
    return true
  }
}

/** The block at the start of the selection, as `blocks` spells it. */
export const currentBlock = (state: EditorState): PageEditorBlock => {
  const selection = state.selection
  if (selection instanceof NodeSelection) return blockOf(selection.node)
  return blockOf(state.doc.child(Math.min(selection.$from.index(0), state.doc.childCount - 1)))
}

/** Turns the selection into `block`, or back into text when it already is one. */
export function toggleBlock(block: PageEditorBlock): Command {
  return (state, dispatch) => setBlock(currentBlock(state) === block && block !== 'paragraph' ? 'paragraph' : block)(state, dispatch)
}

/** Puts a divider after the current block (in place of it when it is empty) and the caret on a line after it. */
export const insertDivider: Command = (state, dispatch) => {
  const { $from } = state.selection
  const index = $from.index(0)
  const block = state.doc.child(index)
  const pos = $from.posAtIndex(index, 0)
  if (dispatch) {
    const tr = state.tr
    const empty = block.isTextblock && block.content.size === 0
    const next = state.doc.maybeChild(index + 1)
    if (empty) tr.replaceWith(pos, pos + block.nodeSize, [divider.create(), paragraph.create()])
    else tr.insert(pos + block.nodeSize, next && next.isTextblock && next.content.size === 0 ? divider.create() : [divider.create(), paragraph.create()])
    tr.setSelection(TextSelection.create(tr.doc, (empty ? pos : pos + block.nodeSize) + 2))
    dispatch(tr.scrollIntoView())
  }
  return true
}

/**
 * Moves the selected list items one level in or out. An item takes the items nested under it along, and never
 * goes deeper than one level under the item above it.
 */
export function indentItems(delta: 1 | -1): Command {
  return (state, dispatch) => {
    const blocks = selectedBlocks(state)
    if (!blocks.some(({ node }) => node.type === item)) return false
    const doc = state.doc
    // The selection plus the items nested under its last item.
    let end = blocks[blocks.length - 1].index
    const base = blocks[blocks.length - 1].node.attrs.indent ?? 0
    while (end + 1 < doc.childCount && doc.child(end + 1).type === item && doc.child(end + 1).attrs.indent > base) end++
    const tr = state.tr
    const previous = blocks[0].index > 0 ? doc.child(blocks[0].index - 1) : null
    let previousIndent = previous?.type === item ? (previous.attrs.indent as number) : -1
    let pos = blocks[0].pos
    let changed = false
    for (let index = blocks[0].index; index <= end; index++) {
      const node = doc.child(index)
      if (node.type === item) {
        const indent = node.attrs.indent as number
        const next = Math.max(0, Math.min(indent + delta, MAX_INDENT, previousIndent + 1))
        if (next !== indent) {
          tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: next })
          changed = true
        }
        previousIndent = next
      } else {
        previousIndent = -1
      }
      pos += node.nodeSize
    }
    if (changed && dispatch) dispatch(tr)
    return true
  }
}

/** Ticks or unticks the to-do at `pos`. */
export function toggleChecked(state: EditorState, pos: number): Transaction | null {
  const node = state.doc.nodeAt(pos)
  if (!node || node.type !== item || node.attrs.kind !== 'todo') return null
  return state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, checked: !node.attrs.checked })
}

const atEndOfCode = (state: EditorState) => {
  const { $head, empty } = state.selection
  return empty && $head.parent.type === codeBlock && $head.parentOffset === $head.parent.content.size
}

/** Leaves a code block for a new line under it. */
export const exitCode: Command = (state, dispatch) => {
  const { $head } = state.selection
  if ($head.parent.type !== codeBlock) return false
  if (dispatch) {
    const after = $head.after()
    const tr = state.tr.insert(after, paragraph.create())
    tr.setSelection(TextSelection.create(tr.doc, after + 1))
    dispatch(tr.scrollIntoView())
  }
  return true
}

/** Enter inside a code block: a new line, keeping the indentation; a third Enter on blank lines at the end leaves the block. */
export const enterInCode: Command = (state, dispatch) => {
  const { $head } = state.selection
  if ($head.parent.type !== codeBlock) return false
  const text = $head.parent.textContent
  if (atEndOfCode(state) && text.endsWith('\n\n')) {
    if (dispatch) {
      const end = $head.pos
      const tr = state.tr.delete(end - 2, end)
      const after = tr.doc.resolve(end - 2).after()
      tr.insert(after, paragraph.create())
      tr.setSelection(TextSelection.create(tr.doc, after + 1))
      dispatch(tr.scrollIntoView())
    }
    return true
  }
  if (dispatch) {
    const before = text.slice(0, $head.parentOffset)
    const indent = /[^\n]*$/.exec(before)![0].match(/^[ \t]*/)![0]
    dispatch(state.tr.insertText('\n' + indent).scrollIntoView())
  }
  return true
}

/** Tab in a code block indents the line (or every selected line) by two spaces; Shift-Tab takes them away. */
export function indentCode(delta: 1 | -1): Command {
  return (state, dispatch) => {
    const { $from, $to, empty } = state.selection
    if ($from.parent.type !== codeBlock || $to.parent !== $from.parent) return false
    if (!dispatch) return true
    const start = $from.start()
    const text = $from.parent.textContent
    if (delta > 0 && empty) {
      dispatch(state.tr.insertText('  ').scrollIntoView())
      return true
    }
    const tr = state.tr
    const lineStarts: number[] = []
    for (let offset = text.lastIndexOf('\n', $from.parentOffset - 1) + 1; offset <= $to.parentOffset;) {
      lineStarts.push(offset)
      const next = text.indexOf('\n', offset)
      if (next < 0 || next >= $to.parentOffset) break
      offset = next + 1
    }
    for (const offset of lineStarts.reverse()) {
      if (delta > 0) tr.insertText('  ', start + offset)
      else {
        const spaces = /^ {1,2}|^\t/.exec(text.slice(offset))?.[0].length ?? 0
        if (spaces) tr.delete(start + offset, start + offset + spaces)
      }
    }
    if (tr.docChanged) dispatch(tr.scrollIntoView())
    return true
  }
}

/** Enter in a list item: an empty item steps out one level, then out of the list; otherwise a new item of the same kind. */
export const enterInItem: Command = (state, dispatch) => {
  const { $from, empty } = state.selection
  const node = $from.parent
  if (node.type !== item || !empty) return false
  if (node.content.size === 0) {
    if (node.attrs.indent > 0) return indentItems(-1)(state, dispatch)
    if (dispatch) dispatch(state.tr.setNodeMarkup($from.before(), paragraph))
    return true
  }
  if (dispatch) {
    // Enter at the very start opens an item above, so the text keeps its own tick.
    const tr =
      $from.parentOffset === 0
        ? state.tr.insert($from.before(), item.create({ ...node.attrs, checked: false }))
        : state.tr.split($from.pos, 1, [{ type: item, attrs: { ...node.attrs, checked: false } }])
    dispatch(tr.scrollIntoView())
  }
  return true
}

/** Enter on an empty heading or quote gives a plain line; `` ```ts `` + Enter opens a code block. */
export const enterInTextblock: Command = (state, dispatch) => {
  const { $from, empty } = state.selection
  const node = $from.parent
  if (!empty) return false
  if ((node.type === quote || node.type === heading) && node.content.size === 0) {
    if (dispatch) dispatch(state.tr.setNodeMarkup($from.before(), paragraph))
    return true
  }
  if (node.type === paragraph && $from.parentOffset === node.content.size) {
    const fence = /^```([\w+#-]*)$/.exec(node.textContent)
    if (fence) {
      if (dispatch) {
        const pos = $from.before()
        const tr = state.tr.replaceWith(pos, pos + node.nodeSize, codeBlock.create({ language: fence[1].toLowerCase() }))
        tr.setSelection(TextSelection.create(tr.doc, pos + 1))
        dispatch(tr.scrollIntoView())
      }
      return true
    }
  }
  return false
}

/**
 * Backspace at the start of a heading, list item, quote or empty code block makes it a plain line first; only the
 * next Backspace joins it to the line above.
 */
export const backspaceAtStart: Command = (state, dispatch) => {
  const { $from, empty } = state.selection
  if (!empty || $from.parentOffset > 0) return false
  const node = $from.parent
  const pos = $from.before()
  if (node.type === item || node.type === heading || node.type === quote || (node.type === codeBlock && node.content.size === 0)) {
    if (dispatch) dispatch(state.tr.setNodeMarkup(pos, paragraph, null))
    return true
  }
  if (node.type === codeBlock) {
    // A blank line above the code goes; the code itself is never merged into the line above.
    const index = $from.index(0)
    const previous = index > 0 ? state.doc.child(index - 1) : null
    if (previous && previous.isTextblock && previous.content.size === 0 && dispatch) dispatch(state.tr.delete(pos - previous.nodeSize, pos))
    return true
  }
  return false
}

/** Shift-Enter: a line break inside the block (a newline in code). */
export const lineBreak: Command = (state, dispatch) => {
  const { $from } = state.selection
  if ($from.parent.type === codeBlock) {
    if (dispatch) dispatch(state.tr.insertText('\n').scrollIntoView())
    return true
  }
  if (!$from.parent.isTextblock) return false
  if (dispatch) dispatch(state.tr.replaceSelectionWith(hardBreak.create()).scrollIntoView())
  return true
}

// ---- input rules ------------------------------------------------------------------------------------------------

/** Meta key carrying the label of the format an input rule just applied, shown with "⌫ to undo". */
export const autoformatKey = new PluginKey<{ label: string; pos: number } | null>('c2-page-editor-autoformat')

type Allowed = (block: PageEditorBlock) => boolean

function blockRule(
  pattern: RegExp,
  make: (match: RegExpMatchArray, node: ProseNode) => PageEditorBlock | null,
  allowed: Allowed,
  label: (block: PageEditorBlock) => string,
) {
  return new InputRule(pattern, (state, match, start, end) => {
    const $start = state.doc.resolve(start)
    const node = $start.parent
    const block = make(match, node)
    if (!block || !allowed(block)) return null
    const target = targetOf(block, node)
    if (!target) return null
    const tr = state.tr.delete(start, end)
    tr.setNodeMarkup($start.before(), target.type, target.attrs)
    return tr.setMeta(autoformatKey, label(block))
  })
}

export function buildInputRules(allowed: Allowed, label: (block: PageEditorBlock) => string, markAllowed: () => boolean): InputRule[] {
  const fromParagraph =
    (block: PageEditorBlock | ((match: RegExpMatchArray) => PageEditorBlock)) =>
    (match: RegExpMatchArray, node: ProseNode): PageEditorBlock | null =>
      node.type === paragraph ? (typeof block === 'string' ? block : block(match)) : null

  const markRule = (pattern: RegExp, open: number, type: keyof typeof schema.marks, name: string) =>
    new InputRule(pattern, (state, match, start, end) => {
      if (!markAllowed()) return null
      const [whole, lead = '', inner] = match
      const from = start + lead.length
      const innerFrom = from + open
      const innerTo = innerFrom + inner.length
      if (innerTo > end || state.doc.rangeHasMark(from, end, schema.marks.code)) return null
      const tr = state.tr
      // The last delimiter character is the one being typed and is not in the document yet.
      tr.delete(innerTo, Math.min(end, from + whole.length - lead.length - 1))
      tr.delete(from, innerFrom)
      const mark = schema.marks[type].create()
      tr.addMark(from, from + inner.length, mark)
      tr.removeStoredMark(mark.type)
      return tr.setMeta(autoformatKey, name)
    })

  return [
    blockRule(
      /^(#{1,3})\s$/,
      fromParagraph((match) => `heading${match[1].length}` as PageEditorBlock),
      allowed,
      label,
    ),
    blockRule(/^[-*+]\s$/, fromParagraph('bullet'), allowed, label),
    blockRule(/^\d{1,9}[.)]\s$/, fromParagraph('ordered'), allowed, label),
    blockRule(
      /^\[([ xX]?)\]\s$/,
      (_match, node) => (node.type === paragraph || (node.type === item && node.attrs.kind === 'bullet') ? 'todo' : null),
      allowed,
      label,
    ),
    blockRule(/^>\s$/, fromParagraph('quote'), allowed, label),
    new InputRule(/^```([\w+#-]*)\s$/, (state, match, start, end) => {
      const $start = state.doc.resolve(start)
      if ($start.parent.type !== paragraph || !allowed('code')) return null
      const pos = $start.before()
      const node = $start.parent
      const rest = node.textBetween(end - pos - 1, node.content.size)
      const tr = state.tr.replaceWith(pos, pos + node.nodeSize, codeBlock.create({ language: match[1].toLowerCase() }, line(rest)))
      tr.setSelection(TextSelection.create(tr.doc, pos + 1))
      return tr.setMeta(autoformatKey, label('code'))
    }),
    new InputRule(/^---$/, (state, _match, start, end) => {
      const $start = state.doc.resolve(start)
      const node = $start.parent
      if (node.type !== paragraph || !allowed('divider') || end - start !== node.content.size) return null
      const pos = $start.before()
      const tr = state.tr.replaceWith(pos, pos + node.nodeSize, [divider.create(), paragraph.create()])
      tr.setSelection(TextSelection.create(tr.doc, pos + 2))
      return tr.setMeta(autoformatKey, label('divider'))
    }),
    markRule(/()\*\*([^*\s](?:[^*]*[^*\s])?)\*\*$/, 2, 'bold', 'Bold'),
    markRule(/(^|[^*])\*([^*\s](?:[^*]*[^*\s])?)\*$/, 1, 'italic', 'Italic'),
    markRule(/()~~([^~\s](?:[^~]*[^~\s])?)~~$/, 2, 'strike', 'Strikethrough'),
    markRule(/(^|[^`])`([^`]+)`$/, 1, 'code', 'Code'),
  ]
}

/** Shows what an input rule just did, with the key that undoes it, until the next edit or caret move. */
export function autoformatHint(enabled: () => boolean): Plugin {
  return new Plugin<{ label: string; pos: number } | null>({
    key: autoformatKey,
    state: {
      init: () => null,
      apply: (tr, value) => {
        const label = tr.getMeta(autoformatKey) as string | undefined
        if (label) return { label, pos: tr.selection.head }
        if (tr.docChanged || tr.selectionSet) return null
        return value
      },
    },
    props: {
      decorations: (state) => {
        const hint = autoformatKey.getState(state)
        if (!hint || !enabled()) return null
        return DecorationSet.create(state.doc, [
          Decoration.widget(
            hint.pos,
            () => {
              const span = document.createElement('span')
              span.className = 'autoformat-hint'
              span.contentEditable = 'false'
              span.setAttribute('aria-hidden', 'true')
              span.textContent = `${hint.label} · ⌫ to undo`
              return span
            },
            { side: 1, ignoreSelection: true, key: `hint-${hint.label}` },
          ),
        ])
      },
    },
  })
}

/** The numbers ordered items show, as node decorations the item view reads. */
export const listNumbering = new Plugin({
  state: {
    init: (_config, state) => numbering(state.doc),
    apply: (tr, set, _old, state) => (tr.docChanged ? numbering(state.doc) : set),
  },
  props: {
    decorations(state) {
      return this.getState(state)
    },
  },
})

function numbering(doc: ProseNode): DecorationSet {
  const numbers = listNumbers(doc)
  const decorations: Decoration[] = []
  doc.forEach((node, pos, index) => {
    if (numbers[index]) decorations.push(Decoration.node(pos, pos + node.nodeSize, {}, { number: numbers[index] }))
  })
  return DecorationSet.create(doc, decorations)
}

/**
 * Keeps the page well formed after any change: an item is never more than one level deeper than the item above it,
 * and a code block or divider at the end always has a line after it for the caret.
 */
export const normalize = new Plugin({
  appendTransaction(transactions, _old, state) {
    if (!transactions.some((tr) => tr.docChanged)) return null
    const tr = state.tr
    let previousIndent = -1
    state.doc.forEach((node, pos) => {
      if (node.type === item) {
        const indent = Math.min(node.attrs.indent, previousIndent + 1)
        if (indent !== node.attrs.indent) tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent })
        previousIndent = indent
      } else previousIndent = -1
    })
    const last = state.doc.lastChild
    if (last && (last.type === codeBlock || last.type === divider)) tr.insert(state.doc.content.size, paragraph.create())
    return tr.docChanged ? tr.setMeta('addToHistory', false) : null
  },
})

/** Content of `kind` items for plain lines, used when pasting into a list. */
export const itemsOf = (lines: string[], kind: ListKind, indent: number) =>
  Fragment.fromArray(lines.map((text) => item.create({ kind, indent, checked: false }, line(text))))
