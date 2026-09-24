import assert from 'node:assert/strict'
import { test } from 'node:test'
import { classifyComposedCssRead, classifyNonCssConsumers } from './lib/style-contract-consumers.mjs'
import { compareCompiledDefaults, compiledFallbacks, resolveEffectiveDefaults } from './lib/style-contract-defaults.mjs'

test('programmatic read needs reviewed downstream output, not a bare getPropertyValue', () => {
  const source = "const color = getComputedStyle(this).getPropertyValue('--c2-chart--color')"
  const properties = ['--c2-chart--color']
  assert.deepEqual(classifyNonCssConsumers({ tag: 'c2-chart', source, sourceFile: 'src/chart.ts', properties, mappings: [] }), [])
  const paths = classifyNonCssConsumers({
    tag: 'c2-chart',
    source,
    sourceFile: 'src/chart.ts',
    properties,
    mappings: [{ tag: 'c2-chart', name: properties[0], mode: 'programmatic', target: 'canvas plot color', sink: 'engine.updateTheme' }],
  })
  assert.equal(paths[0].target, 'canvas plot color')
})

test('inline style and delegated child need exact reviewed target mappings', () => {
  const properties = ['--c2-parent--color', '--c2-parent--size']
  const paths = classifyNonCssConsumers({
    tag: 'c2-parent',
    source: 'style="color: var(--c2-parent--color)"; child.style.setProperty("--c2-child--size", "var(--c2-parent--size)")',
    sourceFile: 'src/parent.ts',
    properties,
    mappings: [
      { tag: 'c2-parent', name: properties[0], mode: 'inline-style', target: 'rendered text color', sink: 'style.color' },
      {
        tag: 'c2-parent',
        name: properties[1],
        mode: 'delegated',
        target: 'child size',
        childTag: 'c2-child',
        childProperty: '--c2-child--size',
        targetHost: 'child',
      },
    ],
  })
  assert.deepEqual(
    paths.map(({ mode }) => mode),
    ['inline-style', 'delegated'],
  )
})

test('foreign CSS reads require a declared internal child and an exact published or produced variable', () => {
  const child = {
    tag: 'c2-child',
    declaration: { cssProperties: [{ name: '--c2-child--color' }] },
    source: "this.style.setProperty('--c2-child--available-height', '120px')",
  }
  const parent = { tag: 'c2-parent', declaration: { internalComponents: ['c2-child'] } }
  const children = new Map([[child.tag, child]])
  assert.equal(classifyComposedCssRead({ parent, name: '--c2-child--color', children })?.mode, 'composed-child-public')
  assert.equal(classifyComposedCssRead({ parent, name: '--c2-child--available-height', children })?.mode, 'composed-child-output')
  assert.equal(classifyComposedCssRead({ parent, name: '--c2-child--not-produced', children }), null)
  assert.equal(classifyComposedCssRead({ parent: { ...parent, declaration: {} }, name: '--c2-child--color', children }), null)
  assert.equal(classifyComposedCssRead({ parent, name: '--c2-other--color', children }), null)
  assert.equal(classifyComposedCssRead({ parent, name: '--c2-child--available-width', children }), null)
})

test('defaults retain authored and effective values and reject unresolved or cyclic references', () => {
  const defaults = resolveEffectiveDefaults([
    { name: '--c2-example--base', authoredDefault: 'red', fallbackReferences: [] },
    { name: '--c2-example--accent', authoredDefault: null, fallbackReferences: ['--c2-example--base'] },
  ])
  assert.deepEqual(defaults.get('--c2-example--accent'), { authored: null, effective: 'red' })
  assert.throws(
    () => resolveEffectiveDefaults([{ name: '--c2-example--accent', authoredDefault: null, fallbackReferences: ['--c2-example--missing'] }]),
    /unresolved/i,
  )
  assert.throws(
    () =>
      resolveEffectiveDefaults([
        { name: '--c2-example--a', authoredDefault: null, fallbackReferences: ['--c2-example--b'] },
        { name: '--c2-example--b', authoredDefault: null, fallbackReferences: ['--c2-example--a'] },
      ]),
    /cyclic/i,
  )
})

test('compiled default comparison follows a nested public fallback to its terminal literal', () => {
  const base = '--c2-example--base-color'
  const hover = '--c2-example__hover--color'
  const value = `var(${hover},var(${base},rgb(2, 101, 220)))`
  assert.deepEqual(compiledFallbacks(value, hover), [`var(${base},rgb(2, 101, 220))`])
  const failures = compareCompiledDefaults({
    tag: 'c2-example',
    properties: [
      { name: base, type: 'color', default: 'rgb(2, 101, 220)' },
      { name: hover, type: 'color', default: '#0265dc' },
    ],
    paths: [
      { name: base, source: 'example.scss:1', value: `var(${base},rgb(2, 101, 220))`, fallbackOrder: [base] },
      { name: hover, source: 'example.scss:2', value, fallbackOrder: [hover, base] },
    ],
  })
  assert.deepEqual(failures, [])
})
