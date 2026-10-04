import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { closestCssVariable, documentedCssVariables, sourceFiles, unknownCssVariables } from './lib/css-contracts.mjs'

const documented = new Set(['--c2-button__container--height', '--c2-theme--color-primary'])

test('accepts documented component variables and theme tokens', () => {
  const source = `.action { --c2-button__container--height: 40px; color: var(--c2-theme--color-primary); }`
  assert.deepEqual(unknownCssVariables(source, documented), [])
})

test('reports an unknown c2n variable with its source line', () => {
  const source = `.action {\n  --c2-button__container--heigth: 40px;\n}`
  assert.deepEqual(unknownCssVariables(source, documented), [{ name: '--c2-button__container--heigth', line: 2 }])
})

test('suggests the nearest variable from the same component contract', () => {
  assert.equal(closestCssVariable('--c2-button__container--heigth', documented), '--c2-button__container--height')
  assert.equal(closestCssVariable('--c2-table--height', documented), undefined)
})

test('skips a family prefix written as a wildcard or a template expression', () => {
  const source = 'Set the `--c2-theme--chart-series-*` tokens, or `--c2-theme--chart-series-${index}` in code.'
  assert.deepEqual(unknownCssVariables(source, documented), [])
})

test('documents multi-line theme tokens and the variables a component writes on its host', () => {
  const root = mkdtempSync(join(tmpdir(), 'css-contracts-'))
  mkdirSync(join(root, 'packages/tools/theme/src'), { recursive: true })
  writeFileSync(join(root, 'packages/tools/theme/src/tokens.ts'), "token('color-primary', 'color', '#000', 'x'),\ntoken(\n  'color-on-fill',\n  'color',\n)")
  mkdirSync(join(root, 'packages/components/overlay/src'), { recursive: true })
  writeFileSync(join(root, 'packages/components/overlay/src/overlay.ts'), "this.style.setProperty('--c2-overlay--available-height', '1px')")
  const variables = documentedCssVariables(root)
  assert.ok(variables.has('--c2-theme--color-primary'))
  assert.ok(variables.has('--c2-theme--color-on-fill'))
  assert.ok(variables.has('--c2-overlay--available-height'))
})

test('leaves test files out of the consumer sources', () => {
  const root = mkdtempSync(join(tmpdir(), 'css-contracts-'))
  writeFileSync(join(root, 'app.css'), '')
  writeFileSync(join(root, 'app.test.ts'), '')
  assert.deepEqual(sourceFiles([root]), [join(root, 'app.css')])
})
