import AxeBuilder from '@axe-core/playwright'
import { test, expect } from './fixture'

test('draws a multi-day event as a bar on every week it covers', async ({ page, scenario }) => {
  await scenario()
  await expect(page.getByRole('heading', { name: 'September 2026' })).toBeVisible()
  const vacation = page.getByRole('button', { name: 'Vacation, September 10, 2026 to September 15, 2026' })
  // Thursday 10 – Sunday 13, then Monday 14 – Tuesday 15 on the next row.
  await expect(vacation).toHaveCount(2)
  const [first, second] = [await vacation.nth(0).boundingBox(), await vacation.nth(1).boundingBox()]
  expect(second!.y).toBeGreaterThan(first!.y)
  expect(first!.width).toBeGreaterThan(second!.width)
})

test('stacks overlapping events in separate lanes', async ({ page, scenario }) => {
  await scenario()
  const vacation = await page
    .getByRole('button', { name: /^Vacation/ })
    .first()
    .boundingBox()
  const flight = await page.getByRole('button', { name: 'Flight, September 10, 2026' }).boundingBox()
  expect(flight!.x).toBeCloseTo(vacation!.x, 0)
  expect(flight!.y).toBeGreaterThan(vacation!.y)
})

test('skips events without a valid start date', async ({ page, scenario }) => {
  await scenario()
  await expect(page.getByRole('button', { name: /Broken/ })).toHaveCount(0)
})

test('fires event-click with the clicked entry', async ({ page, scenario }) => {
  await scenario()
  await page
    .getByRole('button', { name: /^Vacation/ })
    .last()
    .click()
  await expect(page.getByRole('status')).toHaveText('click:vacation')
})

test('opens an event from the keyboard', async ({ page, scenario }) => {
  await scenario()
  await page.getByRole('button', { name: 'Flight, September 10, 2026' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('status')).toHaveText('click:flight')
})

test('navigates months and reports the change', async ({ page, scenario }) => {
  await scenario()
  await page.getByRole('button', { name: 'Next month' }).click()
  await expect(page.getByRole('heading', { name: 'October 2026' })).toBeVisible()
  await expect(page.getByRole('status')).toHaveText('month:2026-10')
  await expect(page.locator('c2-calendar')).toHaveJSProperty('month', '2026-10')
  await page.getByRole('button', { name: 'Previous month' }).click()
  await page.getByRole('button', { name: 'Previous month' }).click()
  await expect(page.getByRole('heading', { name: 'August 2026' })).toBeVisible()
})

test('reads month and events from attributes', async ({ page, scenario }) => {
  await scenario('attribute')
  await expect(page.getByRole('heading', { name: 'November 2026' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Ski trip, November 20, 2026 to November 22, 2026' })).toHaveCount(1)
})

test('keeps a Sunday-first week in one row', async ({ page, scenario }) => {
  await scenario('sunday')
  // Sunday first: September 10 – 12 and 13 – 15 fall in two rows.
  await expect(page.getByRole('button', { name: /^Vacation/ })).toHaveCount(2)
  await expect(page.locator('c2-calendar').locator('.weekdays span').first()).toHaveText('Sun')
})

test('has no axe violations', async ({ page, scenario }) => {
  await scenario()
  await expect(page.getByRole('region', { name: 'September 2026' })).toBeVisible()
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(results.violations).toEqual([])
})
