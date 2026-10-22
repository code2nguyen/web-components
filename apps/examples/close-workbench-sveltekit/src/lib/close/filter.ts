/**
 * The workbench's query language over bank and ledger lines, evaluated on the terms `c2-query-input` parses:
 * `status:unmatched amount:>1000 -channel:card harbor`. Every term must hold (AND); a negated term must not.
 */
import type { Channel, Day } from './types.ts'

export type LineStatus = 'matched' | 'unmatched'

/** A bank line or a ledger entry, flattened for the tables and the filter. */
export interface ReconRow {
  [key: string]: unknown
  id: string
  side: 'bank' | 'ledger'
  date: Day
  description: string
  /** Dollars, signed, for the table's currency format. */
  amount: number
  channel: Channel
  reference: string
  counterparty: string
  status: LineStatus
}

/** The parts of a query term the filter reads (structurally `QueryTerm` from `@c2n/components/query-input`). */
export interface FilterTerm {
  key: string | null
  value: string
  negated: boolean
  comparator?: '>' | '>=' | '<' | '<=' | '='
}

export const FILTER_FIELDS = [
  { key: 'status', description: 'matched or unmatched', values: ['matched', 'unmatched'] },
  { key: 'amount', description: 'absolute amount in dollars, e.g. amount:>1000', values: ['>1000', '<100', '=1250'] },
  { key: 'date', description: 'calendar day, e.g. date:>=2026-09-15', values: ['>=2026-09-15', '<2026-09-08'] },
  { key: 'channel', description: 'how the money moved', values: ['ach', 'wire', 'check', 'card', 'deposit', 'fee', 'interest', 'pos'] },
  { key: 'direction', description: 'money in or out', values: ['in', 'out'] },
  { key: 'who', description: 'counterparty name contains', values: [] as string[] },
  { key: 'ref', description: 'reference or document number contains', values: [] as string[] },
]

function compare(actual: number | string, comparator: FilterTerm['comparator'], expected: number | string): boolean {
  switch (comparator) {
    case '>':
      return actual > expected
    case '>=':
      return actual >= expected
    case '<':
      return actual < expected
    case '<=':
      return actual <= expected
    default:
      return actual === expected
  }
}

const contains = (haystack: string, needle: string) => haystack.toLowerCase().includes(needle.toLowerCase())

function holds(row: ReconRow, term: FilterTerm): boolean {
  const value = term.value
  switch (term.key) {
    case null:
    case '':
      return contains(`${row.description} ${row.counterparty} ${row.reference}`, value)
    case 'status':
      return row.status === value.toLowerCase()
    case 'amount': {
      const expected = Number(value.replace(/[$,]/g, ''))
      return Number.isFinite(expected) && compare(Math.abs(row.amount), term.comparator ?? '=', expected)
    }
    case 'date':
      return compare(row.date, term.comparator ?? '=', value)
    case 'channel':
      return row.channel === value.toLowerCase()
    case 'direction':
      return value.toLowerCase() === 'in' ? row.amount > 0 : row.amount < 0
    case 'who':
      return contains(row.counterparty, value)
    case 'ref':
      return contains(row.reference, value)
    default:
      // An unknown key filters nothing out; the query field already underlines it.
      return true
  }
}

export function filterRows<T extends ReconRow>(rows: T[], terms: FilterTerm[]): T[] {
  const active = terms.filter((term) => term.value !== '')
  if (!active.length) return rows
  return rows.filter((row) => active.every((term) => holds(row, term) !== term.negated))
}
