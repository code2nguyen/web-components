import assert from 'node:assert/strict'
import { test } from 'node:test'
import { THEME_LAYER, renderBaseCss, renderTokensCss } from './emit.ts'
import type { TokenDef } from '../../src/tokens.ts'

const tokens = [{ name: '--c2-theme--color-primary', light: '#2563eb', dark: '#60a5fa' }] as TokenDef[]

/** Strips comments, then checks every rule sits inside one `@layer` block that closes at the end of the file. */
function assertWhollyLayered(css: string): void {
  const code = css.replace(/\/\*[\s\S]*?\*\//g, '').trim()
  assert.ok(code.startsWith(`@layer ${THEME_LAYER} {`), code)
  assert.ok(code.endsWith('}'))
  let depth = 0
  for (let i = code.indexOf('{'); i < code.length; i++) {
    if (code[i] === '{') depth++
    else if (code[i] === '}' && --depth === 0) assert.equal(i, code.length - 1, 'the layer closes before the last rule')
  }
}

test('tokens.css keeps every rule, the OS dark fallback included, inside the theme layer', () => {
  const css = renderTokensCss(tokens)
  assertWhollyLayered(css)
  assert.match(css, /@media \(prefers-color-scheme: dark\)/)
})

test('base.css keeps the component mapping inside the theme layer', () => {
  const css = renderBaseCss([
    {
      cssVar: { pkg: '@c2n/button', name: '--c2-button__container--background-color' },
      result: { kind: 'mapped', token: '--c2-theme--color-primary', value: 'var(--c2-theme--color-primary, #2563eb)', rule: 'R2' },
    },
  ] as Parameters<typeof renderBaseCss>[0])
  assertWhollyLayered(css)
  assert.match(css, /--c2-button__container--background-color: var\(--c2-theme--color-primary, #2563eb\);/)
})
