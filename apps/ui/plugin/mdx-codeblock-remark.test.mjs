import assert from 'node:assert/strict'
import test from 'node:test'
import { scopeCss } from './mdx-codeblock-remark.mjs'

const S = '[data-uid="u"]'
const squash = (css) => css.replace(/\s+/g, ' ').trim()

test('prefixes class-led and tag-led selectors with the frame', () => {
  const css = scopeCss('.muted { --a: 1; }\n  c2-chip.person, kbd { --b: var(--c, #fff); }', S)
  assert.equal(squash(css), `${S} .muted { --a: 1; } ${S} c2-chip.person, ${S} kbd { --b: var(--c, #fff); }`)
})

test('keeps commas inside functional pseudo-classes', () => {
  assert.equal(squash(scopeCss(':is(.a, .b) c2-chip { x: 1 }', S)), `${S} :is(.a, .b) c2-chip { x: 1 }`)
})

test('scopes inside @media, leaves @keyframes alone and drops comments', () => {
  const css = scopeCss('/* note, with { */ @media (max-width: 560px) { .a { x: 1 } } @keyframes spin { from { r: 0 } to { r: 1 } }', S)
  assert.equal(squash(css), `@media (max-width: 560px) { ${S} .a { x: 1 } } @keyframes spin { from { r: 0 } to { r: 1 } }`)
})
