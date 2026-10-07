import AxeBuilder from '@axe-core/playwright'
import { test, expect } from './fixture'

const contentHeight = (page: import('@playwright/test').Page) =>
  page.locator('c2-truncate').evaluate((host) => host.shadowRoot!.querySelector<HTMLElement>('[part="content"]')!.getBoundingClientRect().height)

test('clamps long text to three lines by default and reports it as truncated', async ({ page, scenario }) => {
  await scenario()
  expect(await contentHeight(page)).toBe(72)
  await expect(page.locator('c2-truncate')).toHaveJSProperty('truncated', true)
  expect(await page.locator('c2-truncate').evaluate((host) => host.matches(':state(truncated)'))).toBe(true)
  await expect(page.getByRole('status')).toHaveText('truncated:true')
})

test('expands and collapses with the button, keeping the full text in the accessibility tree', async ({ page, scenario }) => {
  await scenario()
  const toggle = page.getByRole('button', { name: 'Show more' })
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(page.locator('c2-truncate')).toContainText('legacy plans is complete.')
  await toggle.click()
  const less = page.getByRole('button', { name: 'Show less' })
  await expect(less).toHaveAttribute('aria-expanded', 'true')
  await expect(page.locator('c2-truncate')).toHaveAttribute('expanded', '')
  expect(await contentHeight(page)).toBeGreaterThan(72)
  await less.click()
  await expect(page.getByRole('button', { name: 'Show more' })).toBeVisible()
  expect(await contentHeight(page)).toBe(72)
  await expect(page.getByRole('status')).toHaveText('truncated:true toggle:open toggle:closed')
})

test('the button is reachable and operable from the keyboard', async ({ page, scenario, tab }) => {
  await scenario()
  await page.locator('#before').focus()
  await tab()
  const toggle = page.getByRole('button', { name: 'Show more' })
  await expect(toggle).toBeFocused()
  await expect(toggle).toHaveCSS('outline-style', 'solid')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: 'Show less' })).toBeFocused()
  await page.keyboard.press('Space')
  await expect(page.getByRole('button', { name: 'Show more' })).toBeFocused()
  await tab()
  await expect(page.locator('#after')).toBeFocused()
})

test('text that fits gets no button and no tab stop', async ({ page, scenario, tab }) => {
  await scenario('short')
  await expect(page.locator('c2-truncate')).toHaveJSProperty('truncated', false)
  await expect(page.locator('c2-truncate').getByRole('button')).toHaveCount(0)
  await page.locator('#before').focus()
  await tab()
  await expect(page.locator('#after')).toBeFocused()
})

test('offers the button once the text grows past the clamp', async ({ page, scenario }) => {
  await scenario('short')
  await page.locator('#after').click()
  await expect(page.getByRole('button', { name: 'Show more' })).toBeVisible()
  await expect(page.getByRole('status')).toHaveText('truncated:true')
})

test('the line count is a CSS variable', async ({ page, scenario }) => {
  await scenario('single-line')
  expect(await contentHeight(page)).toBe(24)
  await expect(page.locator('c2-truncate')).toHaveJSProperty('truncated', true)
  await page.locator('c2-truncate').evaluate((host) => host.style.setProperty('--c2-truncate__content--line-clamp', '2'))
  expect(await contentHeight(page)).toBe(48)
})

test('starts expanded and uses custom labels', async ({ page, scenario }) => {
  await scenario('expanded')
  await expect(page.getByRole('button', { name: 'Show less' })).toBeVisible()
  await scenario('labels')
  await page.getByRole('button', { name: 'Read more' }).click()
  await expect(page.getByRole('button', { name: 'Read less' })).toBeVisible()
})

test('writes no attribute on the host it was not given', async ({ page, scenario }) => {
  await scenario()
  expect(await page.locator('c2-truncate').evaluate((host) => host.getAttributeNames().sort())).toEqual(['class', 'expandable', 'id'])
})

for (const state of ['default', 'single-line', 'expanded']) {
  test(`${state} has no axe violations`, async ({ page, scenario }) => {
    await scenario(state)
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    expect(results.violations).toEqual([])
  })
}

test('the button points at the content by an id that does not vary per instance', async ({ page, scenario }) => {
  // A per-instance id differs between a server render and the client, and hydration keeps the server's.
  await scenario()
  expect(await page.locator('c2-truncate').evaluate((host) => host.shadowRoot!.querySelector('button')!.getAttribute('aria-controls'))).toBe('content')
  expect(await page.locator('c2-truncate').evaluate((host) => host.shadowRoot!.getElementById('content')?.getAttribute('part'))).toBe('content')
})
