import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { test, expect } from './fixture'

const divider = (page: Page) => page.getByRole('separator', { name: 'Resize panels' })

/** Width (or height) of the start panel, read from its rendered box. */
const startSize = (page: Page, axis: 'width' | 'height' = 'width') =>
  page.locator('c2-split-panel [part="start"]').evaluate((element, key) => element.getBoundingClientRect()[key], axis)

async function drag(page: Page, toX: number, toY?: number) {
  const box = await divider(page).boundingBox()
  if (!box) throw new Error('Divider has no bounds')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  const host = await page.locator('c2-split-panel').boundingBox()
  if (!host) throw new Error('Host has no bounds')
  await page.mouse.move(host.x + toX, toY === undefined ? box.y + box.height / 2 : host.y + toY, { steps: 5 })
  await page.mouse.up()
}

test('splits the space evenly by default', async ({ page, scenario }) => {
  await scenario()
  await expect(divider(page)).toHaveAttribute('aria-valuenow', '50')
  await expect(divider(page)).toHaveAttribute('aria-orientation', 'vertical')
  // 600px host, 1px border each side, 1px divider → 597px shared.
  expect(await startSize(page)).toBeCloseTo(298.5, 0)
})

test('hides the divider and its grip until hovered', async ({ page, scenario }) => {
  await scenario()
  await expect(divider(page)).toHaveCSS('opacity', '0')
  await divider(page).hover()
  await expect(divider(page)).toHaveCSS('opacity', '1')
  await page.mouse.move(0, 0)
  await expect(divider(page)).toHaveCSS('opacity', '0')
})

test('dragging the divider resizes the panels and reports the position', async ({ page, scenario }) => {
  await scenario()
  await drag(page, 150)
  const value = Number(await divider(page).getAttribute('aria-valuenow'))
  expect(value).toBeGreaterThan(22)
  expect(value).toBeLessThan(27)
  expect(await startSize(page)).toBeLessThan(160)
  await expect(page.getByRole('status')).toHaveText(new RegExp(`:${value}$`))
  await expect(divider(page)).not.toBeFocused()
})

test('moves with the keyboard', async ({ page, scenario, tab }) => {
  await scenario()
  await page.getByRole('button', { name: 'Before' }).focus()
  await tab()
  await expect(divider(page)).toBeFocused()
  await expect(divider(page)).toHaveCSS('outline-style', 'none')
  await expect(divider(page)).toHaveCSS('background-color', 'rgb(2, 101, 220)')
  await expect(divider(page)).toHaveCSS('opacity', '1')
  await page.keyboard.press('ArrowRight')
  await expect(divider(page)).toHaveAttribute('aria-valuenow', '51')
  await page.keyboard.press('Shift+ArrowLeft')
  await expect(divider(page)).toHaveAttribute('aria-valuenow', '41')
  await page.keyboard.press('Home')
  await expect(divider(page)).toHaveAttribute('aria-valuenow', '0')
  await page.keyboard.press('End')
  await expect(divider(page)).toHaveAttribute('aria-valuenow', '100')
  await expect(page.getByRole('status')).toHaveText('4:100')
})

test('Enter collapses the start panel and restores it', async ({ page, scenario }) => {
  await scenario()
  await divider(page).focus()
  await page.keyboard.press('Shift+ArrowRight')
  await page.keyboard.press('Enter')
  await expect(divider(page)).toHaveAttribute('aria-valuenow', '0')
  expect(await startSize(page)).toBe(0)
  await page.keyboard.press('Enter')
  await expect(divider(page)).toHaveAttribute('aria-valuenow', '60')
})

test('stacks the panels when vertical', async ({ page, scenario }) => {
  await scenario('vertical')
  await expect(divider(page)).toHaveAttribute('aria-orientation', 'horizontal')
  await divider(page).focus()
  await page.keyboard.press('ArrowDown')
  await expect(divider(page)).toHaveAttribute('aria-valuenow', '51')
  await drag(page, 300, 60)
  const value = Number(await divider(page).getAttribute('aria-valuenow'))
  expect(value).toBeLessThan(25)
  expect(await startSize(page, 'height')).toBeLessThan(75)
})

test('clamps the position to min and max', async ({ page, scenario }) => {
  await scenario('bounded')
  await expect(divider(page)).toHaveAttribute('aria-valuemin', '20')
  await expect(divider(page)).toHaveAttribute('aria-valuemax', '70')
  await drag(page, 10)
  await expect(divider(page)).toHaveAttribute('aria-valuenow', '20')
  await drag(page, 590)
  await expect(divider(page)).toHaveAttribute('aria-valuenow', '70')
  await divider(page).focus()
  await page.keyboard.press('Home')
  await expect(divider(page)).toHaveAttribute('aria-valuenow', '20')
})

test('snaps to the listed positions while dragging', async ({ page, scenario }) => {
  await scenario('snap')
  await drag(page, 160)
  await expect(divider(page)).toHaveAttribute('aria-valuenow', '25')
})

test('disabled ignores pointer and keyboard and leaves the tab order', async ({ page, scenario, tab }) => {
  await scenario('disabled')
  await expect(divider(page)).toHaveAttribute('aria-disabled', 'true')
  await drag(page, 150)
  await expect(divider(page)).toHaveAttribute('aria-valuenow', '50')
  await page.getByRole('button', { name: 'Before' }).focus()
  await tab()
  await expect(divider(page)).not.toBeFocused()
  await expect(page.getByRole('status')).toHaveText('0')
})

test('the primary panel keeps its pixel size when the host resizes', async ({ page, scenario }) => {
  await scenario('primary')
  const before = await startSize(page)
  await page.locator('c2-split-panel').evaluate((element) => ((element as HTMLElement).style.width = '900px'))
  await expect.poll(() => divider(page).getAttribute('aria-valuenow')).not.toBe('40')
  expect(await startSize(page)).toBeCloseTo(before, 0)
  // Programmatic and resize changes are not user repositions.
  await expect(page.getByRole('status')).toHaveText('0')
})

test('mirrors the arrow keys and the drag in a right-to-left context', async ({ page, scenario }) => {
  await scenario('rtl')
  await divider(page).focus()
  await page.keyboard.press('ArrowLeft')
  await expect(divider(page)).toHaveAttribute('aria-valuenow', '51')
  // Dragging towards the left edge grows the start panel, which sits on the right.
  await drag(page, 150)
  const value = Number(await divider(page).getAttribute('aria-valuenow'))
  expect(value).toBeGreaterThan(73)
})

for (const state of ['default', 'vertical', 'disabled']) {
  test(`${state} has no axe violations`, async ({ page, scenario }) => {
    await scenario(state)
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    expect(results.violations).toEqual([])
  })
}
