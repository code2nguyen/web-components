import AxeBuilder from '@axe-core/playwright'
import { test, expect } from './fixture'

// Wednesday of ISO week 40 (an even week), 10:24.
test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date(2026, 8, 30, 10, 24) })
})

test('places a block from its start to its end time', async ({ page, scenario }) => {
  await scenario('every-week')
  const workshop = await page.getByRole('button', { name: 'Workshop, Tuesday 10:00 to 12:00' }).boundingBox()
  const standup = await page.getByRole('button', { name: 'Stand-up, Monday 08:30 to 09:00' }).boundingBox()
  // 48px per hour: two hours tall, half an hour tall.
  expect(workshop!.height).toBeCloseTo(96 - 2, 0)
  expect(standup!.height).toBeCloseTo(24 - 2, 0)
  expect(workshop!.x).toBeGreaterThan(standup!.x)
})

test('puts overlapping events side by side', async ({ page, scenario }) => {
  await scenario('every-week')
  const workshop = await page.getByRole('button', { name: /^Workshop/ }).boundingBox()
  const review = await page.getByRole('button', { name: /^Review/ }).boundingBox()
  expect(review!.x).toBeGreaterThan(workshop!.x)
  expect(review!.width).toBeCloseTo(workshop!.width, 0)
  expect(review!.y).toBeGreaterThan(workshop!.y)
})

test('skips events whose times do not make sense', async ({ page, scenario }) => {
  await scenario()
  await expect(page.getByRole('button', { name: /Broken/ })).toHaveCount(0)
})

test('marks today with a tinted column and a now line', async ({ page, scenario }) => {
  await scenario('alternate')
  const planner = page.locator('c2-week-planner')
  await expect(planner.getByRole('group', { name: 'Wednesday, today' })).toBeVisible()
  const column = planner.locator('.day.today')
  await expect(column).toHaveCSS('background-color', 'rgba(2, 101, 220, 0.05)')
  // The tint stays inside the column's border: the grid line keeps its own colour.
  await expect(column).toHaveCSS('background-clip', 'padding-box')
  await expect(planner.locator('.now')).toHaveCount(1)
})

test('shows every event each week while alternate weeks are off', async ({ page, scenario }) => {
  await scenario()
  await expect(page.locator('c2-week-planner').locator('c2-button-group')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Pick-up/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Gym/ })).toBeVisible()
})

test('opens on the current kind of week and switches to the other', async ({ page, scenario }) => {
  await scenario('alternate')
  await expect(page.getByText('This week (40) is even')).toBeVisible()
  await expect(page.locator('c2-week-planner').locator('c2-button-group')).toHaveJSProperty('value', 'even')
  await expect(page.getByRole('button', { name: /^Pick-up/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Gym/ })).toHaveCount(0)
  // Every-week events stay in both.
  await expect(page.getByRole('button', { name: /^Stand-up/ })).toBeVisible()

  await page.getByRole('button', { name: 'Odd week' }).click()
  await expect(page.getByRole('status')).toHaveText('parity:odd')
  await expect(page.locator('c2-week-planner').locator('c2-button-group')).toHaveJSProperty('value', 'odd')
  await expect(page.getByRole('button', { name: /^Gym/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Pick-up/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Stand-up/ })).toBeVisible()
  // Odd weeks are not this week, so today is not marked.
  await expect(page.locator('c2-week-planner').locator('.day.today')).toHaveCount(0)
})

test('switches with the arrow keys', async ({ page, scenario }) => {
  await scenario('odd')
  await page.getByRole('button', { name: 'Odd week' }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('status')).toHaveText('parity:even')
  await expect(page.getByRole('button', { name: /^Pick-up/ })).toBeVisible()
})

test('keeps the button group change event inside', async ({ page, scenario }) => {
  await scenario('alternate')
  await page.evaluate(() => {
    const leaks: Event[] = []
    ;(window as Window & { leaks?: Event[] }).leaks = leaks
    document.querySelector('c2-week-planner')!.addEventListener('change', (event) => leaks.push(event))
  })
  await page.getByRole('button', { name: 'Odd week' }).click()
  await expect(page.getByRole('status')).toHaveText('parity:odd')
  expect(await page.evaluate(() => (window as Window & { leaks?: Event[] }).leaks!.length)).toBe(0)
})

test('extends the hour scale to fit early events', async ({ page, scenario }) => {
  await scenario('early')
  await expect(page.locator('c2-week-planner').locator('.hour-label').first()).toHaveText('06:00')
})

test('fires event-click from pointer and keyboard', async ({ page, scenario }) => {
  await scenario()
  await page.getByRole('button', { name: /^Workshop/ }).click()
  await expect(page.getByRole('status')).toHaveText('click:workshop')
  await page.getByRole('button', { name: /^Review/ }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('status')).toHaveText('click:review')
})

test('has no axe violations', async ({ page, scenario }) => {
  await scenario('alternate')
  await expect(page.getByRole('region', { name: 'Week plan' })).toBeVisible()
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(results.violations).toEqual([])
})
