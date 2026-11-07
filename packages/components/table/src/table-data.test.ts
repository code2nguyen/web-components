import assert from 'node:assert/strict'
import { test } from 'node:test'

import { aggregate, csvField, filterTerms, matchesTerms, plainText, withFieldValue } from './table-data.ts'

test('aggregates skip what is not a number, except count', () => {
  const values = [1, '2', 'x', null, '', 3]
  assert.equal(aggregate('sum', values), 6)
  assert.equal(aggregate('avg', values), 2)
  assert.equal(aggregate('min', values), 1)
  assert.equal(aggregate('max', values), 3)
  assert.equal(aggregate('count', values), 4)
  assert.equal(aggregate('avg', []), undefined)
})

test('a write into a row copies the objects on its path', () => {
  const row = { id: 1, user: { name: 'Ada', tags: ['a'] }, other: { x: 1 } }
  const next = withFieldValue(row, 'user.name', 'Grace')
  assert.deepEqual(next, { id: 1, user: { name: 'Grace', tags: ['a'] }, other: { x: 1 } })
  assert.equal(row.user.name, 'Ada')
  assert.equal(next.other, row.other)
  assert.deepEqual(withFieldValue({}, 'a.b', 1), { a: { b: 1 } })
})

test('quick-filter terms must all occur, each in some cell', () => {
  const terms = filterTerms('  Ada  LOVE ')
  assert.deepEqual(terms, ['ada', 'love'])
  assert.equal(matchesTerms(terms, ['ada lovelace', 'analytics']), true)
  assert.equal(matchesTerms(terms, ['ada', 'analytics']), false)
  assert.equal(matchesTerms([], ['anything']), true)
})

test('csv fields are quoted when needed and formula-like text is neutralised', () => {
  assert.equal(csvField('plain', ',', true), 'plain')
  assert.equal(csvField('a,b', ',', true), '"a,b"')
  assert.equal(csvField('say "hi"', ';', true), '"say ""hi"""')
  assert.equal(csvField('line\nbreak', ',', true), '"line\nbreak"')
  assert.equal(csvField('=1+1', ',', true), "'=1+1")
  assert.equal(csvField('@cmd', ',', true), "'@cmd")
  assert.equal(csvField('-12.5', ',', true), '-12.5')
  assert.equal(csvField('=1+1', ',', false), '=1+1')
})

test('plain text of a value', () => {
  assert.equal(plainText(null), '')
  assert.equal(plainText(new Date('2024-01-02T00:00:00Z')), '2024-01-02T00:00:00.000Z')
  assert.equal(plainText({ a: 1 }), '{"a":1}')
  assert.equal(plainText(12), '12')
})
