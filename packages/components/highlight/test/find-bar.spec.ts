import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { test as fixtureBase } from '../../../../tests/fixture'

const test = fixtureBase.extend<{ scenario: (name?: string) => Promise<void> }>({
  scenario: async ({ page }, use) => {
    await use(async (name = 'default') => {
      await page.goto(`/packages/components/highlight/test/find-bar.html?scenario=${encodeURIComponent(name)}`)
      await expect(page.locator('main')).toHaveAttribute('data-ready', 'true')
    })
  },
})

/** The text of every mark in the target, `*` before the current one. */
const marks = (page: Page) =>
  page
    .locator('c2-highlight')
    .evaluateAll((hosts) =>
      hosts.flatMap((host) => Array.from(host.shadowRoot!.querySelectorAll('mark'), (mark) => (mark.part.contains('active') ? '*' : '') + mark.textContent)),
    )
const texts = (page: Page) => page.locator('c2-highlight').evaluateAll((hosts) => hosts.map((host) => host.textContent))
const events = (page: Page) => page.getByRole('status', { name: 'Events' })

test('typing marks every match of the target and counts them across highlights', async ({ page, scenario }) => {
  await scenario()
  const find = page.getByRole('textbox', { name: 'Find' })
  await expect(page.locator('c2-find-bar').getByRole('status')).toHaveText('')
  await find.pressSequentially('apple')
  await expect.poll(() => marks(page)).toEqual(['*Apple', 'apple', 'apple'])
  await expect(page.locator('c2-find-bar').getByRole('status')).toHaveText('1 of 3')
  await expect(page.locator('c2-find-bar')).toHaveJSProperty('matchCount', 3)
  await find.fill('cherry')
  await expect.poll(() => marks(page)).toEqual(['*Cherry'])
  await find.fill('plum')
  await expect(page.locator('c2-find-bar').getByRole('status')).toHaveText('No results')
  await expect(page.getByRole('button', { name: 'Next match' })).toBeDisabled()
})

test('Enter, Shift+Enter and the buttons step through the matches and wrap', async ({ page, scenario }) => {
  await scenario('value')
  const count = page.locator('c2-find-bar').getByRole('status')
  await expect(count).toHaveText('1 of 3')
  const find = page.getByRole('textbox', { name: 'Find' })
  await find.press('Enter')
  await expect.poll(() => marks(page)).toEqual(['Apple', '*apple', 'apple'])
  await find.press('Enter')
  await expect.poll(() => marks(page)).toEqual(['Apple', 'apple', '*apple'])
  await expect(count).toHaveText('3 of 3')
  await find.press('Enter')
  await expect(count).toHaveText('1 of 3')
  await find.press('Shift+Enter')
  await expect(count).toHaveText('3 of 3')
  await page.getByRole('button', { name: 'Previous match' }).click()
  await expect(count).toHaveText('2 of 3')
  await page.getByRole('button', { name: 'Next match' }).click()
  await expect(count).toHaveText('3 of 3')
  await expect(page.locator('c2-find-bar')).toHaveJSProperty('activeIndex', 2)
  await expect(events(page)).toHaveText('match:0/3 match:1/3 match:2/3 match:0/3 match:2/3 match:1/3 match:2/3')
})

test('the toggles and Alt+C / Alt+W set match case and whole word on the highlights', async ({ page, scenario }) => {
  await scenario('value')
  const matchCase = page.getByRole('button', { name: 'Match case' })
  await expect(matchCase).toHaveAttribute('aria-pressed', 'false')
  await matchCase.click()
  await expect(matchCase).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(() => marks(page)).toEqual(['*apple', 'apple'])
  await expect(page.locator('c2-highlight').nth(1)).toHaveJSProperty('matchCase', true)
  await page.getByRole('textbox', { name: 'Find' }).press('Alt+w')
  await expect(page.getByRole('button', { name: 'Match whole word' })).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(() => marks(page)).toEqual(['*apple'])
  await page.getByRole('textbox', { name: 'Find' }).press('Alt+c')
  await expect(matchCase).toHaveAttribute('aria-pressed', 'false')
  await expect.poll(() => marks(page)).toEqual(['*Apple', 'apple'])
})

test('Escape and the close button fire close and clear the highlights', async ({ page, scenario }) => {
  await scenario('value')
  await page.getByRole('textbox', { name: 'Find' }).press('Escape')
  await expect.poll(() => marks(page)).toEqual([])
  await expect(events(page)).toHaveText('match:0/3 close match:-1/0')
  await expect(page.getByRole('textbox', { name: 'Find' })).toHaveValue('apple')
  // focus() re-applies the query, as reopening a find bar does.
  await page.locator('c2-find-bar').evaluate((bar: HTMLElement) => bar.focus())
  await expect.poll(() => marks(page)).toEqual(['*Apple', 'apple', 'apple'])
  await expect(page.getByRole('textbox', { name: 'Find' })).toBeFocused()
  await page.getByRole('button', { name: 'Close' }).click()
  await expect.poll(() => marks(page)).toEqual([])
})

test('a cancelled close keeps the highlights', async ({ page, scenario }) => {
  await scenario('value')
  await page.locator('c2-find-bar').evaluate((bar) => bar.addEventListener('close', (event) => event.preventDefault()))
  await page.getByRole('textbox', { name: 'Find' }).press('Escape')
  await expect(events(page)).toHaveText('match:0/3 close')
  expect(await marks(page)).toEqual(['*Apple', 'apple', 'apple'])
})

test('replace and replace all fire replace; the bar recounts the text the app changed', async ({ page, scenario }) => {
  await scenario('replace')
  const count = page.locator('c2-find-bar').getByRole('status')
  await page.getByRole('textbox', { name: 'Find' }).press('Enter')
  await expect(count).toHaveText('2 of 3')
  await page.getByRole('button', { name: 'Replace', exact: true }).click()
  await expect.poll(() => texts(page)).toEqual(['Apple pie', 'Pinepear crumble with apple sauce', 'Cherry tart'])
  // The current match was the one replaced: the same position now points at the next match.
  await expect(count).toHaveText('2 of 2')
  await page.getByRole('textbox', { name: 'Replace with' }).fill('fig')
  await page.getByRole('textbox', { name: 'Replace with' }).press('ControlOrMeta+Enter')
  await expect.poll(() => texts(page)).toEqual(['fig pie', 'Pinepear crumble with fig sauce', 'Cherry tart'])
  await expect(count).toHaveText('No results')
  await expect(page.getByRole('button', { name: 'Replace all' })).toBeDisabled()
  // The second highlight's first match was the current one: `index` counts inside that highlight.
  await expect(events(page)).toHaveText('match:0/3 match:1/3 replace:0 match:1/2 replace:all match:-1/0')
})

test('drives a single c2-highlight given as the target', async ({ page, scenario }) => {
  await scenario('single')
  await expect(page.locator('c2-find-bar').getByRole('status')).toHaveText('1 of 3')
  await page.getByRole('button', { name: 'Next match' }).click()
  await expect.poll(() => marks(page)).toEqual(['The', '*the', 'the'])
})

test('a highlight added to the target is counted', async ({ page, scenario }) => {
  await scenario('value')
  await page.locator('#results').evaluate((list) => list.insertAdjacentHTML('beforeend', '<li><c2-highlight>Apple juice</c2-highlight></li>'))
  await page.getByRole('textbox', { name: 'Find' }).press('Enter')
  await expect(page.locator('c2-find-bar').getByRole('status')).toHaveText('2 of 4')
})

test('the actions slot shows only when filled', async ({ page, scenario }) => {
  await scenario('actions')
  const part = (bar: Element) => bar.shadowRoot!.querySelector('[part="actions"]')!.hasAttribute('hidden')
  expect(await page.locator('c2-find-bar').evaluate(part)).toBe(false)
  await expect(page.getByRole('button', { name: 'Filter' })).toBeVisible()
  await scenario('value')
  expect(await page.locator('c2-find-bar').evaluate(part)).toBe(true)
})

test('built-in text follows the nearest lang', async ({ page, scenario }) => {
  await scenario('french')
  await expect(page.getByRole('textbox', { name: 'Rechercher' })).toBeVisible()
  await expect(page.locator('c2-find-bar').getByRole('status')).toHaveText('1 sur 3')
})

test('writes no attribute on the host it was not given', async ({ page, scenario }) => {
  await scenario('value')
  await page.getByRole('button', { name: 'Next match' }).click()
  expect(await page.locator('c2-find-bar').evaluate((host) => host.getAttributeNames().sort())).toEqual(['for', 'value'])
})

for (const state of ['value', 'replace']) {
  test(`${state} has no axe violations`, async ({ page, scenario }) => {
    await scenario(state)
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    expect(results.violations).toEqual([])
  })
}
