import { PENDING_URL } from './safe-url'

/** Info string marking a fence the healer closed itself: rendered as plain code, never highlighted or drawn. */
export const PENDING_INFO = 'c2-pending'
/** Language of a pending fence that holds an unfinished display formula. */
export const PENDING_MATH = 'c2-pending-math'

const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/

/** Splits off an unclosed code fence: returns the text before it and the fence's lines, or `null` when all are closed. */
function openFence(lines: string[]): { at: number; marker: string; info: string } | null {
  let open: { at: number; marker: string; info: string } | null = null
  lines.forEach((line, at) => {
    const match = FENCE.exec(line)
    if (!match) return
    if (!open) open = { at, marker: match[1], info: match[2].trim() }
    else if (match[1][0] === open.marker[0] && match[1].length >= open.marker.length && !match[2].trim()) open = null
  })
  return open
}

/** Lines that are only a block marker (`#`, `-`, `>`, `1.`), which would flash as a heading or bullet before text. */
const LONE_MARKER = /^\s{0,3}(?:#{1,6}|[-*+]|>|\d{1,9}[.)])\s*$/

/** Inline markers closed at the end of an unfinished line, innermost first. */
const MARKERS = ['`', '**', '~~', '*', '_'] as const
type Marker = (typeof MARKERS)[number]

function closeInline(text: string): string {
  const stack: Marker[] = []
  // An opener with nothing after it yet (`Second has **`) is dropped while it streams rather than shown raw.
  let cut = -1
  let index = 0
  while (index < text.length) {
    const char = text[index]
    if (char === '\\') {
      index += 2
      continue
    }
    const inCode = stack[stack.length - 1] === '`'
    if (char === '`') {
      const run = /^`+/.exec(text.slice(index))![0]
      if (inCode) stack.pop()
      else if (run.length === 1 && !text.slice(index + 1).trim()) cut = index
      else if (run.length === 1) stack.push('`')
      index += run.length
      continue
    }
    if (inCode) {
      index++
      continue
    }
    const marker = MARKERS.find((candidate) => candidate !== '`' && text.startsWith(candidate, index))
    if (!marker) {
      index++
      continue
    }
    const before = text[index - 1] ?? ' '
    const rest = text.slice(index + marker.length)
    const after = rest[0] ?? ' '
    // `_` inside a word (snake_case) and a `*` surrounded by spaces (a bullet, a product) are not emphasis.
    const intraword = marker === '_' && /\w/.test(before) && /\w/.test(after)
    const spaced = /\s/.test(before) && /\s/.test(after)
    if (stack[stack.length - 1] === marker && !/\s/.test(before)) stack.pop()
    else if (!rest.trim() && !intraword) cut = index
    else if (!intraword && !spaced && !/\s/.test(after)) stack.push(marker)
    index += marker.length
  }
  if (cut !== -1) text = text.slice(0, cut)
  if (stack.length === 0) return text
  // A closer after whitespace is not right-flanking and would not close; drop the trailing space while it streams.
  return text.trimEnd() + stack.reverse().join('')
}

/** Drops an image whose syntax has not finished: a half-written URL must never be requested. */
function dropOpenImage(text: string): string {
  const start = text.lastIndexOf('![')
  if (start === -1) return text
  const tail = text.slice(start)
  if (/^!\[[^\]]*\]\([^)\s]*(?:\s+"[^"]*")?\)/.test(tail) || /^!\[[^\]]*\]\[[^\]]*\]/.test(tail)) return text
  return text.slice(0, start)
}

/** Shows an unfinished link as its label with a placeholder URL, which the renderer draws as pending text. */
function holdOpenLink(text: string): string {
  const start = text.lastIndexOf('[')
  if (start === -1 || text[start - 1] === '!' || text[start - 1] === '\\') return text
  const tail = text.slice(start)
  const label = /^\[([^\]]*)\]\(([^)\s]*)$/.exec(tail) ?? /^\[([^\]]*)\]\([^)\s]*\s+"[^"]*$/.exec(tail)
  if (label) return `${text.slice(0, start)}[${label[1]}](${PENDING_URL})`
  // `[label` still being typed: show the label without the bracket until it closes.
  if (/^\[[^\]\n]*$/.test(tail)) return text.slice(0, start) + tail.slice(1)
  return text
}

/** Closes an unfinished `$$` or `\[` display formula as a pending fence, so its TeX shows as code until it closes. */
function holdOpenMath(lines: string[]): string[] | null {
  let openAt = -1
  let closer = ''
  lines.forEach((line, at) => {
    const trimmed = line.trim()
    if (openAt === -1) {
      if (trimmed.startsWith('$$') && !(trimmed.length > 2 && trimmed.endsWith('$$'))) [openAt, closer] = [at, '$$']
      else if (trimmed.startsWith('\\[') && !trimmed.endsWith('\\]')) [openAt, closer] = [at, '\\]']
    } else if (trimmed.endsWith(closer)) openAt = -1
  })
  if (openAt === -1) return null
  const tex = [lines[openAt].trim().slice(2), ...lines.slice(openAt + 1)].join('\n')
  return [...lines.slice(0, openAt), '```' + PENDING_MATH, tex, '```']
}

/**
 * Repairs the last, still-growing block of a streamed document so it renders sensibly before it is complete: an open
 * code fence (or display formula) is closed as a pending fence, inline markers are closed so `**bold` shows bold
 * instead of asterisks, an unfinished link shows its label without a URL, an unfinished image is dropped, and a line
 * holding only a block marker is held back. Only ever applied to the tail while streaming.
 */
export function heal(tail: string): string {
  let lines = tail.replace(/\s+$/, '').split('\n')
  const fence = openFence(lines)
  if (fence) {
    const info = fence.info ? `${fence.info} ${PENDING_INFO}` : PENDING_INFO
    lines[fence.at] = lines[fence.at].replace(FENCE, (_, marker: string) => `${marker}${info}`)
    return [...lines, fence.marker].join('\n')
  }
  const math = holdOpenMath(lines)
  if (math) return math.join('\n')
  while (lines.length > 0 && (LONE_MARKER.test(lines[lines.length - 1]) || !lines[lines.length - 1].trim())) lines = lines.slice(0, -1)
  if (lines.length === 0) return ''
  const last = lines.length - 1
  lines[last] = closeInline(holdOpenLink(dropOpenImage(lines[last])))
  return lines.join('\n')
}
