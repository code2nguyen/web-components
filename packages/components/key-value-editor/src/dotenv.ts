/** One row of a {@link KeyValueEditor}: a variable name and its value. */
export interface KeyValueEntry {
  key: string
  value: string
  /** Masks this row's value whatever the editor's `masked` attribute says; `false` shows it in a masked editor. */
  masked?: boolean
  /** Fixes this row's key: it shows as text, and the row cannot be removed. The value stays editable. */
  lockKey?: boolean
}

/** A variable name as `.env` files write it: a letter or underscore, then letters, digits, `_`, `.` or `-`. */
const ASSIGNMENT = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_.-]*)[ \t]*=[ \t]*/

const ESCAPES: Record<string, string> = { n: '\n', r: '\r', t: '\t' }

/** Index of the quote closing a value opened at `start - 1`, skipping backslash escapes inside double quotes. */
function closingQuote(text: string, start: number, quote: string): number {
  for (let index = start; index < text.length; index++) {
    const char = text[index]
    if (char === '\\' && quote === '"') index++
    else if (char === quote) return index
  }
  return -1
}

/**
 * Parses `.env` text into entries. Blank lines and `#` comments are skipped, an `export ` prefix is dropped, an
 * unquoted value ends at a ` #` comment, and a single-, double- or backtick-quoted value may span lines (double quotes
 * also read `\n`, `\r`, `\t`, `\"` and `\\`). A key that appears twice keeps its last value.
 *
 * Returns `null` when the text is not `.env` shaped, i.e. a line that is neither blank, a comment nor `KEY=value`,
 * so pasting an ordinary multi-line value is never mistaken for a file.
 */
export function parseEnv(text: string): KeyValueEntry[] | null {
  const source = text.replace(/\r\n?/g, '\n')
  const entries = new Map<string, string>()
  let index = 0
  while (index < source.length) {
    const newline = source.indexOf('\n', index)
    const lineEnd = newline === -1 ? source.length : newline
    const line = source.slice(index, lineEnd)
    const trimmed = line.trimStart()
    if (trimmed === '' || trimmed.startsWith('#')) {
      index = lineEnd + 1
      continue
    }
    const match = ASSIGNMENT.exec(trimmed)
    if (!match) return null
    const key = match[1]
    const valueStart = index + (line.length - trimmed.length) + match[0].length
    const quote = source[valueStart]
    if (quote === '"' || quote === "'" || quote === '`') {
      const close = closingQuote(source, valueStart + 1, quote)
      if (close === -1) return null
      let value = source.slice(valueStart + 1, close)
      if (quote === '"') value = value.replace(/\\([nrt"\\])/g, (_, char: string) => ESCAPES[char] ?? char)
      const restNewline = source.indexOf('\n', close)
      const restEnd = restNewline === -1 ? source.length : restNewline
      const rest = source.slice(close + 1, restEnd).trim()
      if (rest !== '' && !rest.startsWith('#')) return null
      entries.delete(key)
      entries.set(key, value)
      index = restEnd + 1
    } else {
      let value = source.slice(valueStart, lineEnd)
      const comment = value.search(/\s#/)
      if (comment !== -1) value = value.slice(0, comment)
      entries.delete(key)
      entries.set(key, value.trim())
      index = lineEnd + 1
    }
  }
  return [...entries].map(([key, value]) => ({ key, value }))
}

/**
 * Writes entries as `.env` text, one `KEY=value` line each. Rows without a key are left out; a value with
 * whitespace, a quote, `#` or a backslash is double-quoted with `\n`, `\r`, `"` and `\` escaped, so
 * {@link parseEnv} reads it back unchanged.
 */
export function formatEnv(entries: readonly KeyValueEntry[]): string {
  return entries
    .filter((entry) => entry.key.trim() !== '')
    .map(({ key, value }) => {
      if (!/[\s#"'`\\]/.test(value)) return `${key.trim()}=${value}`
      const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r')
      return `${key.trim()}="${escaped}"`
    })
    .join('\n')
}
