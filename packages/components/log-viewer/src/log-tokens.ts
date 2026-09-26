import type { TextLayout } from './log-position.js'

export type LogTokenKind = 'error' | 'warning' | 'info' | 'muted' | 'value'
export interface LogToken {
  text: string
  kind?: LogTokenKind
}

// Match only recognizable log values; ordinary prose retains the default foreground.
// Quotes and URLs take precedence so severity words inside a value do not become alerts.
const pattern =
  /"(?:[^"\\\r\n]|\\[^\r\n])*"|'(?:[^'\\\r\n]|\\[^\r\n])*'|\b(?:https?|wss?):\/\/[^\s<>"']+|\b\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?\b|\b\d{2}:\d{2}:\d{2}(?:[.,]\d+)?\b|\b(?:ERROR|FATAL|WARN|WARNING|INFO|DEBUG|TRACE)\b|\b[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}\b|\b[a-z][a-z\d]*(?:[-_][a-z\d]+)*[-_][a-z\d]*\d[a-z\d]*\b|\b(?:0x[\da-f]+|\d+(?:\.\d+)?(?:ms|s|MB|GB|%)?)\b/gi

/** Plain text segments, never HTML. Work is limited to the text passed by the virtual renderer. */
export function logTokens(text: string): LogToken[] {
  const tokens: LogToken[] = []
  let end = 0
  for (const match of text.matchAll(pattern)) {
    if (match.index > end) tokens.push({ text: text.slice(end, match.index) })
    const value = match[0]
    const severity = value.toUpperCase()
    let kind: LogTokenKind = 'value'
    if (severity === 'ERROR' || severity === 'FATAL') kind = 'error'
    else if (severity === 'WARN' || severity === 'WARNING') kind = 'warning'
    else if (severity === 'INFO') kind = 'info'
    else if (severity === 'DEBUG' || severity === 'TRACE' || /^\d{4}-\d{2}-\d{2}|^\d{2}:\d{2}:\d{2}/.test(value)) kind = 'muted'
    tokens.push({ text: value, kind })
    end = match.index + value.length
  }
  if (end < text.length) tokens.push({ text: text.slice(end) })
  return tokens
}

interface TokenRange extends LogToken {
  start: number
  end: number
}

/** Lazily classify logical lines touched by the virtual window, then project colors onto visual fragments. */
export class LogTokenLines {
  private readonly ranges = new Map<number, TokenRange[]>()

  constructor(private readonly layout: TextLayout) {}

  slice(first = 0, last = this.layout.lines.length): LogToken[] {
    const result: LogToken[] = []
    for (let line = first; line < last; line++) {
      if (line > first) result.push({ text: '\n' })
      const source = this.layout.sources[line]
      let ranges = this.ranges.get(source)
      if (!ranges) {
        let offset = 0
        ranges = logTokens(this.layout.logicalLines[source]).map((token) => {
          const start = offset
          offset += token.text.length
          return { ...token, start, end: offset }
        })
        this.ranges.set(source, ranges)
      }
      const start = this.layout.starts[line]
      const end = start + this.layout.lines[line].length
      // Binary lookup avoids walking every earlier token for a slice deep inside a huge logical line.
      let low = 0
      let high = ranges.length
      while (low < high) {
        const mid = (low + high) >>> 1
        if (ranges[mid].end <= start) low = mid + 1
        else high = mid
      }
      for (let index = low; index < ranges.length && ranges[index].start < end; index++) {
        const token = ranges[index]
        result.push({ text: token.text.slice(Math.max(start - token.start, 0), Math.min(end - token.start, token.text.length)), kind: token.kind })
      }
    }
    return result
  }
}
