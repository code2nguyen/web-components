import { Fragment, type Mark, type Node as ProseNode } from 'prosemirror-model'
import { MAX_INDENT, isColor, listNumbers, safeHref, schema } from './schema'

/**
 * The value is GitHub-flavoured Markdown, so it reads well as plain text and renders anywhere:
 *
 * - `#`–`###` headings, `-` bullets, `1.` numbered items, `- [ ]` / `- [x]` to-dos (nested by indentation), `>`
 *   quotes, fenced code blocks with a language, and `---` dividers;
 * - `**bold**`, `*italic*`, `~~strike~~`, `` `code` `` and `[links](https://…)`;
 * - what Markdown has no syntax for is inline HTML, which Markdown passes through: `<u>underline</u>`,
 *   `<span data-color="red">text colour</span>`, `<mark data-color="yellow">background</mark>`, and `<br>` for a
 *   line break inside a block or an empty line between blocks.
 *
 * Parsing never throws: an unclosed delimiter or an unknown tag stays literal.
 */

const RANK = ['link', 'color', 'background', 'bold', 'italic', 'underline', 'strike']
const PUNCTUATION = /[!-/:-@[-`{-~]/

const byRank = (a: Mark, b: Mark) => RANK.indexOf(a.type.name) - RANK.indexOf(b.type.name)

/** Marks spelled as an HTML tag (or a link) do not care about the whitespace around them; delimiter marks do. */
const isTagMark = (mark: Mark) => !['bold', 'italic', 'strike'].includes(mark.type.name)

function openMark(mark: Mark): string {
  switch (mark.type.name) {
    case 'link':
      return '['
    case 'color':
      return `<span data-color="${mark.attrs.name}">`
    case 'background':
      return `<mark data-color="${mark.attrs.name}">`
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
    case 'link':
      return `](${String(mark.attrs.href).replace(/[()\s]/g, encodeURIComponent)})`
    case 'color':
      return '</span>'
    case 'background':
      return '</mark>'
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
    if (ch === '\\' || ch === '*' || ch === '`' || ch === '[' || ch === ']' || (ch === '<' && /[a-zA-Z/]/.test(text[i + 1] ?? ''))) out += '\\' + ch
    // A lone `~` or `=` inside a word is safe; two in a row would open a delimiter.
    else if ((ch === '~' || ch === '=') && (text[i - 1] === ch || text[i + 1] === ch)) out += '\\' + ch
    else if (ch === '_' && !/\w/.test(text[i - 1] ?? '') !== !/\w/.test(text[i + 1] ?? '')) out += '\\' + ch
    else out += ch
  }
  return out
}

function codeSpan(text: string): string {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length))
  const fence = '`'.repeat(longest + 1)
  const pad = text.startsWith('`') || text.endsWith('`') || (/^ .* $/.test(text) && text.trim()) ? ' ' : ''
  return fence + pad + text + pad + fence
}

interface Segment {
  text: string
  marks: readonly Mark[]
  code: boolean
  br?: boolean
}

function serializeInline(block: ProseNode): string {
  const children: ProseNode[] = []
  block.forEach((child) => children.push(child))
  const segments: Segment[] = []
  const codeType = schema.marks.code
  children.forEach((child, index) => {
    const code = codeType.isInSet(child.marks) !== undefined
    const marks = child.marks.filter((mark) => mark.type !== codeType).sort(byRank)
    if (child.type === schema.nodes.hard_break) {
      segments.push({ text: '', marks: marks.filter((mark) => mark.type.name === 'link' || isTagMark(mark)), code: false, br: true })
      return
    }
    const text = child.text ?? ''
    const previous = segments[segments.length - 1]?.marks ?? []
    const nextChild = children[index + 1]
    const next = nextChild ? nextChild.marks : []
    if (code) {
      segments.push({ text, marks, code })
      return
    }
    // `** bold**` is not bold in CommonMark: move flanking whitespace outside the delimiters that end or start here.
    const keep = (neighbour: readonly Mark[]) => marks.filter((mark) => isTagMark(mark) || mark.isInSet(neighbour))
    const lead = /^\s*/.exec(text)![0]
    if (lead.length === text.length) {
      segments.push({ text, marks: keep(previous), code })
      return
    }
    const trail = /\s*$/.exec(text)![0]
    if (lead) segments.push({ text: lead, marks: keep(previous), code })
    segments.push({ text: text.slice(lead.length, text.length - trail.length), marks, code })
    if (trail) segments.push({ text: trail, marks: keep(next), code })
  })

  let out = ''
  let stack: readonly Mark[] = []
  for (const segment of segments) {
    let common = 0
    while (common < stack.length && common < segment.marks.length && stack[common].eq(segment.marks[common])) common++
    for (let i = stack.length - 1; i >= common; i--) out += closeMark(stack[i])
    for (let i = common; i < segment.marks.length; i++) out += openMark(segment.marks[i])
    stack = segment.marks
    out += segment.br ? '<br>' : segment.code ? codeSpan(segment.text) : escapeText(segment.text)
  }
  for (let i = stack.length - 1; i >= 0; i--) out += closeMark(stack[i])
  return out
}

/** A paragraph whose text reads as block syntax keeps it as text. */
function escapeBlockStart(body: string): string {
  if (/^\s*(#{1,6}(\s|$)|>|[-+*](\s|$)|`{3}|~{3}|([-_*])(\s*\4){2,}\s*$)/.test(body)) return body.replace(/^(\s*)/, '$1\\')
  if (/^\s*\d+[.)](\s|$)/.test(body)) return body.replace(/^(\s*\d+)([.)])/, '$1\\$2')
  return body
}

const isEmptyParagraph = (node: ProseNode) => node.type === schema.nodes.paragraph && node.content.size === 0

/** Serializes a page to Markdown. */
export function toMarkdown(doc: ProseNode): string {
  const blocks: ProseNode[] = []
  doc.forEach((block) => blocks.push(block))
  // Empty lines at the end of the page are where the caret rests, not content.
  while (blocks.length && isEmptyParagraph(blocks[blocks.length - 1])) blocks.pop()
  const numbers = listNumbers(doc)
  const columns: number[] = []
  let out = ''
  blocks.forEach((block, index) => {
    const previous = blocks[index - 1]
    if (previous) out += previous.type === schema.nodes.item && block.type === schema.nodes.item ? '\n' : '\n\n'
    switch (block.type.name) {
      case 'heading': {
        const body = serializeInline(block)
        out += '#'.repeat(block.attrs.level) + (body ? ' ' + body : '')
        break
      }
      case 'item': {
        const indent = block.attrs.indent as number
        if (previous?.type !== schema.nodes.item) columns.length = 0
        const lead = indent > 0 ? (columns[indent - 1] ?? indent * 2) : 0
        const marker = block.attrs.kind === 'ordered' ? `${numbers[index] || 1}.` : '-'
        columns[indent] = lead + marker.length + 1
        columns.length = indent + 1
        const box = block.attrs.kind === 'todo' ? (block.attrs.checked ? ' [x]' : ' [ ]') : ''
        const body = serializeInline(block)
        // `- 1. text` would read as a nested list: the item's own text never starts a block.
        const text = box ? body : escapeBlockStart(body)
        out += ' '.repeat(lead) + marker + box + (text ? ' ' + text : '')
        break
      }
      case 'quote': {
        const body = serializeInline(block)
        out += '>' + (body ? ' ' + body : '')
        break
      }
      case 'code_block': {
        const text = block.textContent
        const longest = Math.max(2, ...(text.match(/^\s*`+/gm) ?? []).map((run) => run.trim().length))
        const fence = '`'.repeat(longest + 1)
        out += `${fence}${block.attrs.language ?? ''}\n${text}${text ? '\n' : ''}${fence}`
        break
      }
      case 'divider':
        out += '---'
        break
      default: {
        const body = serializeInline(block)
        out += body ? escapeBlockStart(body) : '<br>'
      }
    }
  })
  return out
}

// ---- parsing ------------------------------------------------------------------------------------------------------

const DELIMITERS = [
  { token: '**', mark: () => schema.marks.bold.create(), word: false },
  { token: '__', mark: () => schema.marks.bold.create(), word: true },
  { token: '~~', mark: () => schema.marks.strike.create(), word: false },
  { token: '==', mark: () => schema.marks.background.create({ name: 'yellow' }), word: false },
  { token: '*', mark: () => schema.marks.italic.create(), word: false },
  { token: '_', mark: () => schema.marks.italic.create(), word: true },
]

const TAG = /^<(\/?)(u|ins|s|del|strike|b|strong|i|em|mark|span|code|br)((?:\s+[a-z-]+="[^"]*")*)\s*\/?>/i

function tagMark(name: string, attributes: string): Mark | null {
  const attr = (key: string) => new RegExp(`\\s${key}="([^"]*)"`).exec(attributes)?.[1]
  switch (name) {
    case 'u':
    case 'ins':
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
    case 'code':
      return schema.marks.code.create()
    case 'mark': {
      const color = attr('data-color') ?? 'yellow'
      return schema.marks.background.create({ name: isColor(color) ? color : 'yellow' })
    }
    default: {
      const color = attr('data-color')
      return isColor(color) ? schema.marks.color.create({ name: color }) : null
    }
  }
}

/** Whether `token` closes later in the line, after a non-space character. */
function closes(source: string, from: number, token: string, word: boolean): boolean {
  for (let i = from; i < source.length; i++) {
    if (source[i] === '\\') {
      i++
      continue
    }
    if (source.startsWith(token, i) && i > from && !/\s/.test(source[i - 1]) && !(word && /\w/.test(source[i + token.length] ?? ''))) return true
  }
  return false
}

/** `[text](href)` at `from`: the text, the address and the length of the whole link. */
function readLink(source: string, from: number): { text: string; href: string; length: number } | null {
  let depth = 0
  let i = from
  for (; i < source.length; i++) {
    const ch = source[i]
    if (ch === '\\') {
      i++
      continue
    }
    if (ch === '[') depth++
    else if (ch === ']' && --depth === 0) break
  }
  if (i >= source.length || source[i + 1] !== '(') return null
  const target = /^\(\s*(<[^>]*>|[^\s()]*(?:\([^\s()]*\)[^\s()]*)*)(?:\s+"[^"]*")?\s*\)/.exec(source.slice(i + 1))
  if (!target) return null
  const href = target[1].replace(/^<|>$/g, '')
  let decoded = href
  try {
    decoded = decodeURI(href)
  } catch {
    // A malformed escape keeps the address as written.
  }
  return { text: source.slice(from + 1, i), href: decoded, length: i + 1 + target[0].length - from }
}

function parseInline(source: string, base: readonly Mark[] = []): ProseNode[] {
  const nodes: ProseNode[] = []
  let marks: readonly Mark[] = base
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
    if (ch === '`') {
      const run = /^`+/.exec(source.slice(i))![0]
      // The closing run must be exactly as long: a longer one is not a match.
      let end = -1
      const runs = /`+/g
      runs.lastIndex = i + run.length
      for (let match = runs.exec(source); match; match = runs.exec(source)) {
        if (match[0].length === run.length) {
          end = match.index
          break
        }
      }
      if (end > i) {
        flush()
        let text = source.slice(i + run.length, end)
        if (/^ .* $/.test(text) && text.trim()) text = text.slice(1, -1)
        if (text) nodes.push(schema.text(text, schema.marks.code.create().addToSet(marks)))
        i = end + run.length
        continue
      }
      buffer += run
      i += run.length
      continue
    }
    if (ch === '[') {
      const link = readLink(source, i)
      const href = link && safeHref(link.href)
      if (link && href) {
        flush()
        nodes.push(...parseInline(link.text, schema.marks.link.create({ href }).addToSet(marks)))
        i += link.length
        continue
      }
    }
    for (const delimiter of DELIMITERS) {
      if (!source.startsWith(delimiter.token, i)) continue
      const mark = delimiter.mark()
      const open = marks.some((active) => active.type === mark.type && (mark.type.name !== 'background' || active.attrs.name === 'yellow'))
      const before = source[i - 1] ?? ''
      const after = source[i + delimiter.token.length] ?? ''
      if (open && !(delimiter.word && /\w/.test(after))) {
        flush()
        marks = marks.filter((active) => active.type !== mark.type)
      } else if (
        !open &&
        after &&
        !/\s/.test(after) &&
        !(delimiter.word && /\w/.test(before)) &&
        closes(source, i + delimiter.token.length, delimiter.token, delimiter.word)
      ) {
        flush()
        marks = mark.addToSet(marks)
      } else {
        break
      }
      i += delimiter.token.length
      continue scan
    }
    if (ch === '<') {
      const auto = /^<((?:https?:\/\/|mailto:)[^\s<>]+)>/.exec(source.slice(i))
      if (auto) {
        flush()
        nodes.push(schema.text(auto[1], schema.marks.link.create({ href: auto[1] }).addToSet(marks)))
        i += auto[0].length
        continue
      }
      const tag = TAG.exec(source.slice(i))
      if (tag) {
        const [whole, closing, rawName, attributes] = tag
        const name = rawName.toLowerCase()
        if (name === 'br') {
          flush()
          nodes.push(schema.nodes.hard_break.create(null, null, marks))
          i += whole.length
          continue
        }
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

const FENCE = /^( {0,3})(`{3,}|~{3,})[ \t]*([^`\s]*)[^`]*$/
const HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/
const DIVIDER = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/
const QUOTE = /^ {0,3}>[ \t]?(.*)$/
const LIST = /^([ \t]*)([-*+]|\d{1,9}[.)])(?:[ \t]+(.*))?$/
const TODO = /^\[([ xX])\](?:[ \t]+(.*)|$)/

const width = (spaces: string) => spaces.replace(/\t/g, '    ').length

/** Parses Markdown into a page. */
export function fromMarkdown(markdown: string): ProseNode {
  const lines = (markdown ?? '').replace(/\r\n?/g, '\n').split('\n')
  const blocks: ProseNode[] = []
  /** Leading widths of the open list levels. */
  let levels: number[] = []
  let blank = false
  const last = () => blocks[blocks.length - 1]
  /** Appends a line break and `text` to the block just written. */
  const continueLast = (text: string) => {
    const block = last()
    blocks[blocks.length - 1] = block.copy(block.content.append(Fragment.fromArray([schema.nodes.hard_break.create(), ...parseInline(text)])))
  }

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    if (!line.trim()) {
      blank = true
      continue
    }
    const wasBlank = blank
    blank = false

    const fence = FENCE.exec(line)
    if (fence) {
      const [, indent, marker, language] = fence
      const body: string[] = []
      for (index++; index < lines.length; index++) {
        const close = new RegExp(`^ {0,3}${marker[0] === '`' ? '`' : '~'}{${marker.length},}[ \\t]*$`)
        if (close.test(lines[index])) break
        body.push(lines[index].replace(new RegExp(`^ {0,${indent.length}}`), ''))
      }
      const text = body.join('\n')
      blocks.push(schema.nodes.code_block.create({ language: language.toLowerCase() }, text ? schema.text(text) : null))
      levels = []
      continue
    }
    if (DIVIDER.test(line)) {
      blocks.push(schema.nodes.divider.create())
      levels = []
      continue
    }
    const heading = HEADING.exec(line)
    if (heading) {
      blocks.push(schema.nodes.heading.create({ level: Math.min(3, heading[1].length) }, parseInline(heading[2] ?? '')))
      levels = []
      continue
    }
    const quote = QUOTE.exec(line)
    if (quote) {
      const text = quote[1]
      const inQuote = !wasBlank && last()?.type === schema.nodes.quote
      // A bare `>` line inside a quote separates two quotes.
      if (inQuote && !text.trim()) blank = true
      else if (inQuote && last().content.size > 0) continueLast(text)
      else blocks.push(schema.nodes.quote.create(null, parseInline(text)))
      levels = []
      continue
    }
    const list = LIST.exec(line)
    if (list) {
      const [, spaces, marker, rest = ''] = list
      const lead = width(spaces)
      if (last()?.type !== schema.nodes.item) levels = []
      while (levels.length && levels[levels.length - 1] > lead) levels.pop()
      if (!levels.length || levels[levels.length - 1] < lead) levels.push(lead)
      const indent = Math.min(levels.length - 1, MAX_INDENT)
      const todo = TODO.exec(rest)
      const kind = todo ? 'todo' : /\d/.test(marker) ? 'ordered' : 'bullet'
      const text = todo ? (todo[2] ?? '') : rest
      blocks.push(schema.nodes.item.create({ kind, indent, checked: todo ? todo[1] !== ' ' : false }, parseInline(text)))
      continue
    }
    if (/^\s*<br\s*\/?>\s*$/i.test(line)) {
      blocks.push(schema.nodes.paragraph.create())
      levels = []
      continue
    }
    // An indented line right under a list item continues that item.
    if (!wasBlank && last()?.type === schema.nodes.item && /^\s{2,}/.test(line)) {
      continueLast(line.trim())
      continue
    }
    blocks.push(schema.nodes.paragraph.create(null, parseInline(line.replace(/^ {0,3}/, ''))))
    levels = []
  }
  if (!blocks.length) blocks.push(schema.nodes.paragraph.create())
  return schema.nodes.doc.create(null, blocks)
}
