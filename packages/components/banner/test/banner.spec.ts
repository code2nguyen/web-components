import AxeBuilder from '@axe-core/playwright'
import { test, expect } from './fixture'

for (const state of ['default', 'variants', 'dismissible', 'actions', 'no-icon']) {
  test(`${state} has no axe violations`, async ({ page, scenario }) => {
    await scenario(state)
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    expect(results.violations).toEqual([])
  })
}

test('renders the message and heading', async ({ page, scenario }) => {
  await scenario()
  await expect(page.locator('c2-banner')).toContainText('Scheduled maintenance on Sunday.')
  await expect(page.getByRole('button')).toHaveCount(0)
})

test('announces warning and error as alerts, the rest as status', async ({ page, scenario }) => {
  await scenario('variants')
  await expect(page.getByRole('status')).toHaveCount(3)
  await expect(page.getByRole('alert')).toHaveCount(2)
  await expect(page.getByRole('alert').first()).toContainText('A warning message.')
})

test('shows a variant icon unless no-icon is set', async ({ page, scenario }) => {
  await scenario()
  await expect(page.locator('c2-banner [part="icon"]')).toBeVisible()
  await scenario('no-icon')
  await expect(page.locator('c2-banner [part="icon"]')).toHaveCount(0)
})

test('the dismiss button hides the banner with a mouse', async ({ page, scenario }) => {
  await scenario('dismissible')
  await page.getByRole('button', { name: 'Dismiss notice' }).click()
  await expect(page.locator('c2-banner')).toBeHidden()
  await expect(page.locator('output')).toHaveText('1')
})

for (const key of ['Enter', 'Space']) {
  test(`the dismiss button is reachable by keyboard and activates with ${key}`, async ({ page, scenario, tab }) => {
    await scenario('dismissible')
    await page.getByRole('button', { name: 'Before' }).focus()
    await tab()
    const close = page.getByRole('button', { name: 'Dismiss notice' })
    await expect(close).toBeFocused()
    await expect(close).toHaveCSS('outline-style', 'solid')
    await tab()
    await expect(page.getByRole('button', { name: 'After' })).toBeFocused()
    await tab(true)
    await page.keyboard.press(key)
    await expect(page.locator('c2-banner')).toBeHidden()
    await expect(page.locator('output')).toHaveText('1')
  })
}

test('preventing banner-close keeps the banner visible', async ({ page, scenario }) => {
  await scenario('prevented')
  await page.getByRole('button', { name: 'Dismiss notice' }).click()
  await expect(page.locator('output')).toHaveText('1')
  await expect(page.locator('c2-banner')).toBeVisible()
})

test('renders slotted actions after the message', async ({ page, scenario }) => {
  await scenario('actions')
  await expect(page.locator('c2-banner [part="actions"]')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Upgrade' })).toBeVisible()
  await scenario()
  await expect(page.locator('c2-banner [part="actions"]')).toBeHidden()
})
