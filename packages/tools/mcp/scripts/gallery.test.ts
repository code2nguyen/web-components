import assert from 'node:assert/strict'
import test from 'node:test'

import { themeExampleCss } from './gallery.ts'

const theme = (css: string, neutrals: 'all' | 'tinted-blocks' = 'all') => themeExampleCss(css, [], { neutrals }).css

/** The `light-dark(<light>, <dark>)` pair a declaration was given. */
function pairOf(css: string, name: string): [string, string] {
  const match = new RegExp(`${name}: light-dark\\((#[0-9a-f]{6}), (#[0-9a-f]{6})\\)`).exec(css)
  assert.ok(match, `${name} is not a light-dark() pair in ${css}`)
  return [match[1], match[2]]
}

const rgb = (hex: string) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16))
function contrast(a: string, b: string): number {
  const luminance = (hex: string) => {
    const [r, g, b] = rgb(hex).map((channel) => {
      const c = channel / 255
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

test('a tint becomes a light-dark() pair: the authored tint, then a dark wash of its hue', () => {
  const [light, dark] = pairOf(theme('.a { --c2-x__option--background: #f3e8ff; }'), '--c2-x__option--background')
  assert.equal(light, '#f3e8ff')
  const [r, g, b] = rgb(dark)
  assert.ok(b > r && r > g && Math.max(r, g, b) < 90, `a dark purple, got ${dark}`)
})

test('accent text next to a tint keeps its authored colour in light and reads on the dark wash', () => {
  const css = theme('.a { --c2-x__option--background: #f3e8ff; --c2-x__option--color: #7e22ce; }')
  const [, wash] = pairOf(css, '--c2-x__option--background')
  const [light, dark] = pairOf(css, '--c2-x__option--color')
  assert.equal(light, '#7e22ce')
  assert.ok(contrast(dark, wash) >= 4.5, `${dark} on ${wash}`)
  assert.ok(contrast(dark, '#18181b') >= 4.5, `${dark} on the dark surface`)
})

test('a pale blue counts as a tint even though its channels are only 16 apart', () => {
  assert.deepEqual(pairOf(theme('.a { --c2-x--background: #eff6ff; }'), '--c2-x--background')[0], '#eff6ff')
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

test('a second run is a no-op, and themes the text of a tint the first run already paired', () => {
  const once = theme('.a { --c2-x--background: #f3e8ff; --c2-x__theme--token-keyword: #5f6e00; }', 'tinted-blocks')
  assert.equal(theme(once, 'tinted-blocks'), once)
  const partial = '.a { --c2-x--background: light-dark(#f3e8ff, #26153c); --c2-x__theme--token-keyword: #5f6e00; }'
  assert.equal(pairOf(theme(partial, 'tinted-blocks'), '--c2-x__theme--token-keyword')[0], '#5f6e00')
})

test('a pair an author tuned by hand is left as written', () => {
  const tuned = '.a { --c2-x--background: light-dark(#f3e8ff, #3b0764); --c2-x--color: light-dark(#7e22ce, #e9d5ff); }'
  assert.equal(theme(tuned, 'tinted-blocks'), tuned)
})

test('a fill part named …--color is not text: a tab indicator is not lightened for dark mode', () => {
  const css = '.a { --c2-tabs--background-color: #fef3c7; --c2-tabs__indicator--color: #f59e0b; --c2-tabs__tab--color: #b45309; }'
  const out = theme(css, 'tinted-blocks')
  assert.match(out, /--c2-tabs__indicator--color: #f59e0b;/)
  assert.equal(pairOf(out, '--c2-tabs__tab--color')[0], '#b45309')
})

test('a tint that is exactly a theme role stays that role, so an app theme still restyles it', () => {
  const tokens = [{ name: '--c2-theme--color-primary-container', light: '#edf1fe', dark: '#0f2d5c' }]
  assert.equal(
    themeExampleCss('.a { --c2-x__tag--background: #edf1fe; }', tokens, { neutrals: 'tinted-blocks' }).css,
    '.a { --c2-x__tag--background: var(--c2-theme--color-primary-container, #edf1fe); }',
  )
})
