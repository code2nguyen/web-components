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
