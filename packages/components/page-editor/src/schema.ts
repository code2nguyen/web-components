import { Schema, type Mark, type Node as ProseNode } from 'prosemirror-model'

/** The named colours a writer can give text or its background. Each resolves to a CSS variable, so themes and dark mode recolour them. */
export const COLORS = ['gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'red'] as const
export type PageEditorColor = (typeof COLORS)[number]

/** Block types accepted by `blocks`, `setBlock()` and reported by `format-change`. */
export const BLOCK_NAMES = ['paragraph', 'heading1', 'heading2', 'heading3', 'bullet', 'ordered', 'todo', 'quote', 'code', 'divider'] as const
export type PageEditorBlock = (typeof BLOCK_NAMES)[number]

/** Inline formats accepted by `toggleMark()`. */
export const MARK_NAMES = ['bold', 'italic', 'underline', 'strike', 'code'] as const
export type PageEditorMark = (typeof MARK_NAMES)[number]

export type ListKind = 'bullet' | 'ordered' | 'todo'

/** List items nest this deep: level 0 plus three indents. */
export const MAX_INDENT = 3

export const isColor = (value: unknown): value is PageEditorColor => COLORS.includes(value as PageEditorColor)

/** Links keep web, mail, phone and relative addresses; anything else (`javascript:`) is dropped. */
export function safeHref(href: string | null | undefined): string | null {
  const value = (href ?? '').trim()
  if (!value) return null
  if (/^(https?:|mailto:|tel:)/i.test(value) || /^[/#?.]/.test(value)) return value
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return null
  // A bare domain ("example.com/docs") is a web address.
  return /^[\w-]+(\.[\w-]+)+([/?#].*)?$/.test(value) ? `https://${value}` : value
}

const listDepth = (dom: HTMLElement) => {
  let depth = 0
  for (let parent = dom.parentElement?.parentElement; parent; parent = parent.parentElement) {
    if (parent.tagName === 'UL' || parent.tagName === 'OL') depth++
  }
  return Math.min(depth, MAX_INDENT)
}

/**
 * A page is a flat list of blocks. List items are not nested nodes: each carries its kind and indent, which keeps
 * Enter, Backspace and Tab to one rule each and lets a bullet turn into a to-do or a heading without restructuring.
 */
export const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: {
      group: 'block',
      content: 'inline*',
      parseDOM: [{ tag: 'p' }],
      toDOM: () => ['p', 0],
    },
    heading: {
      group: 'block',
      content: 'inline*',
      attrs: { level: { default: 1 } },
      defining: true,
      parseDOM: [
        { tag: 'h1', attrs: { level: 1 } },
        { tag: 'h2', attrs: { level: 2 } },
        { tag: 'h3', attrs: { level: 3 } },
        { tag: 'h4', attrs: { level: 3 } },
        { tag: 'h5', attrs: { level: 3 } },
        { tag: 'h6', attrs: { level: 3 } },
      ],
      toDOM: (node) => [`h${node.attrs.level}`, 0],
    },
    item: {
      group: 'block',
      content: 'inline*',
      attrs: { kind: { default: 'bullet' }, indent: { default: 0 }, checked: { default: false } },
      defining: true,
      parseDOM: [
        {
          tag: 'li',
          getAttrs: (dom) => {
            const element = dom as HTMLElement
            const box = element.querySelector(
              ':scope > input[type=checkbox], :scope > p > input[type=checkbox], :scope > label > input[type=checkbox]',
            ) as HTMLInputElement | null
            const todo = box || element.hasAttribute('data-checked')
            const kind = todo ? 'todo' : element.parentElement?.tagName === 'OL' ? 'ordered' : 'bullet'
            const checked = box ? box.checked || box.hasAttribute('checked') : element.getAttribute('data-checked') === 'true'
            return { kind, checked, indent: listDepth(element) }
          },
        },
        {
          tag: 'div[data-kind]',
          getAttrs: (dom) => {
            const element = dom as HTMLElement
            const kind = element.dataset.kind
            if (kind !== 'bullet' && kind !== 'ordered' && kind !== 'todo') return false
            const indent = Math.max(0, Math.min(MAX_INDENT, Number(element.dataset.indent) || 0))
            return { kind, indent, checked: element.dataset.checked === 'true' }
          },
        },
      ],
      toDOM: (node) => [
        'div',
        { class: 'item', 'data-kind': node.attrs.kind, 'data-indent': String(node.attrs.indent), 'data-checked': String(node.attrs.checked) },
        0,
      ],
    },
    quote: {
      group: 'block',
      content: 'inline*',
      defining: true,
      parseDOM: [
        // A quote of several paragraphs becomes one quote per paragraph.
        { tag: 'blockquote > p', priority: 60 },
        {
          tag: 'blockquote',
          getAttrs: (dom) => ((dom as HTMLElement).querySelector('p') ? false : null),
        },
      ],
      toDOM: () => ['blockquote', 0],
    },
    code_block: {
      group: 'block',
      content: 'text*',
      marks: '',
      code: true,
      defining: true,
      attrs: { language: { default: '' } },
      parseDOM: [
        {
          tag: 'pre',
          preserveWhitespace: 'full',
          getAttrs: (dom) => {
            const element = dom as HTMLElement
            const source = `${element.className} ${element.querySelector('code')?.className ?? ''} ${element.dataset.language ?? ''}`
            const language = /(?:^|\s)(?:language|lang)-([\w+#-]+)/.exec(source)?.[1] ?? element.dataset.language ?? ''
            return { language }
          },
        },
      ],
      toDOM: (node) => ['pre', { 'data-language': node.attrs.language }, ['code', 0]],
    },
    divider: {
      group: 'block',
      parseDOM: [{ tag: 'hr' }],
      toDOM: () => ['hr'],
    },
    text: { group: 'inline' },
    hard_break: {
      group: 'inline',
      inline: true,
      selectable: false,
      parseDOM: [{ tag: 'br' }],
      toDOM: () => ['br'],
    },
  },
  marks: {
    // The order is the nesting order: a link wraps colours, colours wrap emphasis, code is innermost.
    link: {
      attrs: { href: {} },
      inclusive: false,
      parseDOM: [
        {
          tag: 'a[href]',
          getAttrs: (dom) => {
            const href = safeHref((dom as HTMLElement).getAttribute('href'))
            return href ? { href } : false
          },
        },
      ],
      toDOM: (mark) => ['a', { href: mark.attrs.href, rel: 'noopener noreferrer nofollow' }, 0],
    },
    color: {
      attrs: { name: {} },
      parseDOM: [
        {
          tag: 'span[data-color]',
          getAttrs: (dom) => {
            const name = (dom as HTMLElement).dataset.color
            return isColor(name) ? { name } : false
          },
        },
      ],
      toDOM: (mark) => ['span', { 'data-color': mark.attrs.name }, 0],
    },
    background: {
      attrs: { name: {} },
      parseDOM: [
        {
          tag: 'mark',
          getAttrs: (dom) => {
            const name = (dom as HTMLElement).dataset.color ?? 'yellow'
            return { name: isColor(name) ? name : 'yellow' }
          },
        },
      ],
      toDOM: (mark) => ['mark', { 'data-color': mark.attrs.name }, 0],
    },
    bold: {
      parseDOM: [
        { tag: 'strong' },
        // Google Docs wraps a whole paste in <b style="font-weight: normal">.
        { tag: 'b', getAttrs: (dom) => ((dom as HTMLElement).style.fontWeight !== 'normal' ? null : false) },
        { style: 'font-weight', getAttrs: (value) => (/^(bold(er)?|[6-9]\d{2})$/.test(value as string) ? null : false) },
      ],
      toDOM: () => ['strong', 0],
    },
    italic: {
      parseDOM: [{ tag: 'em' }, { tag: 'i' }, { style: 'font-style=italic' }],
      toDOM: () => ['em', 0],
    },
    underline: {
      parseDOM: [{ tag: 'u' }, { style: 'text-decoration=underline' }],
      toDOM: () => ['u', 0],
    },
    strike: {
      parseDOM: [{ tag: 's' }, { tag: 'del' }, { tag: 'strike' }, { style: 'text-decoration=line-through' }],
      toDOM: () => ['s', 0],
    },
    code: {
      parseDOM: [{ tag: 'code' }],
      toDOM: () => ['code', 0],
    },
  },
})

/** The block type of a node, as `blocks` spells it. */
export function blockOf(node: ProseNode): PageEditorBlock {
  switch (node.type.name) {
    case 'heading':
      return `heading${node.attrs.level as 1 | 2 | 3}`
    case 'item':
      return node.attrs.kind as ListKind
    case 'quote':
      return 'quote'
    case 'code_block':
      return 'code'
    case 'divider':
      return 'divider'
    default:
      return 'paragraph'
  }
}

/** The `format-change` detail: the block at the caret and what the selected text carries. */
export interface PageEditorFormat {
  block: PageEditorBlock
  bold: boolean
  italic: boolean
  underline: boolean
  strike: boolean
  code: boolean
  /** Address of the link at the selection, or `null`. */
  link: string | null
  color: PageEditorColor | null
  background: PageEditorColor | null
}

export const emptyFormat = (block: PageEditorBlock = 'paragraph'): PageEditorFormat => ({
  block,
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  code: false,
  link: null,
  color: null,
  background: null,
})

export function formatOf(marks: readonly Mark[], block: PageEditorBlock): PageEditorFormat {
  const format = emptyFormat(block)
  for (const mark of marks) {
    const name = mark.type.name
    if (name === 'link') format.link = mark.attrs.href
    else if (name === 'color') format.color = mark.attrs.name
    else if (name === 'background') format.background = mark.attrs.name
    else if (name in format) format[name as PageEditorMark] = true
  }
  return format
}

/**
 * The number each ordered item shows, by block index (0 for every other block). A run counts up per indent and
 * restarts after anything that is not a deeper list item.
 */
export function listNumbers(doc: ProseNode): number[] {
  const numbers: number[] = []
  let counters: number[] = []
  doc.forEach((block) => {
    if (block.type.name !== 'item') {
      counters = []
      numbers.push(0)
      return
    }
    const indent = block.attrs.indent as number
    counters.length = indent + 1
    if (block.attrs.kind === 'ordered') {
      counters[indent] = (counters[indent] ?? 0) + 1
      numbers.push(counters[indent])
    } else {
      counters[indent] = 0
      numbers.push(0)
    }
  })
  return numbers
}
