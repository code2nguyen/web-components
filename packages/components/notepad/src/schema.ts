import { Schema, type Mark, type MarkSpec } from 'prosemirror-model'

/**
 * The default inks, in order: ink `1` is blue, `2` black and so on. Each resolves to `--c2-notepad__ink-<name>--color`.
 * A page stores an ink by its position in the list (`<span data-ink="3">`), so these names are only read from older
 * values (`data-ink="red"`) and mapped to their position.
 */
export const INKS = ['blue', 'black', 'red', 'green'] as const
/** The default highlighters, in order. Each resolves to `--c2-notepad__highlight-<name>--background`. */
export const HIGHLIGHTS = ['yellow', 'green', 'pink'] as const

export type NotepadInk = (typeof INKS)[number]
export type NotepadHighlight = (typeof HIGHLIGHTS)[number]

/** One colour of the `inks` or `highlights` list. */
export interface NotepadColor {
  /** Accessible name of its swatch, e.g. `Red ink`. */
  label: string
  /** Any CSS colour, including a `var()`: a list that follows the theme needs no reassigning. */
  color: string
}

/**
 * The 1-based position of a colour from what a page or a caller wrote: a number (`2`, `"2"`), or a default colour's
 * name (`red` → 3), which is how values written before positions were stored keep their colour.
 */
export function colorIndex(value: unknown, names: readonly string[]): number | null {
  if (typeof value === 'number') return Number.isInteger(value) && value >= 1 ? value : null
  if (typeof value !== 'string') return null
  if (/^[1-9]\d*$/.test(value)) return Number(value)
  const named = names.indexOf(value)
  return named >= 0 ? named + 1 : null
}

/** Names accepted by `marks`, `format()` and reported by `format-change`. */
export const MARK_NAMES = ['bold', 'italic', 'underline', 'strike', 'ink', 'highlight'] as const
export type NotepadMark = (typeof MARK_NAMES)[number]

const inkIndex = (value: unknown) => colorIndex(value, INKS)
const highlightIndex = (value: unknown) => colorIndex(value, HIGHLIGHTS)

const tagMark = (tags: string[], tag: string): MarkSpec => ({
  parseDOM: tags.map((name) => ({ tag: name })),
  toDOM: () => [tag, 0],
})

/**
 * A page is a list of lines. Every mark keeps the line height, so nothing a writer applies can push text off the
 * ruled lines: there are no headings, sizes or arbitrary colours, only the inks and highlighters of the component's lists, stored by
 * position. A mark draws its colour from `--_ink-<n>` / `--_highlight-<n>`, which the component sets from its lists,
 * so replacing a list recolours the page without touching the document.
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
      attrs: { color: { default: 1 } },
      parseDOM: [
        {
          tag: 'span[data-ink]',
          getAttrs: (dom) => {
            const color = inkIndex((dom as HTMLElement).dataset.ink)
            return color ? { color } : false
          },
        },
      ],
      toDOM: (mark) => [
        'span',
        { 'data-ink': String(mark.attrs.color), style: `--_mark-day: var(--_ink-${mark.attrs.color}); --_mark-night: var(--_ink-${mark.attrs.color}-night)` },
        0,
      ],
    },
    highlight: {
      attrs: { color: { default: 1 } },
      parseDOM: [
        {
          tag: 'mark',
          getAttrs: (dom) => ({ color: highlightIndex((dom as HTMLElement).dataset.color) ?? 1 }),
        },
      ],
      toDOM: (mark) => ['mark', { 'data-color': String(mark.attrs.color), style: `--_highlight: var(--_highlight-${mark.attrs.color})` }, 0],
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

export { inkIndex, highlightIndex }

/** The `format-change` detail: what the selection currently carries. */
export interface NotepadFormat {
  bold: boolean
  italic: boolean
  underline: boolean
  strike: boolean
  /** 1-based position of the ink in the `inks` list. */
  ink: number | null
  /** 1-based position of the highlighter in the `highlights` list. */
  highlight: number | null
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
