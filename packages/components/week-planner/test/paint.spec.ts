import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import type { WeekPlanner } from '../src/week-planner'
import { test, expect } from './fixture'

// Wednesday of ISO week 40, 10:24.
test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date(2026, 8, 30, 10, 24) })
})

const planner = (page: Page) => page.locator('c2-week-planner')

/** The middle of the cell starting `minutes` after midnight in a day column; the scale starts at 8:00, 48px an hour. */
async function cell(page: Page, day: string, minutes: number) {
  const box = (await planner(page).getByRole('group', { name: day, exact: true }).boundingBox())!
  return { x: box.x + box.width / 2, y: box.y + ((minutes - 8 * 60) / 60) * 48 + 12 }
}

/** Presses on one cell, drags to another and releases. */
async function stroke(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 6 })
  await page.mouse.up()
}

const ranges = (value: unknown[]) => `ranges:${JSON.stringify(value)}`

test('paints the rectangle a drag covers across days and times', async ({ page, scenario }) => {
  await scenario('paint')
  const from = await cell(page, 'Monday', 13 * 60)
  const to = await cell(page, 'Wednesday, today', 14 * 60 + 30)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 6 })
  // The stroke shows what it paints before it is released.
  await expect(planner(page).getByRole('group', { name: 'Wednesday, today' }).locator('.range')).toHaveText(/13:00–15:00/)
  await page.mouse.up()
  await expect(page.getByRole('status')).toHaveText(
    ranges([
      { day: 'mon', start: '13:00', end: '15:00' },
      { day: 'tue', start: '09:00', end: '11:00' },
      { day: 'tue', start: '13:00', end: '15:00' },
      { day: 'wed', start: '13:00', end: '15:00' },
    ]),
  )
  await expect(planner(page).locator('.range')).toHaveCount(4)
})

test('merges a stroke with the range it touches', async ({ page, scenario }) => {
  await scenario('paint')
  await stroke(page, await cell(page, 'Tuesday', 11 * 60), await cell(page, 'Tuesday', 11 * 60 + 30))
  await expect(page.getByRole('status')).toHaveText(ranges([{ day: 'tue', start: '09:00', end: '12:00' }]))
  await expect(planner(page).locator('.range')).toHaveCount(1)
})

test('clears the cells of a stroke that starts on a painted one', async ({ page, scenario }) => {
  await scenario('paint')
  await stroke(page, await cell(page, 'Tuesday', 10 * 60), await cell(page, 'Wednesday, today', 12 * 60))
  await expect(page.getByRole('status')).toHaveText(ranges([{ day: 'tue', start: '09:00', end: '10:00' }]))
})

test('drops a stroke on Escape', async ({ page, scenario }) => {
  await scenario('paint')
  const from = await cell(page, 'Monday', 13 * 60)
  const to = await cell(page, 'Friday', 15 * 60)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 4 })
  await expect(planner(page).locator('.range')).toHaveCount(6)
  await page.keyboard.press('Escape')
  await expect(planner(page).locator('.range')).toHaveCount(1)
  await page.mouse.up()
  // Let any late event land before checking that none did.
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 50)))
  await expect(page.getByRole('status')).toHaveText('')
})

test('follows a stroke past the grid, to the nearest cell', async ({ page, scenario }) => {
  await scenario('paint')
  const from = await cell(page, 'Saturday', 17 * 60)
  const sunday = (await planner(page).getByRole('group', { name: 'Sunday' }).boundingBox())!
  // Right of the planner and below its last hour, still inside the viewport.
  await stroke(page, from, { x: sunday.x + sunday.width + 20, y: sunday.y + sunday.height + 20 })
  await expect(page.getByRole('status')).toHaveText(
    ranges([
      { day: 'tue', start: '09:00', end: '11:00' },
      { day: 'sat', start: '17:00', end: '18:00' },
      { day: 'sun', start: '17:00', end: '18:00' },
    ]),
  )
})

test('keeps text selection and native drags out of a stroke', async ({ page, scenario }) => {
  await scenario('paint')
  const grid = planner(page).locator('.grid')
  expect(await grid.evaluate((element) => getComputedStyle(element).userSelect || getComputedStyle(element).webkitUserSelect)).toBe('none')
  await expect(planner(page).locator('.day').first()).toHaveCSS('touch-action', 'none')
  // Something selected on the page is cleared by the press, and a selection or a drag started during it is refused.
  await page.evaluate(() => {
    const range = document.createRange()
    range.selectNodeContents(document.body)
    getSelection()!.addRange(range)
  })
  const from = await cell(page, 'Monday', 13 * 60)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  expect(await page.evaluate(() => getSelection()!.toString())).toBe('')
  const refused = await page.evaluate(() => {
    const drag = new Event('dragstart', { bubbles: true, cancelable: true })
    const select = new Event('selectstart', { bubbles: true, cancelable: true })
    document.body.dispatchEvent(drag)
    document.body.dispatchEvent(select)
    return [drag.defaultPrevented, select.defaultPrevented]
  })
  expect(refused).toEqual([true, true])
  await page.mouse.up()
  await expect(page.getByRole('status')).toHaveText(
    ranges([
      { day: 'mon', start: '13:00', end: '13:30' },
      { day: 'tue', start: '09:00', end: '11:00' },
    ]),
  )
  // Released: the page selects and drags as before.
  expect(await page.evaluate(() => document.body.dispatchEvent(new Event('selectstart', { bubbles: true, cancelable: true })))).toBe(true)
})

test('paints from the keyboard with the cursor cell', async ({ page, scenario }) => {
  await scenario('paint')
  const cursor = planner(page).locator('.cursor')
  await expect(cursor).toHaveCSS('opacity', '0')
  await cursor.focus()
  await expect(cursor).toBeFocused()
  await expect(cursor).toHaveCSS('opacity', '1')
  // It opens on today's column at the first hour.
  await expect(cursor).toHaveAccessibleName('Wednesday 08:00–08:30, Not set')
  await expect(cursor).toHaveAccessibleDescription(/Space paints/)
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await expect(cursor).toHaveAccessibleName('Tuesday 09:00–09:30, Available')
  await expect(cursor).toHaveAttribute('aria-pressed', 'true')
  // Space on a painted cell clears it.
  await page.keyboard.press('Space')
  await expect(page.getByRole('status')).toHaveText(ranges([{ day: 'tue', start: '09:30', end: '11:00' }]))
  await expect(cursor).toHaveAccessibleName('Tuesday 09:00–09:30, Not set')
  // Shift+Arrow paints the cells it crosses, keeping the brush of the run.
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('Shift+ArrowDown')
  await page.keyboard.press('Shift+ArrowDown')
  await expect(page.getByRole('status')).toHaveText(
    ranges([
      { day: 'mon', start: '09:00', end: '10:30' },
      { day: 'tue', start: '09:30', end: '11:00' },
    ]),
  )
  await expect(cursor).toBeFocused()
  // Enter paints too.
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('status')).toContainText('{"day":"wed","start":"10:00","end":"10:30"}')
})

test('stops the cursor at the edges of the grid', async ({ page, scenario }) => {
  await scenario('paint')
  const cursor = planner(page).locator('.cursor')
  await cursor.focus()
  for (let index = 0; index < 8; index++) await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowUp')
  await expect(cursor).toHaveAccessibleName('Sunday 08:00–08:30, Not set')
  for (let index = 0; index < 24; index++) await page.keyboard.press('ArrowDown')
  await expect(cursor).toHaveAccessibleName('Sunday 17:30–18:00, Not set')
})

test('paints a category over another, with a part per category', async ({ page, scenario }) => {
  await scenario('paint-category')
  await expect(planner(page).locator('.range[part="range range-peak"]')).toHaveText(/peak\s+09:00–11:00/)
  // A value that is not a plain word gets the shared part only.
  await expect(planner(page).locator('.range[part="range"]')).toHaveText(/off peak\s+10:00–12:00/)
  await stroke(page, await cell(page, 'Thursday', 11 * 60), await cell(page, 'Thursday', 12 * 60 + 30))
  await expect(page.getByRole('status')).toHaveText(
    ranges([
      { day: 'tue', start: '09:00', end: '11:00', value: 'peak' },
      { day: 'thu', start: '10:00', end: '11:00', value: 'off peak' },
      { day: 'thu', start: '11:00', end: '13:00', value: 'peak' },
    ]),
  )
})

test('copies a day onto others with copyDay', async ({ page, scenario }) => {
  await scenario('paint-category')
  await planner(page).evaluate((element: WeekPlanner) => element.copyDay('tue', ['mon', 'thu']))
  await expect(page.getByRole('status')).toHaveText(
    ranges([
      { day: 'mon', start: '09:00', end: '11:00', value: 'peak' },
      { day: 'tue', start: '09:00', end: '11:00', value: 'peak' },
      { day: 'thu', start: '09:00', end: '11:00', value: 'peak' },
    ]),
  )
})

test('paints through events and turns editing off', async ({ page, scenario }) => {
  await scenario('paint-editable')
  await expect(planner(page).locator('.add')).toHaveCount(0)
  const standup = (await page.getByRole('button', { name: /^Stand-up/ }).boundingBox())!
  await stroke(page, { x: standup.x + 10, y: standup.y + 6 }, { x: standup.x + 10, y: standup.y + 30 })
  await expect(page.getByRole('status')).toHaveText(
    ranges([
      { day: 'mon', start: '08:30', end: '09:30' },
      { day: 'tue', start: '09:00', end: '11:00' },
    ]),
  )
})

test('draws the ranges of a planner that is not painting, and leaves the pointer alone', async ({ page, scenario }) => {
  await scenario('paint')
  await planner(page).evaluate((element: WeekPlanner) => (element.paint = false))
  await expect(planner(page).locator('.cursor')).toHaveCount(0)
  await expect(planner(page).locator('.range')).toHaveText(/Available\s+09:00–11:00/)
  await stroke(page, await cell(page, 'Monday', 13 * 60), await cell(page, 'Monday', 14 * 60))
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 50)))
  await expect(page.getByRole('status')).toHaveText('')
})

test('draws a range through renderRange', async ({ page, scenario }) => {
  await scenario('paint-render')
  await expect(planner(page).locator('.range')).toHaveText('Tuesday: 09:00 to 11:00')
})

test('keeps the cursor in view on a narrow planner', async ({ page, scenario }) => {
  await scenario('paint-narrow')
  const cursor = planner(page).locator('.cursor')
  await cursor.focus()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect(cursor).toHaveAccessibleName('Friday 08:00–08:30, Not set')
  const scroller = planner(page).locator('.scroller')
  await expect
    .poll(async () => {
      const [box, frame] = [(await cursor.boundingBox())!, (await scroller.boundingBox())!]
      return box.x >= frame.x - 1 && box.x + box.width <= frame.x + frame.width + 1
    })
    .toBe(true)
})

test('has no axe violations while painting', async ({ page, scenario }) => {
  await scenario('paint-category')
  await planner(page).locator('.cursor').focus()
  const results = await new AxeBuilder({ page }).include('c2-week-planner').analyze()
  expect(results.violations).toEqual([])
})
