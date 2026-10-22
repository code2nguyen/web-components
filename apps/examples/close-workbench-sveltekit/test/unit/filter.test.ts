import assert from 'node:assert/strict'
import test from 'node:test'

import { filterRows, filterRowsAny, orGroups, type FilterTerm, type ReconRow } from '../../src/lib/close/filter.ts'

const row = (overrides: Partial<ReconRow>): ReconRow => ({
  id: 'B-1',
  side: 'bank',
  date: '2026-09-10',
  description: 'ACH CREDIT HARBOR GROCERS',
  amount: 8420.5,
  channel: 'ach',
  reference: '',
  counterparty: 'Harbor Grocers',
  status: 'matched',
  ...overrides,
})

const rows = [
  row({ id: 'a' }),
  row({ id: 'b', amount: -45, channel: 'fee', description: 'MONTHLY SERVICE CHARGE', counterparty: '', status: 'unmatched', date: '2026-09-30' }),
  row({ id: 'c', amount: -1352, channel: 'check', description: 'CHECK 10244', reference: '10244', counterparty: 'Hollis Equipment', status: 'unmatched' }),
]
const term = (key: string | null, value: string, extra: Partial<FilterTerm> = {}): FilterTerm => ({ key, value, negated: false, ...extra })
const ids = (terms: FilterTerm[]) => filterRows(rows, terms).map((item) => item.id)

test('no terms keeps every row', () => {
  assert.deepEqual(ids([]), ['a', 'b', 'c'])
  assert.deepEqual(ids([term('status', '')]), ['a', 'b', 'c'])
})

test('free text searches the description, counterparty and reference', () => {
  assert.deepEqual(ids([term(null, 'harbor')]), ['a'])
  assert.deepEqual(ids([term(null, '10244')]), ['c'])
})

test('amount compares the absolute value with the comparator', () => {
  assert.deepEqual(ids([term('amount', '1000', { comparator: '>' })]), ['a', 'c'])
  assert.deepEqual(ids([term('amount', '45')]), ['b'])
  assert.deepEqual(ids([term('amount', 'lots', { comparator: '>' })]), [])
})

test('dates compare as calendar days', () => {
  assert.deepEqual(ids([term('date', '2026-09-15', { comparator: '>=' })]), ['b'])
})

test('terms combine with AND, and a negated term excludes', () => {
  assert.deepEqual(ids([term('direction', 'out'), term('status', 'matched', { negated: true })]), ['b', 'c'])
  assert.deepEqual(ids([term('channel', 'check'), term('who', 'hollis')]), ['c'])
})

test('an unknown key filters nothing out', () => {
  assert.deepEqual(ids([term('colour', 'red')]), ['a', 'b', 'c'])
})

test('OR splits a query into alternatives, by where each term sits', () => {
  const query = 'channel:check OR channel:fee amount:<100'
  const terms = [
    { ...term('channel', 'check'), start: 0 },
    { ...term('channel', 'fee'), start: 17 },
    { ...term('amount', '100', { comparator: '<' }), start: 29 },
  ]
  const groups = orGroups(query, terms)
  assert.deepEqual(
    groups.map((group) => group.map((item) => item.value)),
    [['check'], ['fee', '100']],
  )
  assert.deepEqual(
    filterRowsAny(rows, groups).map((item) => item.id),
    ['b', 'c'],
  )
  assert.deepEqual(
    filterRowsAny(rows, [[term('channel', 'check')]]).map((item) => item.id),
    ['c'],
  )
  assert.deepEqual(
    filterRowsAny(rows, []).map((item) => item.id),
    ['a', 'b', 'c'],
  )
})
