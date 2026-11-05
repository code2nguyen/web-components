/** One run of text with the ANSI style in effect for it. */
export interface TerminalSpan {
  text: string
  /** One of the eight ANSI colour names, when a colour code is in effect. */
  color?: TerminalColor
  bold?: boolean
}

export type TerminalColor = 'black' | 'red' | 'green' | 'yellow' | 'blue' | 'magenta' | 'cyan' | 'white'

const COLORS: TerminalColor[] = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white']

// CSI sequences (`ESC [ … final`), OSC sequences (`ESC ] … BEL` or `ESC ] … ESC \`) and any other two-byte escape.
// eslint-disable-next-line no-control-regex
const ESCAPE = /\u001b(?:\[([0-9;?]*)([@-~])|\][^\u0007\u001b]*(?:\u0007|\u001b\\)?|[@-Z\\-_])/g
// Control characters other than tab and newline: a carriage return, a bell, a backspace.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f]/g

/**
 * Splits CLI output into lines of styled spans. Only the SGR colour and bold codes are kept (30–37, 90–97, 39, 1, 22
 * and 0); every other escape and control character is dropped. The result is plain text: it is drawn as text nodes,
 * never parsed as HTML.
 */
export function parseAnsi(input: string): TerminalSpan[][] {
  const lines: TerminalSpan[][] = [[]]
  let color: TerminalColor | undefined
  let bold = false
  const push = (text: string) => {
    const clean = text.replace(/\r\n?/g, '\n')
    clean.split('\n').forEach((part, index) => {
      if (index > 0) lines.push([])
      const visible = part.replace(CONTROL, '')
      if (!visible) return
      const line = lines[lines.length - 1]
      const last = line[line.length - 1]
      if (last && last.color === color && !!last.bold === bold) last.text += visible
      else line.push({ text: visible, ...(color ? { color } : {}), ...(bold ? { bold } : {}) })
    })
  }
  let index = 0
  for (const match of input.matchAll(ESCAPE)) {
    push(input.slice(index, match.index))
    index = (match.index ?? 0) + match[0].length
    if (match[2] !== 'm') continue
    const codes = (match[1] ?? '').split(';').map((code) => (code === '' ? 0 : Number(code)))
    for (const code of codes) {
      if (code === 0) {
        color = undefined
        bold = false
      } else if (code === 1) bold = true
      else if (code === 22) bold = false
      else if (code === 39) color = undefined
      else if (code >= 30 && code <= 37) color = COLORS[code - 30]
      else if (code >= 90 && code <= 97) color = COLORS[code - 90]
    }
  }
  push(input.slice(index))
  return lines
}

/**
 * Splits a command line into words the way a shell does: spaces separate words, single and double quotes keep spaces
 * inside a word, and a backslash escapes the next character (outside single quotes).
 */
export function parseArgs(line: string): string[] {
  const words: string[] = []
  let word = ''
  let started = false
  let quote: '"' | "'" | null = null
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    if (quote) {
      if (char === quote) quote = null
      else if (char === '\\' && quote === '"' && i + 1 < line.length) word += line[++i]
      else word += char
    } else if (char === '"' || char === "'") {
      quote = char
      started = true
    } else if (char === '\\' && i + 1 < line.length) {
      word += line[++i]
      started = true
    } else if (/\s/.test(char)) {
      if (started) words.push(word)
      word = ''
      started = false
    } else {
      word += char
      started = true
    }
  }
  if (started) words.push(word)
  return words
}

/** The longest text every string in the list starts with. */
export function commonPrefix(values: readonly string[]): string {
  if (!values.length) return ''
  let prefix = values[0]
  for (const value of values.slice(1)) {
    while (!value.startsWith(prefix)) prefix = prefix.slice(0, -1)
  }
  return prefix
}
