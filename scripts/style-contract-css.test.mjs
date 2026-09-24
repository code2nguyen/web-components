import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolve } from 'node:path'
import {
  collectCssConsumers,
  collectSlottedForwardings,
  compileSass,
  findUnconsumedProperties,
  validatedSlottedForwardings,
} from './lib/style-contract-css.mjs'

test('compiled CSS records rendered selectors, declarations, and fallback order', () => {
  const css = '.target { border-left: var(--c2-example--border-left, var(--c2-example--border, 1px solid red)); }'
  const paths = collectCssConsumers(css, 'src/example.scss')
  assert.deepEqual(
    paths.map(({ name }) => name),
    ['--c2-example--border-left', '--c2-example--border'],
  )
  assert.deepEqual(paths[0].fallbackOrder, ['--c2-example--border-left', '--c2-example--border'])
  assert.equal(paths[0].selector, '.target')
  assert.equal(paths[0].declaration, 'border-left')
})

test('theme declaration without a rendered consumer remains unused', () => {
  const css = compileSass({ source: "@use '@c2n/sass/css-variable' as css with ($prefix: c2-example, $theme: (unused: red));", sourceFile: 'src/example.scss' })
  assert.deepEqual(collectCssConsumers(css, 'src/example.scss'), [])
  assert.deepEqual(findUnconsumedProperties(['--c2-example--unused'], []), ['--c2-example--unused'])
})

test('Sass expansion captures generated badge and step rules', () => {
  const badge = compileSass({ file: resolve('packages/components/badge/src/badge.scss') })
  const step = compileSass({ file: resolve('packages/components/steps/src/step.scss') })
  assert.ok(
    collectCssConsumers(badge, 'badge.scss').some(({ name, selector }) => name === '--c2-badge__primary--background' && selector.includes('[tone=primary]')),
  )
  assert.ok(collectCssConsumers(step, 'step.scss').some(({ name }) => name.startsWith('--c2-step__')))
})

test('raw var references are counted only when they occur in rendered declarations', () => {
  const css = ':host { color: var(--c2-example--color, red) }'
  assert.equal(collectCssConsumers(css, 'example.scss')[0].name, '--c2-example--color')
})

test('a private CSS alias counts only when it reaches a rendered declaration', () => {
  const css = ':host { --private-ink: var(--c2-example--color, red); --unused-ink: var(--c2-example--unused, blue) } .target { color: var(--private-ink) }'
  const paths = collectCssConsumers(css, 'example.scss')
  assert.deepEqual(
    paths.map((path) => path.name),
    ['--c2-example--color'],
  )
  assert.equal(paths[0].target, '.target color')
})

test('a consumed private alias cycle is rejected', () => {
  const css = '.target { --a: var(--b); --b: var(--a); color: var(--a) }'
  assert.throws(() => collectCssConsumers(css, 'example.scss'), /cyclic/i)
})

test('slotted child forwarding is recorded separately from a rendered CSS consumer', () => {
  const css = `::slotted(c2-details) {
    --c2-details--border-right: var(--c2-accordion--border-width, 1px) solid var(--c2-accordion--border-color, red);
  }
  :host { --c2-details--border-left: var(--c2-accordion--unused, blue) }`
  assert.deepEqual(collectCssConsumers(css, 'accordion.scss'), [])
  assert.deepEqual(
    collectSlottedForwardings(css, 'accordion.scss').map(({ name, childTag, childProperty }) => ({ name, childTag, childProperty })),
    [
      { name: '--c2-accordion--border-width', childTag: 'c2-details', childProperty: '--c2-details--border-right' },
      { name: '--c2-accordion--border-color', childTag: 'c2-details', childProperty: '--c2-details--border-right' },
    ],
  )
  const forwards = collectSlottedForwardings(css, 'accordion.scss')
  const childContracts = new Map([['c2-details', { documented: new Set(['--c2-details--border-right']), consumed: new Set(['--c2-details--border-right']) }]])
  assert.equal(validatedSlottedForwardings(forwards, childContracts).length, 2)
  childContracts.get('c2-details').consumed.clear()
  assert.deepEqual(validatedSlottedForwardings(forwards, childContracts), [])
})

test('link-button icon color falls back to the literal currentColor rather than a phantom public variable', () => {
  const css = compileSass({ file: resolve('packages/components/link-button/src/link-button.scss') })
  assert.match(css, /color: var\(--c2-link-button__icon--color,currentColor\)/)
  assert.ok(!collectCssConsumers(css, 'link-button.scss').some((path) => path.name.startsWith('--c2-link-button--current')))
})

test('shadow-only avatar hue and border-beam phase do not appear as public consumers', () => {
  for (const [component, privateName] of [
    ['avatar', '--_c2-avatar-hue'],
    ['border-beam', '--_c2-border-beam-phase'],
  ]) {
    const css = compileSass({ file: resolve(`packages/components/${component}/src/${component}.scss`) })
    assert.ok(css.includes(`var(${privateName},`))
    assert.ok(!collectCssConsumers(css, `${component}.scss`).some((path) => path.name === privateName))
  }
})
