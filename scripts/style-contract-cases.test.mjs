import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  reconcileCaseCoverage,
  selectCasesForBrowser,
  validateObservableCase,
  validateReviewedContext,
  validateReviewedRegistry,
} from './lib/style-contract-cases.mjs'

const property = { tag: 'c2-example', name: '--c2-example__container--border-color', states: ['base', 'hover'] }
const base = { id: 'base', tag: property.tag, name: property.name, state: 'base', browsers: ['chromium', 'firefox', 'webkit'] }
const hover = { id: 'hover', tag: property.tag, name: property.name, state: 'hover', browsers: ['chromium'] }

test('requires an exact case for every tag, property, and applicable state', () => {
  assert.deepEqual(reconcileCaseCoverage([property], [base, hover]), [])
  assert.deepEqual(
    reconcileCaseCoverage([property], [base]).map(({ state }) => state),
    ['hover'],
  )
  assert.ok(reconcileCaseCoverage([property], [{ ...base, name: '--c2-example--other' }, hover]).some(({ category }) => category === 'stale-case'))
})

test('generated-family reuse requires identical styling-path identity and static contract success', () => {
  const feather = [
    { tag: 'c2-feather-a', name: '--c2-feather-icon--size', states: ['base'], sharedStylingPath: 'feather-base', staticReady: true },
    { tag: 'c2-feather-b', name: '--c2-feather-icon--size', states: ['base'], sharedStylingPath: 'feather-base', staticReady: true },
  ]
  const sample = [
    { id: 'feather-size', tag: 'c2-feather-a', name: '--c2-feather-icon--size', state: 'base', sharedStylingPath: 'feather-base', browsers: ['chromium'] },
  ]
  assert.deepEqual(reconcileCaseCoverage(feather, sample), [])
  assert.ok(reconcileCaseCoverage([{ ...feather[0], staticReady: false }, feather[1]], sample).length)
  assert.ok(reconcileCaseCoverage([{ ...feather[0], sharedStylingPath: 'different' }, feather[1]], sample).length)
})

test('Chromium is exhaustive while Firefox and WebKit select representative cases', () => {
  assert.deepEqual(
    selectCasesForBrowser([base, hover], 'chromium').map(({ id }) => id),
    ['base', 'hover'],
  )
  assert.deepEqual(
    selectCasesForBrowser([base, hover], 'firefox').map(({ id }) => id),
    ['base'],
  )
  assert.deepEqual(
    selectCasesForBrowser([base, hover], 'webkit').map(({ id }) => id),
    ['base'],
  )
})

test('reviewed pseudo cases require an explicit pseudo selector', () => {
  const item = {
    ...base,
    context: 'example',
    value: 'red',
    target: 'c2-example .target',
    assertion: 'pseudo-style',
    declaration: 'color',
    reset: 'remove-property',
  }
  assert.throws(() => validateObservableCase(item), /pseudo/)
  assert.doesNotThrow(() => validateObservableCase({ ...item, pseudo: '::before' }))
  assert.throws(() => validateObservableCase({ ...item, pseudo: '::marker' }), /pseudo/)
})

test('geometry and programmatic cases declare the syntax of their custom-property value', () => {
  const item = { ...base, context: 'example', value: '37px', target: 'c2-example', assertion: 'geometry', reset: 'remove-property' }
  assert.throws(() => validateObservableCase(item), /valueSyntax/)
  assert.throws(() => validateObservableCase({ ...item, valueSyntax: 'width' }), /geometryMetric/)
  assert.doesNotThrow(() => validateObservableCase({ ...item, valueSyntax: 'width', geometryMetric: 'width' }))
  assert.throws(() => validateObservableCase({ ...item, valueSyntax: 'width', geometryMetric: 'depth' }), /geometryMetric/)
  assert.doesNotThrow(() =>
    validateObservableCase({ ...item, assertion: 'programmatic-output', value: 'red', valueSyntax: 'color', outputProbe: 'canvas-bitmap' }),
  )
  assert.throws(() => validateObservableCase({ ...item, assertion: 'programmatic-output', valueSyntax: 'color', outputProbe: 'svg-markup' }), /outputProbe/)
  assert.doesNotThrow(() =>
    validateObservableCase({ ...item, assertion: 'programmatic-output', valueSyntax: 'color', outputProbe: 'svg-bitmap', stabilityWindowMs: 250 }),
  )
})

test('context setup is declarative and cannot be silently ignored', () => {
  const context = { id: 'example', tag: 'c2-example', fixture: '<c2-example></c2-example>', settledWhen: 'c2-example' }
  assert.doesNotThrow(() =>
    validateReviewedContext({
      ...context,
      stateSetup: [{ target: 'c2-example', attribute: 'selected', value: '' }],
      dimensions: [{ target: 'c2-example', width: '123px' }],
      hoverTarget: 'c2-example .target',
    }),
  )
  assert.throws(() => validateReviewedContext({ ...context, stateSetup: 'selected' }), /stateSetup/)
  assert.throws(() => validateReviewedContext({ ...context, dimensions: '123px' }), /dimensions/)
  assert.throws(() => validateReviewedContext({ ...context, hoverTarget: '' }), /hoverTarget/)
})

test('the shared registry validator rejects malformed and stale cases before coverage is counted', () => {
  const context = { id: 'example', tag: property.tag, fixture: '<c2-example></c2-example>', settledWhen: 'c2-example' }
  const item = {
    ...base,
    context: context.id,
    value: 'red',
    target: 'c2-example .target',
    assertion: 'computed-style',
    declaration: 'border-color',
    reset: 'remove-property',
  }
  const registry = { schemaVersion: 1, contexts: [context], cases: [item] }
  assert.doesNotThrow(() => validateReviewedRegistry(registry, [property]))
  assert.throws(() => validateReviewedRegistry({ ...registry, cases: [{ ...item, context: 'absent' }] }, [property]), /missing context/)
  assert.throws(() => validateReviewedRegistry({ ...registry, cases: [{ ...item, assertion: 'pseudo-style' }] }, [property]), /pseudo/)
  assert.throws(() => validateReviewedRegistry({ ...registry, cases: [{ ...item, assertion: 'geometry', declaration: undefined }] }, [property]), /valueSyntax/)
  assert.throws(() => validateReviewedRegistry({ ...registry, contexts: [{ ...context, stateSetup: 'selected' }] }, [property]), /stateSetup/)
  assert.throws(() => validateReviewedRegistry({ ...registry, contexts: [{ ...context, dimensions: '123px' }] }, [property]), /dimensions/)
  assert.throws(() => validateReviewedRegistry({ ...registry, cases: [{ ...item, name: '--c2-example--stale' }] }, [property]), /stale case/)
})

test('a reviewed value syntax must agree with the published property type', () => {
  const item = {
    ...base,
    context: 'example',
    value: 'red',
    valueSyntax: 'color',
    target: 'c2-example .target',
    assertion: 'computed-style',
    declaration: 'background-image',
    reset: 'remove-property',
  }
  assert.throws(() => validateObservableCase(item, { type: 'pixel' }), /valueSyntax/)
  assert.doesNotThrow(() => validateObservableCase(item, { type: 'color' }))
  assert.throws(() => validateObservableCase({ ...item, valueSyntax: undefined, declaration: 'color' }, { type: 'pixel' }), /published type/)
  assert.doesNotThrow(() =>
    validateObservableCase(
      { ...item, valueSyntax: undefined, declaration: 'background-image', syntaxRationale: 'The color is embedded in a gradient.' },
      { type: 'color' },
    ),
  )
})

test('a reviewed control value is distinct, literal, and bound to the published syntax', () => {
  const item = {
    ...base,
    context: 'example',
    value: 'center',
    controlValue: 'flex-end',
    target: 'c2-example .target',
    assertion: 'computed-style',
    declaration: 'justify-content',
    reset: 'remove-property',
  }
  assert.doesNotThrow(() => validateObservableCase(item, { type: 'justify-content' }))
  assert.throws(() => validateObservableCase({ ...item, controlValue: 'center' }, { type: 'justify-content' }), /controlValue/)
  assert.throws(() => validateObservableCase({ ...item, controlValue: 'var(--other)' }, { type: 'justify-content' }), /controlValue/)
  assert.throws(() => validateObservableCase({ ...item, declaration: 'font-style' }, { type: 'justify-content' }), /published type/)
})

test('the shared registry validator enforces browser, assertion, reset, and field semantics', () => {
  const context = { id: 'example', tag: property.tag, fixture: '<c2-example></c2-example>', settledWhen: 'c2-example' }
  const item = {
    ...base,
    context: context.id,
    value: 'red',
    target: 'c2-example .target',
    assertion: 'computed-style',
    declaration: 'border-color',
    reset: 'remove-property',
  }
  const registry = { schemaVersion: 1, contexts: [context], cases: [item] }
  for (const [field, value, message] of [
    ['assertion', 'anything', /assertion/],
    ['browsers', [], /browsers/],
    ['browsers', ['firefox'], /chromium/],
    ['reset', 'leave-property', /reset/],
    ['target', '', /target/],
    ['state', '', /state/],
    ['undeclaredField', true, /undeclaredField/],
  ]) {
    assert.throws(() => validateReviewedRegistry({ ...registry, cases: [{ ...item, [field]: value }] }, [property]), message)
  }
  assert.throws(() => validateReviewedRegistry({ ...registry, contexts: [{ ...context, unexpected: true }] }, [property]), /unexpected/)
  assert.throws(() => validateReviewedRegistry({ ...registry, cases: [{ ...item, stabilityWindowMs: -1 }] }, [property]), /stabilityWindowMs/)
})
