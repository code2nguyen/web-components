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

test('position="top" sticks to the top edge while scrolling', async ({ page, scenario }) => {
  await scenario('positions')
  const top = page.locator('#top')
  await expect(top).toHaveCSS('position', 'sticky')
  await page.mouse.wheel(0, 800)
  await expect.poll(() => top.evaluate((el) => Math.round(el.getBoundingClientRect().top))).toBe(0)
  const container = top.locator('[part="container"]')
  await expect(container).toHaveCSS('border-top-width', '0px')
  await expect(container).toHaveCSS('border-bottom-width', '1px')
  await expect(container).toHaveCSS('border-top-left-radius', '0px')
})

test('position="bottom" is fixed to the bottom of the viewport across its full width', async ({ page, scenario }) => {
  await scenario('positions')
  const bottom = page.locator('#bottom')
  await expect(bottom).toHaveCSS('position', 'fixed')
  const viewport = page.viewportSize()!
  const box = await bottom.boundingBox()
  expect(Math.round(box!.y + box!.height)).toBe(viewport.height)
  expect(Math.round(box!.width)).toBe(viewport.width)
  await expect(bottom.locator('[part="container"]')).toHaveCSS('border-bottom-width', '0px')
  await expect(bottom.locator('[part="container"]')).toHaveCSS('border-top-width', '1px')
})

test('--c2-banner--offset moves a pinned banner off its edge', async ({ page, scenario }) => {
  await scenario('positions')
  const bottom = page.locator('#bottom')
  await bottom.evaluate((el) => (el as HTMLElement).style.setProperty('--c2-banner--offset', '16px'))
  const box = await bottom.boundingBox()
  expect(Math.round(box!.y + box!.height)).toBe(page.viewportSize()!.height - 16)
})
