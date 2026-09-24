import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createAuditResult,
  createConsumptionPath,
  createElementContract,
  createStylingProperty,
  createVerificationCase,
  propertyKey,
  validatePropertyInventory,
  validateRegistryReferences,
} from './lib/style-contract-model.mjs'

const tag = 'c2-example'
const name = '--c2-example__container--border-color'

test('property identity is exact tag plus exact variable name', () => {
  assert.notEqual(propertyKey(tag, name), propertyKey('c2-other', name))
  assert.notEqual(propertyKey(tag, name), propertyKey(tag, name.toUpperCase()))
  assert.throws(
    () =>
      validatePropertyInventory([
        { tag, name },
        { tag, name },
      ]),
    /duplicate.*c2-example.*border-color/i,
  )
})

test('element and property records retain an explicitly absent default', () => {
  assert.equal(createElementContract({ tag, packageName: '@c2n/example', source: 'src/example.ts' }).tag, tag)
  const property = createStylingProperty({ tag, name, type: 'color', description: 'Container border', authoredDefault: null, effectiveDefault: null })
  assert.equal(property.authoredDefault, null)
  assert.equal(property.effectiveDefault, null)
  assert.throws(() => createStylingProperty({ tag, name, type: 'color', description: 'Container border' }), /authoredDefault/)
})

test('consumption and case records require an observable target', () => {
  assert.throws(() => createConsumptionPath({ tag, name, mode: 'programmatic', source: 'src/example.ts' }), /target/)
  assert.equal(
    createConsumptionPath({ tag, name, mode: 'compiled-css', source: 'src/example.scss', target: '.container border-color', state: 'base' }).target,
    '.container border-color',
  )
  assert.throws(() => createVerificationCase({ id: 'x', tag, name, state: 'base', value: 'red' }), /target/)
  const caseRecord = createVerificationCase({
    id: 'rendered',
    tag,
    name,
    state: 'base',
    value: 'red',
    controlValue: 'blue',
    target: 'c2-example canvas',
    assertion: 'programmatic-output',
    valueSyntax: 'color',
    outputProbe: 'canvas-bitmap',
    geometryMetric: 'width',
    stabilityWindowMs: 250,
  })
  assert.equal(caseRecord.outputProbe, 'canvas-bitmap')
  assert.equal(caseRecord.controlValue, 'blue')
  assert.equal(caseRecord.geometryMetric, 'width')
  assert.equal(caseRecord.stabilityWindowMs, 250)
  assert.equal(caseRecord.valueSyntax, 'color')
})

test('final ledger assigns exactly one status to each inventoried property', () => {
  const property = { tag, name }
  assert.throws(() => createAuditResult({ inventory: [property], outcomes: [] }), /missing.*status/i)
  assert.throws(
    () =>
      createAuditResult({
        inventory: [property],
        outcomes: [
          { ...property, status: 'verified' },
          { ...property, status: 'failed' },
        ],
      }),
    /duplicate.*status/i,
  )
  const report = createAuditResult({ inventory: [property], outcomes: [{ ...property, status: 'verified' }] })
  assert.equal(report.summary.properties, 1)
  assert.equal(report.summary.verified, 1)
  assert.deepEqual(
    report.properties.map(({ status }) => status),
    ['verified'],
  )
})

test('reviewed registries reject stale property references', () => {
  assert.throws(
    () => validateRegistryReferences([{ tag, name }], { cases: [{ tag, name: '--c2-example--removed', state: 'base' }], consumers: [], exceptions: [] }),
    /stale.*removed/i,
  )
})
