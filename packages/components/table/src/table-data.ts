/**
 * Data helpers of `c2-table` that need no DOM: aggregates, immutable writes into a row, quick-filter matching and CSV
 * cells. Type imports only, so `table-data.test.ts` runs them under `node --test`.
 */
import type { TableRow, TableSummaryAggregate } from './table-types.js'

export function toNumber(value: unknown): number {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && value.trim() !== '') return Number(value)
  return Number.NaN
}

/** Reduces a column's values to one of the built-in aggregates; non-numeric values are skipped by all but `count`. */
export function aggregate(kind: TableSummaryAggregate, values: unknown[]): unknown {
  if (kind === 'count') return values.filter((value) => value !== null && value !== undefined && value !== '').length
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

/**
 * A copy of `row` with `value` at `field`, a possibly dotted path: every object on the path is copied, the rest is
 * shared. The row the application gave is left untouched.
 */
export function withFieldValue(row: TableRow, field: string, value: unknown): TableRow {
  const [head, ...rest] = field.split('.')
  if (!rest.length) return { ...row, [head]: value }
  const child = row[head]
  const base = typeof child === 'object' && child !== null && !Array.isArray(child) ? (child as TableRow) : {}
  return { ...row, [head]: withFieldValue(base, rest.join('.'), value) }
}

/** The words of a quick filter, lowercased: a row matches when every one of them is found in one of its cells. */
export function filterTerms(text: string | null | undefined): string[] {
  return (text ?? '').toLocaleLowerCase().split(/\s+/).filter(Boolean)
}

/** Whether every term occurs in at least one of `texts` (already lowercased). */
export function matchesTerms(terms: readonly string[], texts: readonly string[]): boolean {
  return terms.every((term) => texts.some((text) => text.includes(term)))
}

const NUMBER = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/
const FORMULA_START = /^[=+\-@\t\r]/

/**
 * One CSV field: quoted when it holds the separator, a quote or a line break. With `escapeFormulas`, text a
 * spreadsheet would evaluate as a formula gets a leading `'` (a plain number such as `-12.5` is left alone).
 */
export function csvField(text: string, separator: string, escapeFormulas: boolean): string {
  let value = text
  if (escapeFormulas && FORMULA_START.test(value) && !NUMBER.test(value)) value = `'${value}`
  if (value.includes(separator) || /["\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

/** Plain text of a cell value for CSV, the clipboard and the quick filter: dates as ISO strings, objects as JSON. */
export function plainText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : value.toISOString()
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}
