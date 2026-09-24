import assert from 'node:assert/strict'
import { test } from 'node:test'
import { summarizeStaticAudit } from './summarize-style-contract-audit.mjs'

test('CI summary shows complete inventory and sorted failure categories', () => {
  const summary = summarizeStaticAudit({
    summary: { packages: 2, tags: 3, properties: 4, failures: 2 },
    failures: [{ category: 'unused-property' }, { category: 'missing-case' }],
  })
  assert.match(summary, /2 packages · 3 tags · 4 properties · 2 static failures/)
  assert.ok(summary.indexOf('missing-case: 1') < summary.indexOf('unused-property: 1'))
  assert.match(summary, /not yet a release gate/)
})
