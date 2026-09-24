import assert from 'node:assert/strict'
import { test } from 'node:test'
import { validateApprovedExceptions } from './lib/style-contract-exceptions.mjs'

const name = '--c2-example--color'
const valid = {
  id: 'browser-owned-color',
  tag: 'c2-example',
  name,
  surfaceKind: 'browser-owned',
  limitation: 'Native picker surface is browser-owned',
  userImpact: 'The picker color cannot be themed',
  supportedAlternative: 'Use the documented host color variable',
  technicalReason: 'The browser does not expose the picker internals',
  reviewedBy: 'Component maintainers',
  reviewedOn: '2026-09-01',
  reassessOn: '2027-09-01',
}
const inventory = [{ tag: 'c2-example', name }]
const today = '2026-09-24'

test('a complete current browser-owned exception validates', () => {
  assert.deepEqual(validateApprovedExceptions({ exceptions: [valid], inventory, now: today }), [valid])
})

test('every review field is required', () => {
  for (const field of ['limitation', 'userImpact', 'supportedAlternative', 'technicalReason', 'reviewedBy', 'reviewedOn', 'reassessOn']) {
    assert.throws(() => validateApprovedExceptions({ exceptions: [{ ...valid, [field]: '' }], inventory, now: today }), new RegExp(field))
  }
})

test('expired, malformed, and reversed review dates are rejected', () => {
  assert.throws(() => validateApprovedExceptions({ exceptions: [{ ...valid, reassessOn: '2026-09-23' }], inventory, now: today }), /expired/i)
  assert.throws(() => validateApprovedExceptions({ exceptions: [{ ...valid, reviewedOn: '2026-02-30' }], inventory, now: today }), /date/i)
  assert.throws(() => validateApprovedExceptions({ exceptions: [{ ...valid, reassessOn: '2026-08-01' }], inventory, now: '2026-07-01' }), /after review/i)
})

test('stale or duplicate property exceptions are rejected', () => {
  assert.throws(() => validateApprovedExceptions({ exceptions: [{ ...valid, name: '--c2-example--old-color' }], inventory, now: today }), /stale/i)
  assert.throws(() => validateApprovedExceptions({ exceptions: [valid, { ...valid, id: 'other' }], inventory, now: today }), /duplicate/i)
})

test('ordinary component-owned shadow styling cannot receive an exception', () => {
  assert.throws(
    () =>
      validateApprovedExceptions({
        exceptions: [valid],
        inventory,
        now: today,
        cssPaths: [{ tag: 'c2-example', name, target: '.target color' }],
      }),
    /component-owned/i,
  )
})
