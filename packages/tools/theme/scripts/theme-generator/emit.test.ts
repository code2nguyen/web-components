import assert from 'node:assert/strict'
import { test } from 'node:test'
import { THEME_LAYER, renderBaseCss, renderTokensCss } from './emit.ts'
import type { TokenDef } from '../../src/tokens.ts'

const tokens = [{ name: '--c2-theme--color-primary', light: '#2563eb', dark: '#60a5fa' }] as TokenDef[]

/** Splits `css` (comments stripped) into the body of the theme layer and everything outside it; braces must balance. */
function splitLayer(css: string): { inside: string; outside: string } {
  const code = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const open = `@layer ${THEME_LAYER} {`
  const start = code.indexOf(open)
  assert.notEqual(start, -1, 'no theme layer')
  assert.equal(code.indexOf(open, start + 1), -1, 'more than one theme layer')
  let depth = 1
  let end = start + open.length
  for (; end < code.length && depth > 0; end++) {
    if (code[end] === '{') depth++
    else if (code[end] === '}') depth--
  }
  assert.equal(depth, 0, 'the theme layer is never closed')
  const outside = code.slice(0, start) + code.slice(end)
  const balance = [...outside].reduce((n, ch) => n + (ch === '{' ? 1 : ch === '}' ? -1 : 0), 0)
  assert.equal(balance, 0, 'unbalanced braces outside the layer')
  return { inside: code.slice(start + open.length, end - 1), outside }
}

test('tokens.css keeps every token value, the OS dark fallback included, inside the theme layer', () => {
  const { inside, outside } = splitLayer(renderTokensCss(tokens))
  assert.doesNotMatch(outside, /--c2-theme--/)
  assert.match(inside, /--c2-theme--color-primary: #2563eb;/)
  assert.match(
    inside,
    /@media \(prefers-color-scheme: dark\)\s*\{\s*:root:not\(\[data-theme='light'\]\):not\(\.c2-light\)\s*\{\s*--c2-theme--color-primary: #60a5fa;/,
  )
})

test('tokens.css sets color-scheme outside the layer, so an app root rule cannot pin it to light', () => {
  const { inside, outside } = splitLayer(renderTokensCss(tokens))
  assert.doesNotMatch(inside, /^\s*color-scheme:/m)
  assert.match(outside, /\[data-theme='dark'\],\s*\.c2-dark\s*\{\s*color-scheme: dark;/)
  assert.match(outside, /:root:not\(\[data-theme='light'\]\):not\(\.c2-light\)\s*\{\s*color-scheme: dark;/)
})

test('base.css keeps the component mapping inside the theme layer', () => {
  const css = renderBaseCss([
    {
      cssVar: { pkg: '@c2n/button', name: '--c2-button__container--background-color' },
      result: { kind: 'mapped', token: '--c2-theme--color-primary', value: 'var(--c2-theme--color-primary, #2563eb)', rule: 'R2' },
    },
  ] as Parameters<typeof renderBaseCss>[0])
  const { inside, outside } = splitLayer(css)
  assert.equal(outside.trim(), '')
  assert.match(inside, /--c2-button__container--background-color: var\(--c2-theme--color-primary, #2563eb\);/)
})
