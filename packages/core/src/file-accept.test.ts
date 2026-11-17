import assert from 'node:assert/strict'
import { test } from 'node:test'

import { filterFiles, matchesAccept, mayAcceptType, parseAccept } from './file-accept.ts'

const file = (name: string, type: string, size = 10) => new File([new Uint8Array(size)], name, { type })

test('reads the accept list as the native file input does', () => {
  assert.deepEqual(parseAccept(' image/*, .PDF ,,'), ['image/*', '.pdf'])
  assert.equal(matchesAccept(file('a.png', 'image/png'), 'image/*'), true)
  assert.equal(matchesAccept(file('Report.PDF', ''), '.pdf'), true)
  assert.equal(matchesAccept(file('a.csv', 'text/csv'), 'text/csv'), true)
  assert.equal(matchesAccept(file('a.csv', 'text/csv'), 'image/*,.pdf'), false)
  assert.equal(matchesAccept(file('a.csv', 'text/csv'), ''), true)
})

test('judges a dragged type before the drop, unsure when only the name could tell', () => {
  assert.equal(mayAcceptType('image/png', 'image/*'), true)
  assert.equal(mayAcceptType('text/plain', 'image/*'), false)
  assert.equal(mayAcceptType('text/plain', 'image/*,.txt'), undefined)
  assert.equal(mayAcceptType('', 'image/*'), undefined)
  assert.equal(mayAcceptType('text/plain', undefined), true)
})

test('splits files by type, size, count and single-file rules, first broken rule first', () => {
  const files = [
    file('a.png', 'image/png'),
    file('b.txt', 'text/plain'),
    file('c.png', 'image/png', 500),
    file('d.png', 'image/png'),
    file('e.png', 'image/png'),
  ]
  const { accepted, rejected } = filterFiles(files, { accept: 'image/*', maxSize: 100, maxFiles: 3, existing: 1 })
  assert.deepEqual(
    accepted.map((f) => f.name),
    ['a.png', 'd.png'],
  )
  assert.deepEqual(
    rejected.map((r) => `${r.file.name}:${r.reason}`),
    ['b.txt:type', 'c.png:size', 'e.png:limit'],
  )
})

test('takes one file only where multiple is off, and none when one is there', () => {
  const files = [file('a.png', 'image/png'), file('b.png', 'image/png')]
  assert.deepEqual(
    filterFiles(files, { multiple: false }).rejected.map((r) => r.reason),
    ['multiple'],
  )
  assert.equal(filterFiles(files, { multiple: false, existing: 1 }).accepted.length, 0)
  // A first file refused for its type does not use up the one place.
  const mixed = filterFiles([file('notes.txt', 'text/plain'), file('plan.pdf', 'application/pdf')], { accept: '.pdf', multiple: false })
  assert.deepEqual(
    mixed.accepted.map((f) => f.name),
    ['plan.pdf'],
  )
  assert.deepEqual(
    mixed.rejected.map((r) => r.reason),
    ['type'],
  )
  assert.equal(filterFiles(files).accepted.length, 2)
})
