import assert from 'node:assert/strict'
import test from 'node:test'

import { formatLightDark, parseLightDark } from './css-value.ts'

test('parseLightDark returns both halves of a light-dark() colour as written', () => {
  assert.deepEqual(parseLightDark('light-dark(#f3e8ff, #26153c)'), ['#f3e8ff', '#26153c'])
  assert.deepEqual(parseLightDark(' light-dark(rgb(1, 2, 3), rgba(4, 5, 6, 0.5)) '), ['rgb(1, 2, 3)', 'rgba(4, 5, 6, 0.5)'])
})

test('parseLightDark rejects anything that is not a two-colour pair', () => {
  assert.equal(parseLightDark('#f3e8ff'), null)
  assert.equal(parseLightDark('light-dark(#fff)'), null)
  assert.equal(parseLightDark('var(--c2-theme--color-surface, light-dark(#fff, #000))'), null)
})

test('formatLightDark round-trips', () => {
  assert.deepEqual(parseLightDark(formatLightDark('#ffffff', '#18181b')), ['#ffffff', '#18181b'])
})
