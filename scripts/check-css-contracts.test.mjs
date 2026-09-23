import assert from 'node:assert/strict'
import test from 'node:test'

import { closestCssVariable, unknownCssVariables } from './lib/css-contracts.mjs'

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
