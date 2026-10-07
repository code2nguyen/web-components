import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { test, expect } from './fixture'

const items = (page: Page, tag = 'c2-chip') => page.locator(`c2-chip-group > ${tag}`)
const indicator = (page: Page) => page.locator('c2-chip-group .row .overflow')

/** Every visible item lies inside the group, and the indicator after the last one. */
async function expectNoOverflow(page: Page) {
  const group = await page.locator('c2-chip-group').boundingBox()
  const boxes = await page.locator('c2-chip-group .row').evaluate((row) => {
    const host = (row.getRootNode() as ShadowRoot).host
    const visible = [...host.children].filter((child) => child.assignedSlot?.name === '').map((child) => child.getBoundingClientRect().right)
    const more = row.querySelector('.overflow')?.getBoundingClientRect().right
    return more === undefined ? visible : [...visible, more]
  })
  for (const right of boxes) expect(right).toBeLessThanOrEqual(group!.x + group!.width + 0.5)
}

test('shows every item when they all fit, without an indicator', async ({ page, scenario }) => {
  await scenario('wide')
  await expect(items(page).filter({ visible: true })).toHaveCount(6)
  await expect(indicator(page)).toHaveCount(0)
  await expect(page.locator('output')).toHaveText('')
})

test('collapses what does not fit into a +N indicator', async ({ page, scenario }) => {
  await scenario()
  await expect(indicator(page)).toBeVisible()
  const shown = await items(page).filter({ visible: true }).count()
  expect(shown).toBeGreaterThan(0)
  expect(shown).toBeLessThan(6)
  await expect(indicator(page)).toHaveText(`+${6 - shown}`)
  await expect(indicator(page)).toHaveAccessibleName(`${6 - shown} more`)
  await expect(page.locator('output')).toHaveText(`overflow:${shown}/${6 - shown}`)
  // Visible items keep document order.
  await expect(items(page).first()).toBeVisible()
  await expectNoOverflow(page)
})

test('collapsed items leave the accessibility tree', async ({ page, scenario }) => {
  await scenario()
  await expect(indicator(page)).toBeVisible()
  await expect(page.getByText('Finance')).toBeHidden()
  const snapshot = await page.locator('c2-chip-group').ariaSnapshot()
  expect(snapshot).not.toContain('Finance')
  expect(snapshot).toContain('Design')
})

test('recomputes when the group is resized', async ({ page, scenario }) => {
  await scenario()
  const before = await items(page).filter({ visible: true }).count()
  await page.getByRole('button', { name: 'Narrow' }).click()
  await expect(items(page).filter({ visible: true })).not.toHaveCount(before)
  await expectNoOverflow(page)
  await page.getByRole('button', { name: 'Widen' }).click()
  await expect(items(page).filter({ visible: true })).toHaveCount(6)
  await expect(indicator(page)).toHaveCount(0)
})

test('recomputes when an item reports a new size', async ({ page, scenario }) => {
  await scenario()
  await expect(indicator(page)).toBeVisible()
  const before = await items(page).filter({ visible: true }).count()
  // Only the chip knows its new size: the group sees the longer label through the size it reports.
  await page.getByRole('button', { name: 'Rename first' }).click()
  await expect.poll(() => items(page).filter({ visible: true }).count()).toBeLessThan(before)
  await expectNoOverflow(page)
  await page.getByRole('button', { name: 'Rename first' }).click()
  await expect(items(page).filter({ visible: true })).toHaveCount(before)
})

test('follows items being added and removed', async ({ page, scenario }) => {
  await scenario()
  await expect(indicator(page)).toBeVisible()
  const hidden = 6 - (await items(page).filter({ visible: true }).count())
  await page.getByRole('button', { name: 'Add chip' }).click()
  await expect(indicator(page)).toHaveText(`+${hidden + 1}`)
  await page.getByRole('button', { name: 'Remove first' }).click()
  await expect(page.getByText('Design', { exact: true })).toHaveCount(0)
  await expectNoOverflow(page)
})

test('max caps the visible items even when there is room', async ({ page, scenario }) => {
  await scenario('max')
  await page.getByRole('button', { name: 'Widen' }).click()
  await expect(items(page).filter({ visible: true })).toHaveCount(2)
  await expect(indicator(page)).toHaveText('+4')
})

test('badges report their size the same way', async ({ page, scenario }) => {
  await scenario('badges')
  await expect(indicator(page)).toBeVisible()
  const shown = await items(page, 'c2-badge').filter({ visible: true }).count()
  expect(shown).toBeGreaterThan(0)
  await expect(indicator(page)).toHaveText(`+${6 - shown}`)
  await expectNoOverflow(page)
})

test('measures plain elements that do not report a size', async ({ page, scenario }) => {
  await scenario('plain')
  await expect(indicator(page)).toBeVisible()
  const shown = await items(page, 'span').filter({ visible: true }).count()
  await expect(indicator(page)).toHaveText(`+${6 - shown}`)
  await expectNoOverflow(page)
})

test('an expandable group expands and collapses from the keyboard', async ({ page, scenario }) => {
  await scenario('expandable')
  const more = page.locator('c2-chip-group').getByRole('button', { name: /more$/ })
  await expect(more).toHaveAttribute('aria-expanded', 'false')
  await more.focus()
  await page.keyboard.press('Enter')
  await expect(items(page).filter({ visible: true })).toHaveCount(6)
  const less = page.locator('c2-chip-group').getByRole('button', { name: 'Show less' })
  await expect(less).toBeFocused()
  await expect(page.locator('output')).toContainText('expanded:true')
  await page.keyboard.press('Space')
  await expect(more).toBeFocused()
  await expect(page.locator('output')).toContainText('expanded:false')
  await expectNoOverflow(page)
})

test('a declarative shadow root collapses items through slot attributes', async ({ page, scenario }) => {
  await scenario('declarative')
  await expect(indicator(page)).toBeVisible()
  const shown = await items(page).filter({ visible: true }).count()
  await expect(indicator(page)).toHaveText(`+${6 - shown}`)
  await expect(page.locator('c2-chip-group > [slot="c2-chip-group-hidden"]')).toHaveCount(6 - shown)
  await page.getByRole('button', { name: 'Widen' }).click()
  await expect(items(page).filter({ visible: true })).toHaveCount(6)
  await expect(page.locator('c2-chip-group > [slot]')).toHaveCount(0)
})

test('has no automatically detectable accessibility violations', async ({ page, scenario }) => {
  for (const name of ['default', 'expandable']) {
    await scenario(name)
    await expect(indicator(page)).toBeVisible()
    const results = await new AxeBuilder({ page }).include('c2-chip-group').analyze()
    expect(results.violations).toEqual([])
  }
})
