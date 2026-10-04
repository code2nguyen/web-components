/**
 * Message pattern mining.
 *
 * Most log files are a handful of message *kinds* printed thousands of times with different values. Reading the
 * kinds instead of the lines is the fastest way to understand a file, so every record is reduced to a template:
 * variable-looking parts (ids, numbers, durations, IPs, quoted strings…) become `<*>`, and templates that only
 * differ in a few positions are merged, in the spirit of the Drain algorithm. Each pattern remembers the values
 * its wildcards took, so "what varies inside this message" is one click away.
 */
import type { LogRecord, SeverityBand } from './otlp.ts'

export const WILDCARD = '<*>'

export interface SlotStats {
  /** Human label: the `key` of a `key=value` token, or the word before the wildcard. */
  label: string
  position: number
  distinct: number
  /** Most frequent values, descending. */
  top: Array<{ value: string; count: number }>
  /** Min/max/avg when every value is numeric (durations, sizes, counts). */
  numeric?: { min: number; max: number; avg: number; unit: string }
}

export interface Pattern {
  id: string
  template: string
  tokens: string[]
  count: number
  severities: Partial<Record<SeverityBand, number>>
  /** Most severe band seen for this pattern. */
  severity: SeverityBand
  services: string[]
  first: number
  last: number
  /** Record indices in time order. */
  records: number[]
  slots: SlotStats[]
}

const MASKS: RegExp[] = [
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, // uuid
  /\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?\b/g, // timestamp
  /\b(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?\b/g, // ipv4[:port]
  /https?:\/\/[^\s"']+/g, // url
  /\b[\w.+-]+@[\w-]+\.[\w.]+\b/g, // email
  /"[^"]*"|'[^']*'/g, // quoted
  /\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{8,}\b/gi, // hex id with letters and digits
  /\b[A-Z]{2,}[-_]\d+\b/g, // ORD-10428, INC_42
  /(?<![\w.])-?\d+(?:\.\d+)*(?:ms|us|µs|ns|s|m|h|kb|mb|gb|b|%)?(?![\w])/gi, // number, version or number + unit
]

const RATIO_TO_MERGE = 0.6

interface Draft {
  severity: SeverityBand
  tokens: string[]
  records: number[]
}

function maskToken(token: string): string {
  let masked = token
  for (const mask of MASKS) masked = masked.replace(mask, WILDCARD)
  // Path segments that are ids: /orders/<*>
  masked = masked.replace(/\/[A-Za-z0-9_-]*\d[A-Za-z0-9_-]*(?=\/|$)/g, `/${WILDCARD}`)
  return masked
}

export function tokenize(body: string): string[] {
  const firstLine = body.split('\n', 1)[0]
  // Quoted strings with spaces stay one token, including key="quoted value".
  return firstLine.match(/(?:[^\s"']*(?:"[^"]*"|'[^']*'))+[^\s"']*|\S+/g) ?? []
}

export function maskMessage(body: string): string[] {
  return tokenize(body).map(maskToken)
}

function similarity(a: string[], b: string[]): number {
  let same = 0
  for (let i = 0; i < a.length; i++) if (a[i] === b[i]) same++
  return same / a.length
}

const KEY_PREFIX = /^[\w.-]+[=:]/

function merge(a: string[], b: string[]): string[] {
  return a.map((token, i) => {
    if (token === b[i]) return token
    // reason=upstream_timeout vs reason=circuit_open → reason=<*>, keeping the key readable.
    const prefix = KEY_PREFIX.exec(token)?.[0]
    return prefix && b[i].startsWith(prefix) ? `${prefix}${WILDCARD}` : WILDCARD
  })
}

const SEVERITY_RANK: Record<SeverityBand, number> = { unset: 0, trace: 1, debug: 2, info: 3, warn: 4, error: 5, fatal: 6 }

export function worstSeverity(a: SeverityBand, b: SeverityBand): SeverityBand {
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b
}

export function severityRank(band: SeverityBand): number {
  return SEVERITY_RANK[band]
}

function slotLabel(template: string[], position: number): string {
  const token = template[position]
  const keyed = /^([\w.-]+)[=:]/.exec(token)
  if (keyed) return keyed[1]
  // "/products/<*>" names itself; "<*>:" does not.
  if (/[A-Za-z]/.test(token.replace(WILDCARD, ''))) return token.slice(0, 32)
  const previous = template[position - 1]
  if (previous && !previous.includes(WILDCARD)) return previous.replace(/[=:,]+$/, '').slice(0, 24)
  return `value ${position + 1}`
}

function valueOf(original: string, templateToken: string): string {
  // "latency=120ms" against "latency=<*>" → "120ms"
  const index = templateToken.indexOf(WILDCARD)
  if (index <= 0) return original.replace(/^["']|["',]$/g, '')
  const prefix = templateToken.slice(0, index)
  return original.startsWith(prefix) ? original.slice(prefix.length).replace(/[",]$/, '') : original
}

function numericStats(values: Map<string, number>): SlotStats['numeric'] {
  let min = Infinity
  let max = -Infinity
  let sum = 0
  let n = 0
  let unit = ''
  for (const [value, count] of values) {
    const match = /^(-?\d+(?:\.\d+)?)([a-zµ%]*)$/i.exec(value)
    if (!match) return undefined
    const number = Number(match[1])
    unit ||= match[2]
    min = Math.min(min, number)
    max = Math.max(max, number)
    sum += number * count
    n += count
  }
  return n ? { min, max, avg: sum / n, unit } : undefined
}

/** Groups records into patterns, most frequent first. */
export function minePatterns(records: readonly LogRecord[]): Pattern[] {
  // Pass 1: exact masked templates.
  const exact = new Map<string, Draft>()
  const tokenCache: string[][] = new Array(records.length)
  for (const record of records) {
    const original = tokenize(record.body)
    tokenCache[record.index] = original
    const tokens = original.map(maskToken)
    // The same words at another severity (a 200 and a 502 access line) are a different kind of message.
    const key = `${record.severity}\u0000${tokens.join(' ')}`
    const draft = exact.get(key)
    if (draft) draft.records.push(record.index)
    else exact.set(key, { severity: record.severity, tokens, records: [record.index] })
  }

  // Pass 2: merge near-identical templates of the same length and leading word (Drain's fixed-depth tree).
  const buckets = new Map<string, Draft[]>()
  const drafts = [...exact.values()].sort((a, b) => b.records.length - a.records.length)
  for (const draft of drafts) {
    const bucketKey = `${draft.severity}\u0000${draft.tokens.length}\u0000${draft.tokens[0] ?? ''}`
    const bucket = buckets.get(bucketKey) ?? []
    let target: Draft | undefined
    let best = 0
    for (const candidate of bucket) {
      const score = similarity(candidate.tokens, draft.tokens)
      if (score >= RATIO_TO_MERGE && score > best) {
        best = score
        target = candidate
      }
    }
    if (target) {
      target.tokens = merge(target.tokens, draft.tokens)
      target.records.push(...draft.records)
    } else {
      bucket.push({ severity: draft.severity, tokens: [...draft.tokens], records: [...draft.records] })
      buckets.set(bucketKey, bucket)
    }
  }

  const patterns: Pattern[] = []
  for (const bucket of buckets.values()) {
    for (const draft of bucket) {
      draft.records.sort((a, b) => a - b)
      const severities: Partial<Record<SeverityBand, number>> = {}
      const services = new Set<string>()
      let severity: SeverityBand = 'unset'
      const slotValues = new Map<number, Map<string, number>>()
      draft.tokens.forEach((token, position) => {
        if (token.includes(WILDCARD)) slotValues.set(position, new Map())
      })
      for (const index of draft.records) {
        const record = records[index]
        severities[record.severity] = (severities[record.severity] ?? 0) + 1
        severity = worstSeverity(severity, record.severity)
        services.add(record.service)
        const original = tokenCache[index]
        for (const [position, values] of slotValues) {
          const value = valueOf(original[position] ?? '', draft.tokens[position])
          if (values.size < 500 || values.has(value)) values.set(value, (values.get(value) ?? 0) + 1)
        }
      }
      const slots: SlotStats[] = [...slotValues].map(([position, values]) => ({
        label: slotLabel(draft.tokens, position),
        position,
        distinct: values.size,
        top: [...values]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)
          .map(([value, count]) => ({ value, count })),
        numeric: numericStats(values),
      }))
      const template = draft.tokens.join(' ') || '(empty message)'
      patterns.push({
        id: '',
        template,
        tokens: draft.tokens,
        count: draft.records.length,
        severities,
        severity,
        services: [...services].sort(),
        first: records[draft.records[0]].time,
        last: records[draft.records[draft.records.length - 1]].time,
        records: draft.records,
        slots,
      })
    }
  }

  patterns.sort((a, b) => b.count - a.count || a.first - b.first)
  patterns.forEach((pattern, index) => (pattern.id = `P${String(index + 1).padStart(2, '0')}`))
  return patterns
}

/** Maps every record index to the id of its pattern. */
export function patternIndex(patterns: readonly Pattern[], size: number): string[] {
  const byRecord = new Array<string>(size)
  for (const pattern of patterns) for (const index of pattern.records) byRecord[index] = pattern.id
  return byRecord
}
