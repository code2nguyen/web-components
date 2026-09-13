export type SortDirection = 'asc' | 'desc'

export interface SortEntry {
  field: string
  direction: SortDirection
}

/** Reads a possibly dotted `field` path out of a record. */
export function getFieldValue(item: unknown, field: string): unknown {
  if (!item || !field) return undefined
  const record = item as Record<string, unknown>
  if (!field.includes('.')) return record[field]
  let current: unknown = record
  for (const part of field.split('.')) {
    if (current === null || current === undefined) return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

/**
 * Orders two cell values the way a person expects a column to sort: empties last, numbers and dates by magnitude,
 * everything else by a numeric-aware, case-insensitive locale compare so `item 2` comes before `item 10`.
 */
export function defaultCompare(a: unknown, b: unknown): number {
  if (a === b) return 0
  if (a === null || a === undefined || a === '') return 1
  if (b === null || b === undefined || b === '') return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b)
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime()
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
}

/** `name:asc` ⇄ `SortEntry`, so a single-key sort can be set from markup. */
export const sortEntryConverter = {
  toAttribute: (value: SortEntry | undefined) => (value?.field ? `${value.field}:${value.direction}` : null),
  fromAttribute: (value: string | null): SortEntry | undefined => {
    if (!value) return undefined
    const [field, direction] = value.split(':')
    const name = field?.trim()
    if (!name) return undefined
    return { field: name, direction: direction?.trim() === 'desc' ? 'desc' : 'asc' }
  },
}
