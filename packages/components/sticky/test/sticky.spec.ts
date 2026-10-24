import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { test, expect } from './fixture'

const hasState = (page: Page, state: string) => page.locator('c2-sticky').evaluate((el, name) => el.matches(`:state(${name})`), state)

async function wheel(page: Page, deltaY: number, target = '.scroller') {
  await page.locator(target).first().hover()
  await page.mouse.wheel(0, deltaY)
}

test('is not stuck while it rests in the flow, and sticks once content scrolls beneath it', async ({ page, scenario }) => {
  await scenario()
  const sticky = page.locator('c2-sticky')
  await expect(sticky).toHaveCSS('position', 'sticky')
  expect(await hasState(page, 'stuck')).toBe(false)

  await wheel(page, 400)
  await expect.poll(() => hasState(page, 'stuck')).toBe(true)
  await expect(page.locator('#log')).toHaveAttribute('data-stuck', 'true')
  await expect(page.locator('[part="surface"]')).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  expect(await sticky.evaluate((el: HTMLElementTagNameMap['c2-sticky']) => el.stuck)).toBe(true)
  // Pinned to the top of the scroll container.
  const [box, scroller] = await Promise.all([sticky.boundingBox(), page.locator('.scroller').boundingBox()])
  expect(Math.abs(box!.y - scroller!.y - 1)).toBeLessThanOrEqual(1)

  await wheel(page, -2000)
  await expect.poll(() => hasState(page, 'stuck')).toBe(false)
  await expect(page.locator('#log')).toHaveAttribute('data-stuck', 'false')
})

test('keeps the offset from the edge', async ({ page, scenario }) => {
  await scenario('offset')
  await wheel(page, 400)
  await expect.poll(() => hasState(page, 'stuck')).toBe(true)
  const [box, scroller] = await Promise.all([page.locator('c2-sticky').boundingBox(), page.locator('.scroller').boundingBox()])
  expect(Math.abs(box!.y - scroller!.y - 1 - 24)).toBeLessThanOrEqual(1)
})

test('sticks to the bottom edge until the end of the content is reached', async ({ page, scenario }) => {
  await scenario('bottom')
  await expect.poll(() => hasState(page, 'stuck')).toBe(true)
  await wheel(page, 5000)
  await expect.poll(() => hasState(page, 'stuck')).toBe(false)
  await wheel(page, -200)
  await expect.poll(() => hasState(page, 'stuck')).toBe(true)
})

test('is never stuck when stickiness is turned off through CSS', async ({ page, scenario }) => {
  await scenario('static')
  await expect(page.locator('c2-sticky')).toHaveCSS('position', 'static')
  await wheel(page, 400)
  await expect(page.getByText('Body paragraph 1.', { exact: false })).toBeVisible()
  expect(await hasState(page, 'stuck')).toBe(false)
  await expect(page.locator('#log')).not.toHaveAttribute('data-stuck')
})

test('hide-on-scroll retracts while scrolling down and returns on the way up', async ({ page, scenario }) => {
  await scenario('hide')
  await wheel(page, 300)
  await expect.poll(() => hasState(page, 'stuck')).toBe(true)
  await wheel(page, 100)
  await expect.poll(() => hasState(page, 'retracted')).toBe(true)
  await expect(page.locator('#log')).toHaveAttribute('data-retracted', 'true')
  await expect(page.getByRole('button', { name: 'Bold' })).not.toBeInViewport()

  await wheel(page, -60)
  await expect.poll(() => hasState(page, 'retracted')).toBe(false)
  await expect(page.locator('#log')).toHaveAttribute('data-retracted', 'false')
  await expect(page.getByRole('button', { name: 'Bold' })).toBeInViewport()
})

test('hide-on-scroll brings the content back when focus moves into it', async ({ page, scenario }) => {
  await scenario('hide')
  await wheel(page, 300)
  await wheel(page, 100)
  await expect.poll(() => hasState(page, 'retracted')).toBe(true)
  await page.locator('.scroller').focus()
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'Bold' })).toBeFocused()
  await expect.poll(() => hasState(page, 'retracted')).toBe(false)
})

test('a single fast scroll that pins the content does not also hide it', async ({ page, scenario }) => {
  await scenario('hide')
  await wheel(page, 400)
  await expect.poll(() => hasState(page, 'stuck')).toBe(true)
  expect(await hasState(page, 'retracted')).toBe(false)
  await expect(page.getByRole('button', { name: 'Bold' })).toBeInViewport()
})

test('sticks within a scroll box that a parent renders in its shadow root after the content connects', async ({ page, scenario }) => {
  await scenario('shadow')
  await wheel(page, 400, 'scenario-panel')
  await expect.poll(() => hasState(page, 'stuck')).toBe(true)
})

test('sticks when the body is the scroller', async ({ page, scenario }) => {
  await scenario('body')
  await page.mouse.move(200, 200)
  await page.mouse.wheel(0, 400)
  await expect.poll(() => hasState(page, 'stuck')).toBe(true)
})

test('notices content that arrives without a scroll', async ({ page, scenario }) => {
  await scenario('grow')
  expect(await hasState(page, 'stuck')).toBe(false)
  await page.getByRole('button', { name: 'Load more' }).click()
  await expect.poll(() => hasState(page, 'stuck')).toBe(true)
  await expect(page.locator('#log')).toHaveAttribute('data-stuck', 'true')
})

for (const state of ['default', 'hide']) {
  test(`${state} has no axe violations`, async ({ page, scenario }) => {
    await scenario(state)
    await wheel(page, 400)
    const results = await new AxeBuilder({ page }).include('main').analyze()
    expect(results.violations).toEqual([])
  })
}
