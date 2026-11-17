// node --test lab/scripts/lib/record.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { compare } from './record.mjs'

const record = (id, { full = true, findings = [], journeys = [] } = {}) => ({
  id,
  library: { version: '1.0.0', commit: 'abc' },
  runner: { full },
  findings: findings.map(([key, reproducible = true]) => ({ key, reproducible })),
  journeys: journeys.map(([persona, journey, runs, passed]) => ({ persona, journey, runs, passed })),
})

test('lists findings that appeared and findings that are gone', () => {
  const before = record('a', { findings: [['t/axe/c2-x/rule'], ['t/console-error/-/boom']] })
  const after = record('b', { findings: [['t/axe/c2-x/rule'], ['t/overflow/c2-y/horizontal-scroll']] })
  const change = compare(before, after)
  assert.deepEqual(change.appeared, ['t/overflow/c2-y/horizontal-scroll'])
  assert.deepEqual(change.gone, ['t/console-error/-/boom'])
  assert.equal(change.previous, 'a')
})

test('ignores flaky findings on either side', () => {
  const before = record('a', { findings: [['t/axe/c2-x/flaky', false]] })
  const after = record('b', { findings: [['t/axe/c2-z/flaky', false]] })
  const change = compare(before, after)
  assert.deepEqual(change.appeared, [])
  assert.deepEqual(change.gone, [])
})

test('reports journeys that started or stopped passing, ignoring journeys this run did not cover', () => {
  const before = record('a', {
    journeys: [
      ['mouse', 'search', 2, 2],
      ['mouse', 'filter', 2, 0],
      ['keyboard', 'search', 2, 2],
    ],
  })
  const after = record('b', {
    journeys: [
      ['mouse', 'search', 2, 1],
      ['mouse', 'filter', 2, 2],
    ],
  })
  const change = compare(before, after)
  assert.deepEqual(change.nowPassing, ['mouse/filter'])
  assert.deepEqual(change.nowFailing, ['mouse/search'])
})

test('compares nothing when either run is partial or there is no previous run', () => {
  assert.equal(compare(null, record('b')), null)
  assert.equal(compare(record('a', { full: false }), record('b')), null)
  assert.equal(compare(record('a'), record('b', { full: false })), null)
})
