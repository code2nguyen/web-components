import type { Mark, Node as ProseNode } from 'prosemirror-model'
import { schema, highlightIndex, inkIndex } from './schema'

/**
 * The value is a small, line-based Markdown dialect, chosen so it reads well as plain text and in any Markdown
 * renderer:
 *
 * - one line of the page is one line of the value, so a blank line is a blank ruled line;
 * - `- [ ] task` / `- [x] done` are checklist lines;
 * - `**bold**`, `*italic*`, `~~strike~~` and `==highlight==` (the first highlighter) are the usual delimiters;
 * - what Markdown has no syntax for is written as inline HTML, which Markdown passes through:
 *   `<u>underline</u>`, `<span data-ink="3">ink</span>`, `<mark data-color="2">highlight</mark>`. An ink or a
 *   highlighter is the 1-based position of its colour in the component's list; the default colours' names
 *   (`data-ink="red"`) are still read, as their position.
 *
 * Anything else is text. Parsing never throws: an unclosed delimiter or an unknown tag stays literal.
 */

const TASK = /^(?:[-*+]\s+)?\[([ xX])\](?:\s|$)/
const RANK = ['ink', 'highlight', 'bold', 'italic', 'underline', 'strike']
const PUNCTUATION = /[!-/:-@[-`{-~]/

const byRank = (a: Mark, b: Mark) => RANK.indexOf(a.type.name) - RANK.indexOf(b.type.name)

/** Marks spelled as an HTML tag do not care about the whitespace around them; delimiter marks do. */
const isTagMark = (mark: Mark) => mark.type.name === 'ink' || mark.type.name === 'underline' || (mark.type.name === 'highlight' && mark.attrs.color !== 1)

function openMark(mark: Mark): string {
  switch (mark.type.name) {
    case 'ink':
      return `<span data-ink="${mark.attrs.color}">`
    case 'highlight':
      return mark.attrs.color === 1 ? '==' : `<mark data-color="${mark.attrs.color}">`
    case 'bold':
      return '**'
    case 'italic':
      return '*'
    case 'underline':
      return '<u>'
    default:
      return '~~'
  }
}

function closeMark(mark: Mark): string {
  switch (mark.type.name) {
    case 'ink':
      return '</span>'
    case 'highlight':
      return mark.attrs.color === 1 ? '==' : '</mark>'
    case 'underline':
      return '</u>'
    default:
      return openMark(mark)
  }
}

function escapeText(text: string): string {
  let out = ''
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    const pairable = ch === '=' || ch === '~'
    if (ch === '\\' || ch === '*' || (ch === '<' && /[a-zA-Z/]/.test(text[i + 1] ?? ''))) out += '\\' + ch
    // A lone `=` or `~` inside a word is safe; one that could join a neighbour, or a delimiter next to it, is not.
    else if (pairable && (i === 0 || i === text.length - 1 || text[i - 1] === ch || text[i + 1] === ch)) out += '\\' + ch
    else out += ch
  }
  return out
}

interface Segment {
  text: string
  marks: readonly Mark[]
}

function serializeInline(block: ProseNode): string {
  const children: ProseNode[] = []
  block.forEach((child) => children.push(child))
  const segments: Segment[] = []
  children.forEach((child, index) => {
    const text = child.text ?? ''
    const marks = [...child.marks].sort(byRank)
    const previous = segments[segments.length - 1]?.marks ?? []
    const next = children[index + 1]?.marks ?? []
    // `** bold**` is not bold in CommonMark: move flanking whitespace outside the delimiters that end or start here.
    const keep = (neighbour: readonly Mark[]) => marks.filter((mark) => isTagMark(mark) || mark.isInSet(neighbour))
    const lead = /^\s*/.exec(text)![0]
    if (lead.length === text.length) {
      segments.push({ text, marks: keep(previous) })
      return
    }
    const trail = /\s*$/.exec(text)![0]
    if (lead) segments.push({ text: lead, marks: keep(previous) })
    segments.push({ text: text.slice(lead.length, text.length - trail.length), marks })
    if (trail) segments.push({ text: trail, marks: keep(next) })
  })

  let out = ''
  let stack: readonly Mark[] = []
  for (const segment of segments) {
    let common = 0
    while (common < stack.length && common < segment.marks.length && stack[common].eq(segment.marks[common])) common++
    for (let i = stack.length - 1; i >= common; i--) out += closeMark(stack[i])
    for (let i = common; i < segment.marks.length; i++) out += openMark(segment.marks[i])
    stack = segment.marks
    out += escapeText(segment.text)
  }
  for (let i = stack.length - 1; i >= 0; i--) out += closeMark(stack[i])
  return out
}

/** Serializes a page to the notepad Markdown dialect. */
export function toMarkdown(doc: ProseNode): string {
  const lines: string[] = []
  doc.forEach((block) => {
    let body = serializeInline(block)
    if (block.type.name === 'task') {
      lines.push((block.attrs.checked ? '- [x]' : '- [ ]') + (body ? ' ' + body : ''))
      return
    }
    // A written line that happens to look like a checklist item stays a written line.
    if (TASK.test(body)) body = body.replace('[', '\\[')
    lines.push(body)
  })
  // A page that holds one empty line is an empty page.
  return lines.length === 1 && lines[0] === '' ? '' : lines.join('\n')
}

const DELIMITERS = [
  { token: '**', mark: () => schema.marks.bold.create() },
  { token: '~~', mark: () => schema.marks.strike.create() },
  { token: '==', mark: () => schema.marks.highlight.create({ color: 1 }) },
  { token: '*', mark: () => schema.marks.italic.create() },
]

const TAG = /^<(\/?)(u|s|del|strike|b|strong|i|em|mark|span)((?:\s+[a-z-]+="[^"]*")*)\s*>/i

function tagMark(name: string, attributes: string): Mark | null {
  const attr = (key: string) => new RegExp(`\\s${key}="([^"]*)"`).exec(attributes)?.[1]
  switch (name) {
    case 'u':
      return schema.marks.underline.create()
    case 's':
    case 'del':
    case 'strike':
      return schema.marks.strike.create()
    case 'b':
    case 'strong':
      return schema.marks.bold.create()
    case 'i':
    case 'em':
      return schema.marks.italic.create()
    case 'mark': {
      return schema.marks.highlight.create({ color: highlightIndex(attr('data-color')) ?? 1 })
    }
    default: {
      const color = inkIndex(attr('data-ink'))
      return color ? schema.marks.ink.create({ color }) : null
    }
  }
}

/** Whether `token` closes later in the line, after a non-space character. */
function closes(source: string, from: number, token: string): boolean {
  for (let i = from; i < source.length; i++) {
    if (source[i] === '\\') {
      i++
      continue
    }
    if (source.startsWith(token, i) && i > from && !/\s/.test(source[i - 1])) return true
  }
  return false
}

function parseInline(source: string): ProseNode[] {
  const nodes: ProseNode[] = []
  let marks: readonly Mark[] = []
  let buffer = ''
  const tags: Array<{ name: string; mark: Mark | null }> = []
  const flush = () => {
    if (buffer) nodes.push(schema.text(buffer, marks))
    buffer = ''
  }

  let i = 0
  scan: while (i < source.length) {
    const ch = source[i]
    if (ch === '\\' && PUNCTUATION.test(source[i + 1] ?? '')) {
      buffer += source[i + 1]
      i += 2
      continue
    }
    for (const delimiter of DELIMITERS) {
      if (!source.startsWith(delimiter.token, i)) continue
      const mark = delimiter.mark()
      const open = marks.some((active) => active.type === mark.type && (mark.type.name !== 'highlight' || active.attrs.color === 1))
      const after = source[i + delimiter.token.length] ?? ''
      if (open) {
        flush()
        marks = marks.filter((active) => active.type !== mark.type)
      } else if (after && !/\s/.test(after) && closes(source, i + delimiter.token.length, delimiter.token)) {
        flush()
        marks = mark.addToSet(marks)
      } else {
        break
      }
      i += delimiter.token.length
      continue scan
    }
    if (ch === '<') {
      const tag = TAG.exec(source.slice(i))
      if (tag) {
        const [whole, closing, rawName, attributes] = tag
        const name = rawName.toLowerCase()
        if (closing) {
          let index = tags.length - 1
          while (index >= 0 && tags[index].name !== name) index--
          if (index >= 0) {
            flush()
            const [entry] = tags.splice(index, 1)
            if (entry.mark) marks = entry.mark.removeFromSet(marks)
            i += whole.length
            continue
          }
        } else {
          const mark = tagMark(name, attributes)
          flush()
          tags.push({ name, mark })
          if (mark) marks = mark.addToSet(marks)
          i += whole.length
          continue
        }
      }
    }
    buffer += ch
    i++
  }
  flush()
  return nodes
}

/** Parses the notepad Markdown dialect into a page. */
export function fromMarkdown(markdown: string): ProseNode {
  const blocks = (markdown ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => {
      const task = TASK.exec(line)
      if (task) return schema.nodes.task.create({ checked: task[1] !== ' ' }, parseInline(line.slice(task[0].length)))
      return schema.nodes.line.create(null, parseInline(line))
    })
  return schema.nodes.doc.create(null, blocks)
}
