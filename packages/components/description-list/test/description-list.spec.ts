import AxeBuilder from '@axe-core/playwright'
import type { Locator } from '@playwright/test'
import { test, expect } from './fixture'

const tops = (locator: Locator) => locator.evaluateAll((items) => items.map((item) => Math.round(item.getBoundingClientRect().top)))
const columnCount = async (locator: Locator) => {
  const all = await tops(locator)
  return all.filter((top) => top === all[0]).length
}

test('shows each label with its value, as a list of terms and definitions', async ({ page, scenario }) => {
  await scenario()
  const list = page.locator('c2-description-list')
  const items = page.locator('c2-description-item')
  await expect(list).toHaveHostAria('role', 'list')
  await expect(items).toHaveCount(6)
  await expect(items.first()).toHaveHostAria('role', 'listitem')
  await expect(items.first().locator('[part="label"]')).toHaveText('Name')
  await expect(items.first().locator('[part="label"]')).toHaveAttribute('role', 'term')
  await expect(items.first().locator('[part="value"]')).toHaveAttribute('role', 'definition')
  await expect(items.first()).toContainText('Ada Lovelace')
  await expect(page.getByRole('term').first()).toHaveText('Name')
})

test('an empty value shows a dash until it gets content', async ({ page, scenario }) => {
  await scenario()
  const phone = page.locator('c2-description-item[label="Phone"]')
  await expect(phone.locator('[part="empty"]')).toHaveText('—')
  await expect(phone.locator('[part="empty"]')).toBeVisible()
  await expect(page.locator('c2-description-item[label="Name"] [part="empty"]')).toBeHidden()
  await phone.evaluate((item) => (item.textContent = '+44 20 7946 0000'))
  await expect(phone.locator('[part="empty"]')).toBeHidden()
  await expect(phone).toContainText('+44 20 7946 0000')
  // A framework that rewrites the text node in place fires no slotchange.
  await phone.evaluate((item) => (item.firstChild!.textContent = ' '))
  await expect(phone.locator('[part="empty"]')).toHaveText('—')
})

test('empty-text replaces the dash, and an empty string shows nothing', async ({ page, scenario }) => {
  await scenario('rich-label')
  await expect(page.locator('c2-description-item[label="Empty"] [part="empty"]')).toHaveText('Not set')
  await expect(page.locator('c2-description-item[label="Blank"] [part="empty"]')).toBeHidden()
})

test('the label slot replaces the label attribute, and actions sit after the value', async ({ page, scenario }) => {
  await scenario('rich-label')
  const item = page.locator('c2-description-item[label="Plain"]')
  // The slotted label is shown and the attribute's fallback text is not.
  await expect(item.getByText('Status')).toBeVisible()
  expect(await item.locator('[part="label"] slot').evaluate((slot: HTMLSlotElement) => slot.assignedElements().length)).toBe(1)
  await expect(item.locator('[part="empty"]')).toBeHidden()
  const copy = page.getByRole('button', { name: 'Copy' })
  await expect(copy).toBeVisible()
  const value = await item.locator('strong').boundingBox()
  const action = await copy.boundingBox()
  expect(action!.x).toBeGreaterThan(value!.x + value!.width)
  await expect(page.locator('c2-description-item[label="Empty"] [part="actions"]')).toBeHidden()
})

test('items flow into up to three columns and wrap to fewer as the width shrinks', async ({ page, scenario }) => {
  const items = page.locator('c2-description-item')
  await page.setViewportSize({ width: 1200, height: 800 })
  await scenario()
  expect(await columnCount(items)).toBe(3)
  await page.setViewportSize({ width: 560, height: 800 })
  await expect.poll(() => columnCount(items)).toBe(2)
  await page.setViewportSize({ width: 360, height: 800 })
  await expect.poll(() => columnCount(items)).toBe(1)
})

test('an item spans the full row through its grid-column variable', async ({ page, scenario }) => {
  await page.setViewportSize({ width: 1200, height: 800 })
  await scenario('full-row')
  const grid = await page.locator('c2-description-list [part="grid"]').boundingBox()
  const wide = await page.locator('#wide').boundingBox()
  expect(Math.round(wide!.width)).toBe(Math.round(grid!.width))
})

test('the header is hidden until a heading or actions are slotted', async ({ page, scenario }) => {
  await scenario()
  await expect(page.locator('c2-description-list [part="header"]')).toBeHidden()
  await scenario('header')
  await expect(page.locator('c2-description-list [part="header"]')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Customer' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible()
})

test('a label width puts the label beside its value, which wraps under it when narrow', async ({ page, scenario }) => {
  await page.setViewportSize({ width: 1200, height: 800 })
  await scenario('horizontal')
  const item = page.locator('c2-description-item').first()
  const label = () => item.locator('[part="label"]').boundingBox()
  const value = () => item.locator('[part="value"]').boundingBox()
  expect(Math.round((await value())!.y)).toBe(Math.round((await label())!.y))
  expect(Math.round((await label())!.width)).toBe(160)
  await page.setViewportSize({ width: 360, height: 800 })
  await expect.poll(async () => (await value())!.y > (await label())!.y).toBe(true)
})

test('labels beside values work in two columns, which fold to one when narrow', async ({ page, scenario }) => {
  const items = page.locator('c2-description-item')
  await page.setViewportSize({ width: 1200, height: 800 })
  await scenario('two-column-horizontal')
  expect(await columnCount(items)).toBe(2)
  const first = items.first()
  const label = await first.locator('[part="label"]').boundingBox()
  const value = await first.locator('[part="value"]').boundingBox()
  expect(Math.round(value!.y)).toBe(Math.round(label!.y))
  expect(value!.x).toBeGreaterThan(label!.x + label!.width)
  await page.setViewportSize({ width: 600, height: 800 })
  await expect.poll(() => columnCount(items)).toBe(1)
})

for (const name of ['default', 'header', 'rich-label']) {
  test(`has no detectable accessibility violations: ${name}`, async ({ page, scenario }) => {
    await scenario(name)
    const results = await new AxeBuilder({ page }).include('main').analyze()
    expect(results.violations).toEqual([])
  })
}
