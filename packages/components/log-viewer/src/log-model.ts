/** Text attributes of one log entry. message is the primary content. */
export interface LogEntry {
  message: string
  [attribute: string]: string | undefined
}

export type LogFilterMode = 'filter' | 'highlight'

/** Exact attribute matches (OR within an array, AND across attributes) and full text substring search. */
export interface LogFilter {
  attributes?: Record<string, string | readonly string[]>
  search?: string
}

export function validateEntries(input: LogEntry | readonly LogEntry[]): LogEntry[] {
  const batch: unknown[] = Array.isArray(input) ? input : [input]
  return batch.map((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('A log entry must be an object')
    const entry = value as Record<string, unknown>
    if (!Object.prototype.hasOwnProperty.call(entry, 'message') || typeof entry.message !== 'string') throw new TypeError('message must be a string')
    if (Object.values(entry).some((text) => text !== undefined && typeof text !== 'string')) throw new TypeError('Log attributes must be strings')
    return { ...entry } as LogEntry
  })
}

export function validateFilter(value: LogFilter | null): LogFilter | null {
  if (value === null) return null
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Invalid filter')
  if (value.search !== undefined && typeof value.search !== 'string') throw new TypeError('search must be a string')
  const attributes = value.attributes
  if (attributes !== undefined && (!attributes || typeof attributes !== 'object' || Array.isArray(attributes))) throw new TypeError('Invalid attributes')
  const copy: Record<string, string | readonly string[]> = Object.create(null)
  for (const [key, expected] of Object.entries(attributes ?? {})) {
    if (typeof expected !== 'string' && (!Array.isArray(expected) || expected.some((item) => typeof item !== 'string')))
      throw new TypeError('Attribute filters must be strings or string arrays')
    copy[key] = typeof expected === 'string' ? expected : [...expected]
  }
  return { attributes: copy, search: value.search ?? '' }
}

export function matchesFilter(entry: LogEntry, filter: LogFilter | null): boolean {
  if (!filter) return true
  return (
    Object.entries(filter.attributes ?? {}).every(
      ([key, expected]) =>
        Object.prototype.hasOwnProperty.call(entry, key) &&
        entry[key] !== undefined &&
        (typeof expected === 'string' ? entry[key] === expected : expected.includes(entry[key]!)),
    ) &&
    (!filter.search || Object.values(entry).some((value) => value?.toLowerCase().includes(filter.search!.toLowerCase())))
  )
}

export function entryColumns(entries: readonly LogEntry[]): string[] {
  return columnOrder(entries.flatMap((entry) => Object.keys(entry)))
}

/** Attribute names in first-seen order, conventional attributes first and message last. */
export function columnOrder(seen: Iterable<string>): string[] {
  const keys = new Set(seen)
  const conventional = ['timestamp', 'level', 'source'].filter((key) => keys.delete(key))
  keys.delete('message')
  return [...conventional, ...keys, 'message']
}
