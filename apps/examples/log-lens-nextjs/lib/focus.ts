/**
 * The lens: one cross-view filter. Clicking a chapter, a pattern, a journey or an attribute narrows every other
 * view to the same records, so each answer leads to the next question instead of a new search.
 */
import type { LogRecord, SeverityBand } from './otlp.ts'

export interface Focus {
  severities?: SeverityBand[]
  services?: string[]
  patternId?: string
  traceId?: string
  window?: { start: number; end: number; label?: string }
  attribute?: { key: string; value: string }
  search?: string
}

export type FocusKey = keyof Focus

export function isEmptyFocus(focus: Focus): boolean {
  return !(focus.severities?.length || focus.services?.length || focus.patternId || focus.traceId || focus.window || focus.attribute || focus.search)
}

export function attributeValue(record: LogRecord, key: string): string | undefined {
  if (key === 'service.name') return record.service
  if (key === 'scope') return record.scope || undefined
  if (key === 'severity') return record.severity
  const value = key in record.attributes ? record.attributes[key] : record.resource[key]
  return value === undefined || value === null ? undefined : String(value)
}

export function matchesFocus(record: LogRecord, focus: Focus, patternOf: readonly string[]): boolean {
  if (focus.severities?.length && !focus.severities.includes(record.severity)) return false
  if (focus.services?.length && !focus.services.includes(record.service)) return false
  if (focus.patternId && patternOf[record.index] !== focus.patternId) return false
  if (focus.traceId && record.traceId !== focus.traceId) return false
  if (focus.window && (record.time < focus.window.start || record.time > focus.window.end)) return false
  if (focus.attribute && attributeValue(record, focus.attribute.key) !== focus.attribute.value) return false
  if (focus.search) {
    const needle = focus.search.toLowerCase()
    if (!record.body.toLowerCase().includes(needle) && !record.service.toLowerCase().includes(needle) && !record.traceId.includes(needle)) return false
  }
  return true
}

export function applyFocus(records: readonly LogRecord[], focus: Focus, patternOf: readonly string[]): LogRecord[] {
  if (isEmptyFocus(focus)) return records as LogRecord[]
  return records.filter((record) => matchesFocus(record, focus, patternOf))
}
