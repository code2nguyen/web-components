import AxeBuilder from '@axe-core/playwright'
import type { Locator } from '@playwright/test'
import type { MatchOptions, TextMatch } from '../src/find-matches'
import { test, expect } from './fixture'

const marks = (host: Locator) => host.evaluate((el) => Array.from(el.shadowRoot!.querySelectorAll('mark'), (mark) => mark.textContent))
// What the shadow root draws: the light DOM text stays in place but is not rendered.
const rendered = (host: Locator) => host.evaluate((el) => el.shadowRoot!.textContent)
const active = (host: Locator) => host.evaluate((el) => Array.from(el.shadowRoot!.querySelectorAll('[part~="active"]'), (mark) => mark.textContent))

test('marks every case-insensitive occurrence of the query and keeps the full text', async ({ page, scenario }) => {
  await scenario()
  const host = page.locator('c2-highlight')
  expect(await marks(host)).toEqual(['Apple', 'apple', 'apple'])
  expect(await rendered(host)).toBe('Apple pie, apple tart and pineapple crumble are on the café menu.')
  await expect(host).toHaveJSProperty('matchCount', 3)
  expect(await host.evaluate((el) => el.matches(':state(matched)'))).toBe(true)
  await expect(page.getByRole('status')).toHaveText('matches:3')
})

test('follows the query as the user types', async ({ page, scenario }) => {
  await scenario('search')
  const host = page.locator('c2-highlight')
  expect(await marks(host)).toEqual([])
  expect(await host.evaluate((el) => el.matches(':state(matched)'))).toBe(false)
  await page.getByLabel('Search').pressSequentially('pi')
  expect(await marks(host)).toEqual(['pi', 'pi'])
  await page.getByLabel('Search').pressSequentially('neapple')
  expect(await marks(host)).toEqual(['pineapple'])
  await page.getByLabel('Search').fill('')
  expect(await marks(host)).toEqual([])
  await expect(page.getByRole('status')).toHaveText('matches:8 matches:2 matches:1 matches:0')
})

test('match-case, whole-word, words and ignore-accents narrow or widen the match', async ({ page, scenario }) => {
  await scenario('match-case')
  expect(await marks(page.locator('c2-highlight'))).toEqual(['apple', 'apple'])
  await scenario('whole-word')
  expect(await marks(page.locator('c2-highlight'))).toEqual(['Apple', 'apple'])
  await scenario('words')
  expect(await marks(page.locator('c2-highlight'))).toEqual(['pie', 'crumble'])
  await scenario('accents')
  expect(await marks(page.locator('c2-highlight'))).toEqual(['café'])
})

test('an array assigned to query highlights each entry', async ({ page, scenario }) => {
  await scenario('array')
  expect(await marks(page.locator('c2-highlight'))).toEqual(['tart', 'menu'])
})

test('an empty query renders the text untouched', async ({ page, scenario }) => {
  await scenario('empty')
  const host = page.locator('c2-highlight')
  expect(await marks(host)).toEqual([])
  expect(await rendered(host)).toMatch(/^Apple pie/)
  await expect(host).toHaveJSProperty('matchCount', 0)
})

test('re-highlights when the light DOM text changes', async ({ page, scenario }) => {
  await scenario()
  await page.getByRole('button', { name: 'Change text' }).click()
  const host = page.locator('c2-highlight')
  await expect.poll(() => rendered(host)).toBe('An apple a day.')
  expect(await marks(host)).toEqual(['apple'])
  await expect(page.getByRole('status')).toHaveText('matches:3 matches:1')
})

test('active-index singles out one match and steps through them', async ({ page, scenario }) => {
  await scenario('active')
  const host = page.locator('c2-highlight')
  expect(await active(host)).toEqual(['apple'])
  expect(await host.evaluate((el) => el.shadowRoot!.querySelectorAll('mark')[1].getAttribute('part'))).toBe('mark active')
  const next = page.getByRole('button', { name: 'Next match' })
  await next.click()
  await expect(host).toHaveJSProperty('activeIndex', 2)
  expect(await active(host)).toEqual(['apple'])
  expect(await host.evaluate((el) => el.shadowRoot!.querySelectorAll('mark')[2].getAttribute('part'))).toBe('mark active')
  await next.click()
  expect(await active(host)).toEqual(['Apple'])
})

test('marks are themed through CSS variables', async ({ page, scenario }) => {
  await scenario('active')
  const host = page.locator('c2-highlight')
  const background = (index: number) => host.evaluate((el, i) => getComputedStyle(el.shadowRoot!.querySelectorAll('mark')[i]).backgroundColor, index)
  expect(await background(0)).toBe('rgba(250, 204, 21, 0.4)')
  expect(await background(1)).toBe('rgba(251, 146, 60, 0.6)')
  await host.evaluate((el) => {
    el.style.setProperty('--c2-highlight__mark--background-color', 'rgb(0, 128, 0)')
    el.style.setProperty('--c2-highlight__mark__active--background-color', 'rgb(0, 0, 255)')
  })
  expect(await background(0)).toBe('rgb(0, 128, 0)')
  expect(await background(1)).toBe('rgb(0, 0, 255)')
})

test('findMatches maps folded offsets back to the original text', async ({ page, scenario }) => {
  await scenario()
  const run = (text: string, query: string | string[], options: MatchOptions = {}) =>
    page.evaluate(
      ([t, q, o]) =>
        (window as unknown as { findMatches: (...args: unknown[]) => TextMatch[] }).findMatches(t, q, o).map(({ start, end }) => t.slice(start, end)),
      [text, query, options] as const,
    )
  // Decomposed accent (e + U+0301): the whole letter is marked, combining mark included.
  expect(await run('Café au lait', 'cafe', { ignoreAccents: true })).toEqual(['Café'])
  expect(await run('Crème brûlée', 'brulee', { ignoreAccents: true })).toEqual(['brûlée'])
  expect(await run('Crème brûlée', 'brulee')).toEqual([])
  // İ lower-cases to two code units; the offsets after it still line up.
  expect(await run('İstanbul and istanbul', 'stan')).toEqual(['stan', 'stan'])
  // The longest term wins where two start at the same place, and matches never overlap.
  expect(await run('pineapple', ['pine', 'pineapple', 'apple'])).toEqual(['pineapple'])
  expect(await run('aaaa', 'aa')).toEqual(['aa', 'aa'])
  expect(await run('emoji 😀 apple', 'apple')).toEqual(['apple'])
  expect(await run('regex a.b and axb', 'a.b')).toEqual(['a.b'])
  expect(await run('naïve naive', 'naive', { wholeWord: true, ignoreAccents: true })).toEqual(['naïve', 'naive'])
})

test('writes no attribute on the host it was not given', async ({ page, scenario }) => {
  await scenario()
  expect(await page.locator('c2-highlight').evaluate((host) => host.getAttributeNames().sort())).toEqual(['id', 'query'])
})

for (const state of ['default', 'active']) {
  test(`${state} has no axe violations`, async ({ page, scenario }) => {
    await scenario(state)
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    expect(results.violations).toEqual([])
  })
}
