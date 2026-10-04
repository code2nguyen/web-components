/**
 * OpenTelemetry log parsing.
 *
 * Accepts what the collector's `file` exporter and the OTLP/HTTP JSON encoding produce:
 * - one `ExportLogsServiceRequest` document (`{ "resourceLogs": [...] }`),
 * - JSON Lines, one request per line (the file exporter's default),
 * - a JSON array of requests.
 *
 * Both the canonical camelCase protobuf-JSON mapping and the snake_case field names some SDKs write are read,
 * `AnyValue` wrappers are unwrapped, and base64 trace/span ids are converted to hex.
 */

export type SeverityBand = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'unset'

export const SEVERITY_BANDS: readonly SeverityBand[] = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'unset']

export type AttributeValue = string | number | boolean | null

export interface LogRecord {
  /** Position in the file, stable identity across views. */
  index: number
  /** Epoch milliseconds (timeUnixNano, falling back to observedTimeUnixNano). */
  time: number
  severity: SeverityBand
  severityText: string
  severityNumber: number
  body: string
  service: string
  scope: string
  traceId: string
  spanId: string
  /** Resource attributes, flattened with dotted keys. */
  resource: Record<string, AttributeValue>
  /** Record attributes, flattened with dotted keys. */
  attributes: Record<string, AttributeValue>
}

export interface ParseResult {
  records: LogRecord[]
  /** Non-fatal problems, e.g. a malformed JSON line that was skipped. */
  warnings: string[]
  format: 'otlp-json' | 'otlp-jsonl'
}

export class LogParseError extends Error {}

type Json = null | boolean | number | string | Json[] | { [key: string]: Json }
type JsonObject = { [key: string]: Json }

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Reads `camelCase` or `snake_case` spelling of a field. */
function field(object: JsonObject, camel: string): Json | undefined {
  if (camel in object) return object[camel]
  const snake = camel.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
  return object[snake]
}

/** Unwraps an OTLP `AnyValue` into a plain JSON value. */
export function unwrapAnyValue(value: Json | undefined): Json {
  if (!isObject(value)) return value ?? null
  const string = field(value, 'stringValue')
  if (string !== undefined) return string
  const bool = field(value, 'boolValue')
  if (bool !== undefined) return bool
  const int = field(value, 'intValue')
  if (int !== undefined) return typeof int === 'string' ? Number(int) : int
  const double = field(value, 'doubleValue')
  if (double !== undefined) return double
  const bytes = field(value, 'bytesValue')
  if (bytes !== undefined) return bytes
  const array = field(value, 'arrayValue')
  if (isObject(array)) return (Array.isArray(array.values) ? array.values : []).map((item) => unwrapAnyValue(item))
  const kvlist = field(value, 'kvlistValue')
  if (isObject(kvlist)) return keyValuesToObject(kvlist.values)
  // An empty AnyValue (`{}`) is an explicit null.
  if (Object.keys(value).length === 0) return null
  return value
}

function keyValuesToObject(list: Json | undefined): JsonObject {
  const out: JsonObject = {}
  if (!Array.isArray(list)) return out
  for (const item of list) {
    if (isObject(item) && typeof item.key === 'string') out[item.key] = unwrapAnyValue(item.value)
  }
  return out
}

/** Flattens nested objects to dotted keys and stringifies arrays, so every attribute is one scalar. */
function flatten(object: JsonObject, prefix = '', out: Record<string, AttributeValue> = {}): Record<string, AttributeValue> {
  for (const [key, value] of Object.entries(object)) {
    const name = prefix ? `${prefix}.${key}` : key
    if (isObject(value)) flatten(value, name, out)
    else if (Array.isArray(value)) out[name] = JSON.stringify(value)
    else out[name] = value
  }
  return out
}

function attributes(list: Json | undefined): Record<string, AttributeValue> {
  return flatten(keyValuesToObject(list))
}

function nanosToMillis(value: Json | undefined): number {
  if (typeof value === 'number') return value / 1e6
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    // Keep precision: drop the last six digits instead of dividing a >2^53 number.
    return value.length > 6 ? Number(value.slice(0, -6)) + Number(`0.${value.slice(-6)}`) : Number(value) / 1e6
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    if (!Number.isNaN(parsed)) return parsed
  }
  return NaN
}

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/

/** OTLP JSON ids are hex; some exporters emit protobuf's default base64 instead. */
export function normalizeId(value: Json | undefined, hexLength: number): string {
  if (typeof value !== 'string' || !value) return ''
  if (value.length === hexLength && /^[0-9a-fA-F]+$/.test(value)) return /^0+$/.test(value) ? '' : value.toLowerCase()
  const byteLength = hexLength / 2
  if (BASE64.test(value) && Math.ceil(byteLength / 3) * 4 === value.length) {
    const binary = atob(value)
    let hex = ''
    for (let i = 0; i < binary.length; i++) hex += binary.charCodeAt(i).toString(16).padStart(2, '0')
    return /^0+$/.test(hex) ? '' : hex
  }
  return value.toLowerCase()
}

const SEVERITY_NUMBER_BANDS: Array<[number, SeverityBand]> = [
  [21, 'fatal'],
  [17, 'error'],
  [13, 'warn'],
  [9, 'info'],
  [5, 'debug'],
  [1, 'trace'],
]

const SEVERITY_TEXT_BANDS: Record<string, SeverityBand> = {
  trace: 'trace',
  debug: 'debug',
  info: 'info',
  information: 'info',
  notice: 'info',
  warn: 'warn',
  warning: 'warn',
  error: 'error',
  err: 'error',
  critical: 'fatal',
  crit: 'fatal',
  fatal: 'fatal',
  alert: 'fatal',
  emergency: 'fatal',
}

export function severityBand(severityNumber: number, severityText: string): SeverityBand {
  if (severityNumber > 0) {
    for (const [floor, band] of SEVERITY_NUMBER_BANDS) if (severityNumber >= floor) return band
  }
  const text = severityText.trim().toLowerCase().replace(/\d+$/, '')
  return SEVERITY_TEXT_BANDS[text] ?? 'unset'
}

function severityNumberOf(value: Json | undefined): number {
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    // Enum name form: "SEVERITY_NUMBER_ERROR2".
    const match = /^SEVERITY_NUMBER_([A-Z]+)(\d?)$/.exec(value)
    if (match) {
      const base: Record<string, number> = { TRACE: 1, DEBUG: 5, INFO: 9, WARN: 13, ERROR: 17, FATAL: 21 }
      return (base[match[1]] ?? 0) + (match[2] ? Number(match[2]) - 1 : 0)
    }
    const numeric = Number(value)
    return Number.isFinite(numeric) ? numeric : 0
  }
  return 0
}

function bodyText(value: Json): string {
  if (value === null) return ''
  if (typeof value === 'string') return value
  return JSON.stringify(value)
}

function collectRequest(request: JsonObject, records: LogRecord[]): void {
  const resourceLogs = field(request, 'resourceLogs')
  if (!Array.isArray(resourceLogs)) throw new LogParseError('Expected a "resourceLogs" array — is this an OpenTelemetry logs export?')
  for (const resourceLog of resourceLogs) {
    if (!isObject(resourceLog)) continue
    const resourceObject = field(resourceLog, 'resource')
    const resource = isObject(resourceObject) ? attributes(resourceObject.attributes) : {}
    const service = typeof resource['service.name'] === 'string' ? resource['service.name'] : 'unknown_service'
    const scopeLogs = field(resourceLog, 'scopeLogs') ?? field(resourceLog, 'instrumentationLibraryLogs')
    if (!Array.isArray(scopeLogs)) continue
    for (const scopeLog of scopeLogs) {
      if (!isObject(scopeLog)) continue
      const scopeObject = field(scopeLog, 'scope') ?? field(scopeLog, 'instrumentationLibrary')
      const scope = isObject(scopeObject) && typeof scopeObject.name === 'string' ? scopeObject.name : ''
      const logRecords = field(scopeLog, 'logRecords') ?? field(scopeLog, 'logs')
      if (!Array.isArray(logRecords)) continue
      for (const log of logRecords) {
        if (!isObject(log)) continue
        let time = nanosToMillis(field(log, 'timeUnixNano'))
        if (!time || Number.isNaN(time)) time = nanosToMillis(field(log, 'observedTimeUnixNano'))
        const severityNumber = severityNumberOf(field(log, 'severityNumber'))
        const severityTextValue = field(log, 'severityText')
        const severityText = typeof severityTextValue === 'string' ? severityTextValue : ''
        records.push({
          index: records.length,
          time: Number.isNaN(time) ? 0 : time,
          severity: severityBand(severityNumber, severityText),
          severityText,
          severityNumber,
          body: bodyText(unwrapAnyValue(field(log, 'body'))),
          service,
          scope,
          traceId: normalizeId(field(log, 'traceId'), 32),
          spanId: normalizeId(field(log, 'spanId'), 16),
          resource,
          attributes: attributes(field(log, 'attributes')),
        })
      }
    }
  }
}

/** Parses OTLP JSON or JSON Lines text into normalized records, sorted by time. */
export function parseOtlpLogs(text: string): ParseResult {
  const trimmed = text.trim()
  if (!trimmed) throw new LogParseError('The file is empty.')
  const records: LogRecord[] = []
  const warnings: string[] = []
  let format: ParseResult['format'] = 'otlp-json'

  let document: Json | undefined
  try {
    document = JSON.parse(trimmed) as Json
  } catch {
    document = undefined
  }

  if (document !== undefined) {
    const requests = Array.isArray(document) ? document : [document]
    for (const request of requests) {
      if (!isObject(request)) throw new LogParseError('Expected an object with a "resourceLogs" array.')
      collectRequest(request, records)
    }
  } else {
    format = 'otlp-jsonl'
    const lines = trimmed.split(/\r?\n/)
    let parsedLines = 0
    lines.forEach((line, lineIndex) => {
      if (!line.trim()) return
      try {
        const request = JSON.parse(line) as Json
        if (!isObject(request)) throw new LogParseError('not an object')
        collectRequest(request, records)
        parsedLines++
      } catch (error) {
        if (warnings.length < 20) warnings.push(`Line ${lineIndex + 1} skipped: ${error instanceof Error ? error.message : 'invalid JSON'}`)
      }
    })
    if (!parsedLines) throw new LogParseError('No line could be read as OpenTelemetry JSON. Export logs with the collector "file" exporter or OTLP/HTTP JSON.')
  }

  if (!records.length) throw new LogParseError('The file is valid OpenTelemetry JSON but contains no log records.')
  records.sort((a, b) => a.time - b.time || a.index - b.index)
  records.forEach((record, index) => (record.index = index))
  return { records, warnings, format }
}
