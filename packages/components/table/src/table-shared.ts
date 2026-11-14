import { html } from 'lit'
import { arrayPropertyConverter } from '@c2n/core/lit-helper.js'
import { TableColumn } from './table-column.js'
import type { ColumnPin, TableColumnConfig, TableSummaryAggregate } from './table-types.js'

// What `c2-table` and `c2-group-table` both use. Not a public entry: it is not in the package's `exports`.

/** Field of the synthetic checkbox column, so it can live in the same render pipeline as the real columns. */
export const SELECTION_FIELD = '__c2-selection'

/** The chevron of a detail toggle, a group row and a tree row. */
export const CHEVRON = html`<svg
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  <path d="M6 9l6 6 6-6" />
</svg>`

/** A column's identity: its `id` (the `column-id` attribute on an element, never the HTML `id`), otherwise its field. */
export function columnKey(column: TableColumnConfig): string {
  return (column instanceof TableColumn ? column.columnId : column.id) || column.field
}

export function toNumber(value: unknown): number {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && value.trim() !== '') return Number(value)
  return Number.NaN
}

/** Reduces a column's values to one of the built-in aggregates; non-numeric values are skipped by all but `count`. */
export function aggregate(kind: TableSummaryAggregate, values: unknown[]): unknown {
  const present = values.filter((value) => value !== null && value !== undefined && value !== '')
  if (kind === 'count') return present.length
  if (kind === 'last') return present[present.length - 1]
  if (kind === 'tally') {
    const counts = new Map<unknown, number>()
    for (const value of present) counts.set(value, (counts.get(value) ?? 0) + 1)
    return counts
  }
  let sum = 0
  let count = 0
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  for (const value of values) {
    const number = toNumber(value)
    if (!Number.isFinite(number)) continue
    sum += number
    count++
    if (number < min) min = number
    if (number > max) max = number
  }
  switch (kind) {
    case 'sum':
      return sum
    case 'avg':
      return count ? sum / count : undefined
    case 'min':
      return count ? min : undefined
    case 'max':
      return count ? max : undefined
    default:
      return undefined
  }
}

/** Where a pinned column sits: its edge and offset. */
export interface PinPlacement {
  side: ColumnPin
  offset: number
  edge: boolean
}

/** The place of a data row in a hierarchy (a group, a tree), as `rowLevel` reports it to the rendering. */
export interface TableRowLevel {
  /** `aria-level` of the row, 1 for the outermost. */
  level: number
  /** `aria-expanded`: set for a row with children. */
  expanded?: boolean
  /** `aria-busy`: its children are loading. */
  busy?: boolean
  /** The column holding the indentation and the chevron. */
  column?: TableColumnConfig
  /** Indentation in levels, in that column. */
  indent: number
  /** Draws what goes at the start of that column's cell (the chevron of a tree row); called only for that cell. */
  toggle?: () => unknown
  /** The values a parent row shows in place of its own, keyed by column id. */
  rollup?: Map<string, unknown>
}

/** A list of keys: `;`-separated in the attribute (a group key holds `/` and `=`), unset until written. */
export const keyListConverter = {
  ...arrayPropertyConverter,
  fromAttribute: (value: string | null) => (value === null ? undefined : arrayPropertyConverter.fromAttribute(value)),
  toAttribute: (value: string[] | undefined) => (Array.isArray(value) ? arrayPropertyConverter.toAttribute(value) : null),
}

/**
 * Row keys, which are always strings. `arrayPropertyConverter` only splits strings, so an array of numeric ids
 * assigned from script (`table.value = [1, 2]`) would be stored as numbers and match no row.
 */
export const rowKeysConverter = {
  ...arrayPropertyConverter,
  fromProperty: (value: unknown) => {
    const parsed = arrayPropertyConverter.fromProperty(value)
    return Array.isArray(parsed) ? parsed.filter((key) => key !== null && key !== undefined).map(String) : parsed
  },
}

/** Row keys that stay unset until written, like the open groups, and are stored as strings, like `value`. */
export const rowKeyListConverter = { ...keyListConverter, fromProperty: rowKeysConverter.fromProperty }
