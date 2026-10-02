import { Schema, type Mark, type MarkSpec } from 'prosemirror-model'

/** Ink colours a writer can pick. Each resolves to `--c2-notepad__ink-<name>--color`. */
export const INKS = ['blue', 'black', 'red', 'green'] as const
/** Highlighter colours. Each resolves to `--c2-notepad__highlight-<name>--background`. */
export const HIGHLIGHTS = ['yellow', 'green', 'pink'] as const

export type NotepadInk = (typeof INKS)[number]
export type NotepadHighlight = (typeof HIGHLIGHTS)[number]

/** Names accepted by `marks`, `format()` and reported by `format-change`. */
export const MARK_NAMES = ['bold', 'italic', 'underline', 'strike', 'ink', 'highlight'] as const
export type NotepadMark = (typeof MARK_NAMES)[number]

const isInk = (value: unknown): value is NotepadInk => INKS.includes(value as NotepadInk)
const isHighlight = (value: unknown): value is NotepadHighlight => HIGHLIGHTS.includes(value as NotepadHighlight)

const tagMark = (tags: string[], tag: string): MarkSpec => ({
  parseDOM: tags.map((name) => ({ tag: name })),
  toDOM: () => [tag, 0],
})

/**
 * A page is a list of lines. Every mark keeps the line height, so nothing a writer applies can push text off the
 * ruled lines: there are no headings, sizes or arbitrary colours, only named inks and highlighters.
 */
export const schema = new Schema({
  nodes: {
    doc: { content: '(line | task)+' },
    line: {
      content: 'text*',
      marks: '_',
      parseDOM: [{ tag: 'p' }, { tag: 'div' }, { tag: 'h1' }, { tag: 'h2' }, { tag: 'h3' }, { tag: 'h4' }, { tag: 'h5' }, { tag: 'h6' }, { tag: 'pre' }],
      toDOM: () => ['p', 0],
    },
    task: {
      content: 'text*',
      marks: '_',
      attrs: { checked: { default: false } },
      parseDOM: [
        {
          tag: 'li',
          priority: 60,
          getAttrs: (dom) => {
            const box = (dom as HTMLElement).querySelector('input[type=checkbox]') as HTMLInputElement | null
            if (!box && !(dom as HTMLElement).hasAttribute('data-checked')) return false
            return { checked: box ? box.checked : (dom as HTMLElement).getAttribute('data-checked') === 'true' }
          },
        },
      ],
      toDOM: (node) => ['li', { 'data-checked': String(node.attrs.checked) }, 0],
    },
    text: {},
  },
  marks: {
    // The order is the nesting order: ink and highlight wrap the emphasis marks.
    ink: {
      attrs: { color: { default: 'blue' } },
      parseDOM: [
        {
          tag: 'span[data-ink]',
          getAttrs: (dom) => {
            const color = (dom as HTMLElement).dataset.ink
            return isInk(color) ? { color } : false
          },
        },
      ],
      toDOM: (mark) => ['span', { 'data-ink': mark.attrs.color }, 0],
    },
    highlight: {
      attrs: { color: { default: 'yellow' } },
      parseDOM: [
        {
          tag: 'mark',
          getAttrs: (dom) => {
            const color = (dom as HTMLElement).dataset.color ?? 'yellow'
            return isHighlight(color) ? { color } : { color: 'yellow' }
          },
        },
      ],
      toDOM: (mark) => ['mark', { 'data-color': mark.attrs.color }, 0],
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
    underline: tagMark(['u'], 'u'),
    strike: {
      ...tagMark(['s', 'del', 'strike'], 's'),
      parseDOM: [{ tag: 's' }, { tag: 'del' }, { tag: 'strike' }, { style: 'text-decoration=line-through' }],
    },
  },
})

export { isInk, isHighlight }

/** The `format-change` detail: what the selection currently carries. */
export interface NotepadFormat {
  bold: boolean
  italic: boolean
  underline: boolean
  strike: boolean
  ink: NotepadInk | null
  highlight: NotepadHighlight | null
}

export const emptyFormat = (): NotepadFormat => ({ bold: false, italic: false, underline: false, strike: false, ink: null, highlight: null })

export function formatOf(marks: readonly Mark[]): NotepadFormat {
  const format = emptyFormat()
  for (const mark of marks) {
    const name = mark.type.name
    if (name === 'ink') format.ink = mark.attrs.color
    else if (name === 'highlight') format.highlight = mark.attrs.color
    else if (name in format) format[name as 'bold' | 'italic' | 'underline' | 'strike'] = true
  }
  return format
}
