/** How a target field's values are checked. `text` (the default) accepts anything. */
export type ImportFieldType = 'text' | 'number' | 'integer' | 'date' | 'email' | 'url' | 'boolean'

/** A field the import writes: what a source column can be mapped to. */
export interface ImportField {
  /** The key the mapped value is stored under in each record. */
  key: string
  /** The field's name as the user reads it. Defaults to `key`. */
  label?: string
  /** One line under the label in the field picker. */
  description?: string
  /** The import cannot go ahead until a column is mapped to it, and an empty cell is an error. */
  required?: boolean
  /** Checks each value. Defaults to `text`, which accepts anything. */
  type?: ImportFieldType
  /** Other header names this field is matched from (`["e-mail", "mail"]`), besides its key and label. */
  aliases?: string[]
  /** The only values accepted, compared without case. */
  options?: string[]
  /** A regular expression (source, without slashes) the whole value must match. */
  pattern?: string
  /**
   * A check of the app's own, run after the built-in ones on a non-empty value: return the message to show, or
   * nothing when the value is valid. `record` holds the row's other mapped values. Property only.
   */
  validate?: (value: string, record: Record<string, string>) => string | null | undefined | void
}

/** One entry per source column: the key of the field it is imported as, or `null` when it is not imported. */
export type ImportMapping = (string | null)[]

/** Why a built-in check rejected a value. `custom` carries the message an app's `validate` returned. */
export type ImportIssue =
  | { kind: 'required' | 'number' | 'integer' | 'date' | 'email' | 'url' | 'boolean' | 'pattern' }
  | { kind: 'options'; options: string[] }
  | { kind: 'custom'; message: string }

/** A cell the preview marks as invalid. */
export interface ImportCellError {
  /** Index of the data row (0 is the first row under the header). */
  row: number
  /** Index of the source column. */
  column: number
  /** Key of the field the column is mapped to. */
  field: string
  /** The cell's text. */
  value: string
  /** The message shown under the cell, in the element's language. */
  message: string
}

/** A row as a source gives it: an array of cells, or a record keyed by column header. */
export type ImportSourceRow = readonly unknown[] | Readonly<Record<string, unknown>>

/** The text of a cell. Dates become `YYYY-MM-DD`; `null` and `undefined` become empty. */
export function cellText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : value.toISOString().slice(0, 10)
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

/** A source row as one string per column. */
export function rowCells(row: ImportSourceRow | null | undefined, columns: readonly string[]): string[] {
  if (!row) return columns.map(() => '')
  if (Array.isArray(row)) return columns.length ? columns.map((_, i) => cellText(row[i])) : row.map(cellText)
  const record = row as Readonly<Record<string, unknown>>
  return columns.map((column) => cellText(record[column]))
}

const DELIMITERS = [',', ';', '\t', '|']

/** The delimiter that splits the first line into the most fields, ignoring quoted text. Comma on a tie. */
export function detectDelimiter(text: string): string {
  let best = ','
  let bestCount = 0
  for (const delimiter of DELIMITERS) {
    let count = 0
    let quoted = false
    for (let i = 0; i < text.length; i++) {
      const char = text[i]
      if (char === '"') quoted = !quoted
      else if (!quoted && (char === '\n' || char === '\r')) break
      else if (!quoted && char === delimiter) count++
    }
    if (count > bestCount) {
      best = delimiter
      bestCount = count
    }
  }
  return best
}

/**
 * Splits delimited text into rows of cells, as RFC 4180 reads it: a quoted cell may hold the delimiter, line breaks
 * and doubled quotes. The delimiter is detected from the first line unless given. A byte-order mark and a final line
 * break are dropped, and so are lines that are entirely empty.
 */
export function parseCsv(text: string, delimiter = detectDelimiter(text)): string[][] {
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  const endRow = () => {
    row.push(cell)
    if (row.length > 1 || row[0] !== '') rows.push(row)
    row = []
    cell = ''
  }
  for (let i = 0; i < source.length; i++) {
    const char = source[i]
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          cell += '"'
          i++
        } else quoted = false
      } else cell += char
    } else if (char === '"' && cell === '') quoted = true
    else if (char === delimiter) {
      row.push(cell)
      cell = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[i + 1] === '\n') i++
      endRow()
    } else cell += char
  }
  if (cell !== '' || row.length) endRow()
  return rows
}

/** Lower case, accents dropped, every run of other characters a single space. */
export function normalizeHeader(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/** How well a header names a field, from 0 (not at all) to 100 (the same words), the best of its key, label and aliases. */
export function matchScore(header: string, field: ImportField): number {
  const target = normalizeHeader(header)
  if (!target) return 0
  const compactTarget = target.replace(/ /g, '')
  const words = new Set(target.split(' '))
  let best = 0
  for (const name of [field.key, field.label ?? '', ...(field.aliases ?? [])]) {
    const candidate = normalizeHeader(name)
    if (!candidate) continue
    const compact = candidate.replace(/ /g, '')
    let score: number
    if (compact === compactTarget) score = 100
    else {
      const candidateWords = candidate.split(' ')
      const shared = candidateWords.filter((word) => words.has(word)).length
      const union = new Set([...words, ...candidateWords]).size
      score = Math.round((shared / union) * 80)
      if (candidateWords.every((word) => words.has(word))) {
        // Every word of the name is in the header ("Full name" for name): the more of the header it covers, the better.
        score = Math.max(score, Math.round(55 + (compact.length / compactTarget.length) * 35))
      } else {
        // One run of letters starts or ends the other ("Phone" and "Phone number"); too short a run matches by chance.
        const [shorter, longer] = compact.length < compactTarget.length ? [compact, compactTarget] : [compactTarget, compact]
        if (shorter.length >= 4 && (longer.startsWith(shorter) || longer.endsWith(shorter))) {
          score = Math.max(score, Math.round(50 + (shorter.length / longer.length) * 30))
        }
      }
    }
    best = Math.max(best, score)
  }
  return best
}

/** Scores a header against a field, from 0 to 100. Replaces the built-in matching. */
export type ImportMatcher = (header: string, field: ImportField) => number

/** The score under which a header is not matched to a field. */
export const MATCH_THRESHOLD = 50

/**
 * Matches each column without a field to the free field whose name it best resembles, best pairs first, so a field is
 * never taken twice. Entries already set in `mapping` are kept.
 */
export function autoMatch(
  columns: readonly string[],
  fields: readonly ImportField[],
  mapping: ImportMapping = [],
  matcher: ImportMatcher = matchScore,
): ImportMapping {
  const result: ImportMapping = columns.map((_, i) => mapping[i] ?? null)
  const taken = new Set(result.filter((key): key is string => key !== null))
  const pairs: { column: number; field: string; score: number }[] = []
  columns.forEach((header, column) => {
    if (result[column] !== null) return
    for (const field of fields) {
      if (taken.has(field.key)) continue
      const score = matcher(header, field)
      if (score >= MATCH_THRESHOLD) pairs.push({ column, field: field.key, score })
    }
  })
  pairs.sort((a, b) => b.score - a.score || a.column - b.column)
  for (const pair of pairs) {
    if (result[pair.column] !== null || taken.has(pair.field)) continue
    result[pair.column] = pair.field
    taken.add(pair.field)
  }
  return result
}

/** The required fields no column is mapped to. */
export function missingFields(fields: readonly ImportField[], mapping: ImportMapping): ImportField[] {
  const mapped = new Set(mapping)
  return fields.filter((field) => field.required && !mapped.has(field.key))
}

const GROUPED = String.raw`\d{1,3}(?:[,. '\u00a0\u202f]\d{3})+`
const NUMBER = new RegExp(String.raw`^[-+]?(?:(?:${GROUPED}|\d+)(?:[.,]\d+)?|[.,]\d+)(?:e[-+]?\d+)?$`, 'i')
const INTEGER = new RegExp(String.raw`^[-+]?(?:${GROUPED}|\d+)$`)
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const BOOLEAN = /^(?:true|false|yes|no|y|n|1|0|on|off)$/i
const ISO_DATE = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](?:[01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/
const DAY_FIRST_OR_MONTH_FIRST = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/

function isDate(value: string): boolean {
  const iso = ISO_DATE.exec(value)
  if (iso) return validDay(+iso[1], +iso[2], +iso[3])
  const local = DAY_FIRST_OR_MONTH_FIRST.exec(value)
  if (!local) return false
  const year = local[3].length === 2 ? 2000 + +local[3] : +local[3]
  // Either order may be meant: accept the value when one of them is a real day.
  return validDay(year, +local[2], +local[1]) || validDay(year, +local[1], +local[2])
}

function validDay(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) return false
  return day <= new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function isUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

const patterns = new Map<string, RegExp | null>()
function compiled(pattern: string): RegExp | null {
  if (!patterns.has(pattern)) {
    try {
      patterns.set(pattern, new RegExp(`^(?:${pattern})$`, 'u'))
    } catch {
      patterns.set(pattern, null)
    }
  }
  return patterns.get(pattern) ?? null
}

/** Checks one value against its field: `null` when it is valid, else why not. */
export function checkValue(field: ImportField, raw: string, record: Record<string, string> = {}): ImportIssue | null {
  const value = raw.trim()
  if (!value) return field.required ? { kind: 'required' } : null
  switch (field.type) {
    case 'number':
      if (!NUMBER.test(value)) return { kind: 'number' }
      break
    case 'integer':
      if (!INTEGER.test(value)) return { kind: 'integer' }
      break
    case 'date':
      if (!isDate(value)) return { kind: 'date' }
      break
    case 'email':
      if (!EMAIL.test(value)) return { kind: 'email' }
      break
    case 'url':
      if (!isUrl(value)) return { kind: 'url' }
      break
    case 'boolean':
      if (!BOOLEAN.test(value)) return { kind: 'boolean' }
      break
  }
  if (field.options?.length && !field.options.some((option) => option.toLowerCase() === value.toLowerCase())) {
    return { kind: 'options', options: field.options }
  }
  if (field.pattern) {
    const pattern = compiled(field.pattern)
    if (pattern && !pattern.test(value)) return { kind: 'pattern' }
  }
  const message = field.validate?.(value, record)
  return message ? { kind: 'custom', message } : null
}

/** A row's mapped values, keyed by field. */
export function toRecord(cells: readonly string[], mapping: ImportMapping): Record<string, string> {
  const record: Record<string, string> = {}
  mapping.forEach((key, column) => {
    if (key !== null) record[key] = cells[column] ?? ''
  })
  return record
}
