import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { reconcileVerification } from './lib/style-contract-verification.mjs'

const property = {
  tag: 'c2-example',
  name: '--c2-example--color',
  ownerPackage: '@c2n/example',
  type: 'color',
  default: 'black',
  state: 'base',
  target: '.target color',
  consumptionMode: 'compiled-css',
  controlFamily: 'color',
}
const verificationCase = {
  id: 'example-color-base',
  tag: property.tag,
  name: property.name,
  state: 'base',
  target: property.target,
  browsers: ['chromium', 'firefox', 'webkit'],
}
const passingEvidence = {
  chromium: [{ id: verificationCase.id, status: 'passed' }],
  firefox: [{ id: verificationCase.id, status: 'passed' }],
  webkit: [{ id: verificationCase.id, status: 'passed' }],
}
const ready = {
  inventory: [property],
  cases: [verificationCase],
  browserEvidence: passingEvidence,
  panelPassed: true,
}

test('a complete contract has exactly one verified status and schema-valid browser coverage', () => {
  const { report, exitCode } = reconcileVerification(ready)
  assert.equal(exitCode, 0)
  assert.deepEqual(report.summary, { packages: 1, tags: 1, properties: 1, verified: 1, failed: 0, approvedExceptions: 0 })
  assert.deepEqual(
    report.properties.map(({ status }) => status),
    ['verified'],
  )
  assert.deepEqual(report.browserCoverage, { chromium: 'complete', firefox: 'representative', webkit: 'representative' })
})

test('missing browser evidence and a failed panel cannot become verified', () => {
  for (const input of [
    { ...ready, browserEvidence: { ...passingEvidence, chromium: [] } },
    { ...ready, browserEvidence: { ...passingEvidence, firefox: [] } },
    { ...ready, panelPassed: false },
  ]) {
    const { report, exitCode } = reconcileVerification(input)
    assert.equal(exitCode, 1)
    assert.equal(report.properties[0].status, 'failed')
    assert.ok(report.failures.length)
  }
})

test('a newly inventoried property without a case fails on its first gate run', () => {
  const added = { ...property, name: '--c2-example--border-color', target: '.target border-color' }
  const { report, exitCode } = reconcileVerification({ ...ready, inventory: [property, added] })
  assert.equal(exitCode, 1)
  assert.equal(report.summary.properties, 2)
  assert.equal(report.properties.find((item) => item.name === added.name).status, 'failed')
  assert.ok(report.failures.some((failure) => failure.name === added.name && failure.category === 'missing-case'))
  assert.equal(report.browserCoverage.chromium, 'failed')
})

test('one icon sample covers only statically ready tags on the identical shared styling path', () => {
  for (const family of ['feather', 'phosphor']) {
    const stylingPath = `${family}-icon-base`
    const sample = { ...property, tag: `c2-${family}-activity`, sharedStylingPath: stylingPath, staticReady: true }
    const sibling = { ...sample, tag: `c2-${family}-airplay` }
    const caseForSample = { ...verificationCase, id: `${family}-color`, tag: sample.tag, sharedStylingPath: stylingPath }
    const evidence = Object.fromEntries(Object.keys(passingEvidence).map((browser) => [browser, [{ id: caseForSample.id, status: 'passed' }]]))
    const input = { ...ready, inventory: [sample, sibling], cases: [caseForSample], browserEvidence: evidence }
    const passed = reconcileVerification(input)
    assert.equal(passed.exitCode, 0)
    assert.deepEqual(
      passed.report.properties.map((item) => item.status),
      ['verified', 'verified'],
    )
    assert.deepEqual(
      passed.report.properties.map((item) => item.evidence),
      [[caseForSample.id], [caseForSample.id]],
    )

    for (const changed of [
      { ...sibling, staticReady: false },
      { ...sibling, sharedStylingPath: 'distinct-icon-path' },
    ]) {
      const result = reconcileVerification({ ...input, inventory: [sample, changed] })
      assert.equal(result.exitCode, 1)
      assert.equal(result.report.properties.find((item) => item.tag === sibling.tag).status, 'failed')
    }
  }
})

test('missing property classification cannot receive verified status', () => {
  const { report, exitCode } = reconcileVerification({ ...ready, inventory: [{ ...property, controlFamily: null }] })
  assert.equal(exitCode, 1)
  assert.equal(report.properties[0].status, 'failed')
  assert.ok(report.failures.some((failure) => failure.category === 'incomplete-property-classification'))
})

test('reviewed exceptions receive their own status without hiding static failures', () => {
  const exceptionInput = { ...ready, cases: [], browserEvidence: {}, exceptions: [{ tag: property.tag, name: property.name }] }
  const { report } = reconcileVerification(exceptionInput)
  assert.equal(report.properties[0].status, 'approved-exception')
  const failed = reconcileVerification({
    ...exceptionInput,
    staticFailures: [{ tag: property.tag, name: property.name, category: 'stale-manifest', source: 'src/example.ts' }],
  })
  assert.equal(failed.report.properties[0].status, 'failed')
})

test('report order and JSON remain deterministic across input order', () => {
  const second = { ...property, tag: 'c2-another', name: '--c2-another--color', ownerPackage: '@c2n/another' }
  const secondCase = { ...verificationCase, id: 'another-color-base', tag: second.tag, name: second.name }
  const evidence = Object.fromEntries(
    Object.entries(passingEvidence).map(([browser, entries]) => [browser, [...entries, { id: secondCase.id, status: 'passed' }]]),
  )
  const first = reconcileVerification({ ...ready, inventory: [property, second], cases: [verificationCase, secondCase], browserEvidence: evidence })
  const reversed = reconcileVerification({
    ...ready,
    inventory: [second, property],
    cases: [secondCase, verificationCase],
    browserEvidence: Object.fromEntries(Object.entries(evidence).map(([browser, entries]) => [browser, [...entries].reverse()])),
  })
  assert.equal(JSON.stringify(first.report), JSON.stringify(reversed.report))
})

test('invalid or stale evidence is an input error, not a passing result', () => {
  assert.throws(() => reconcileVerification({ ...ready, inventory: [property, property] }), /duplicate property/)
  assert.throws(
    () => reconcileVerification({ ...ready, browserEvidence: { ...passingEvidence, chromium: [{ id: 'unreviewed', status: 'passed' }] } }),
    /stale browser evidence/,
  )
  assert.throws(
    () => reconcileVerification({ ...ready, browserEvidence: { ...passingEvidence, chromium: [{ id: verificationCase.id, status: 'unknown' }] } }),
    /invalid browser status/,
  )
})

test('CLI rejects invalid options with input-error exit 2', () => {
  const run = spawnSync(process.execPath, [new URL('./verify-style-contracts.mjs', import.meta.url).pathname, '--unknown'], { encoding: 'utf8' })
  assert.equal(run.status, 2)
  assert.match(run.stderr, /usage: verify-style-contracts/)
})
