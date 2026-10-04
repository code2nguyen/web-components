import assert from 'node:assert/strict'
import test from 'node:test'

import { themeExampleCss } from './gallery.ts'

const PAPER = 'var(--c2-theme--color-surface, #ffffff)'
const INK = 'var(--c2-theme--color-on-surface, #18181b)'
const theme = (css: string, neutrals: 'all' | 'tinted-blocks' = 'all') => themeExampleCss(css, [], { neutrals }).css

/** The colour a `color-mix(in srgb, #base N%, var(--x, #fallback))` renders under the light theme. */
function lightValue(value: string): number[] {
  const match = /color-mix\(in srgb, #([0-9a-f]{6}) (\d+)%, var\([^,]+, #([0-9a-f]{6})\)\)/.exec(value)
  assert.ok(match, `not a colour mix: ${value}`)
  const channels = (hex: string) => [0, 2, 4].map((at) => parseInt(hex.slice(at, at + 2), 16))
  const share = Number(match[2]) / 100
  const base = channels(match[1])
  return channels(match[3]).map((other, index) => Math.round(base[index] * share + other * (1 - share)))
}

test('a tint becomes a share of its hue over paper that renders the authored tint on light paper', () => {
  const css = theme('.a { --c2-x__option--background: #f3e8ff; }')
  assert.match(css, new RegExp(`color-mix\\(in srgb, #[0-9a-f]{6} \\d+%, ${PAPER.replace(/[()]/g, '\\$&')}\\)`))
  const [r, g, b] = lightValue(css)
  assert.ok(Math.abs(r - 0xf3) <= 1 && Math.abs(g - 0xe8) <= 1 && Math.abs(b - 0xff) <= 1, `${r},${g},${b}`)
})

test('accent text next to a tint mixes over ink and keeps the authored colour on light paper', () => {
  const css = theme('.a { --c2-x__option--background: #eff6ff; --c2-x__option--color: #1e40af; }')
  const text = /--c2-x__option--color: ([^;]+);/.exec(css)![1]
  assert.ok(text.endsWith(`${INK})`), text)
  const [r, g, b] = lightValue(text)
  assert.ok(Math.abs(r - 0x1e) <= 2 && Math.abs(g - 0x40) <= 2 && Math.abs(b - 0xaf) <= 2, `${r},${g},${b}`)
})

test('a bright accent keeps its hue a shade deeper in light, so dark mode has room to lighten it', () => {
  const css = theme('.a { --c2-x__option--background: #f3e8ff; --c2-x__option--color: #7e22ce; }')
  const [r, g, b] = lightValue(/--c2-x__option--color: ([^;]+);/.exec(css)![1])
  assert.ok(b > r && r > g && b <= 0xce && b >= 0xa0, `${r},${g},${b}`)
})

test('accent text away from a tint stays literal: its background may be one the component computes', () => {
  assert.equal(theme('.a { --c2-x__item--color: rgb(2, 101, 220); }'), '.a { --c2-x__item--color: rgb(2, 101, 220); }')
})

test('a block designed dark, or one painting a strong colour, keeps its literals', () => {
  const terminal = '.t { --c2-x--background: #121212; --c2-x--color: #d8d8c0; --c2-x__gutter--color: #808078; }'
  assert.equal(theme(terminal), terminal)
  const chip = '.c { background: #3730a3; color: #eef2ff; border: 1px solid #e0e7ff; }'
  assert.equal(theme(chip), chip)
})

test('a translucent light surface keeps a tinted block literal, since what is under it may not flip', () => {
  const css = '.a { --c2-x--background: rgba(255, 255, 255, 0.62); --c2-x--border: 1px solid #e4ddd0; --c2-x--color: #6f6353; }'
  assert.equal(theme(css, 'tinted-blocks'), css)
})

test('tinted-blocks leaves greys alone outside a tinted block and themes them inside one', () => {
  assert.equal(theme('.a { --c2-x--color: #18181b; }', 'tinted-blocks'), '.a { --c2-x--color: #18181b; }')
  assert.match(
    theme('.a { --c2-x--background: #eff6ff; --c2-x--color: #3f3f46; }', 'tinted-blocks'),
    /--c2-x--color: color-mix\(in srgb, var\(--c2-theme--color-on-surface/,
  )
})

test('a second run is a no-op, and themes the text of a tint the first run already wrote', () => {
  const once = theme('.a { --c2-x--background: #f3e8ff; --c2-x__theme--token-keyword: #5f6e00; }', 'tinted-blocks')
  assert.equal(theme(once, 'tinted-blocks'), once)
  const partial = `.a { --c2-x--background: color-mix(in srgb, #8719ff 10%, ${PAPER}); --c2-x__theme--token-keyword: #5f6e00; }`
  assert.match(theme(partial, 'tinted-blocks'), /token-keyword: color-mix\(in srgb, #[0-9a-f]{6} \d+%, var\(--c2-theme--color-on-surface/)
})
