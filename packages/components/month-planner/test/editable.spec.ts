import AxeBuilder from '@axe-core/playwright'
import type { Locator, Page } from '@playwright/test'
import { test, expect } from './fixture'

/** A point in the empty lower part of a day's cell, below any bar. */
async function emptySpot(page: Page, date: string) {
  const box = (await page.locator(`c2-month-planner .day[data-date="${date}"]`).boundingBox())!
  return { x: box.x + box.width / 2, y: box.y + box.height - 8 }
}

async function centre(locator: Locator) {
  const box = (await locator.boundingBox())!
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

/** Presses at `from`, drags to `to` and leaves the button down. */
async function dragTo(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 8 })
}

test.describe('editable', () => {
  test('fires day-click for a click on a day, including a neighbouring month’s', async ({ page, scenario }) => {
    await scenario('editable')
    const status = page.getByRole('status')
    const spot = await emptySpot(page, '2026-09-16')
    await page.mouse.click(spot.x, spot.y)
    await expect(status).toHaveText('day:2026-09-16')

    // On the day's number too, and on a day of August shown in the grid, without leaving September.
    const august = await emptySpot(page, '2026-08-31')
    await page.mouse.click(august.x, august.y)
    await expect(status).toHaveText('day:2026-08-31')
    await expect(page.getByRole('heading', { name: 'September 2026' })).toBeVisible()
  })

  test('keeps event-click on the bars', async ({ page, scenario }) => {
    await scenario('editable')
    await page.getByRole('button', { name: 'Flight, September 10, 2026' }).click()
    await expect(page.getByRole('status')).toHaveText('click:flight')
  })

  test('moves between days with arrow keys and fires day-click on Enter and Space', async ({ page, scenario }) => {
    await page.clock.install({ time: new Date(2026, 8, 2, 10) })
    await scenario('editable')
    const planner = page.locator('c2-month-planner')
    const status = page.getByRole('status')
    await planner.getByRole('button', { name: 'September 2, 2026, today' }).focus()
    await page.keyboard.press('ArrowRight')
    await expect(planner.getByRole('button', { name: 'September 3, 2026', exact: true })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(status).toHaveText('day:2026-09-03')
    await page.keyboard.press('ArrowDown')
    await expect(planner.getByRole('button', { name: 'September 10, 2026, has events' })).toBeFocused()
    await page.keyboard.press(' ')
    await expect(status).toHaveText('day:2026-09-10')
  })

  test('selects a range by dragging across days, highlighting it live', async ({ page, scenario }) => {
    await scenario('editable')
    const planner = page.locator('c2-month-planner')
    // Dragged backwards: the range still comes ordered.
    await dragTo(page, await emptySpot(page, '2026-09-18'), await emptySpot(page, '2026-09-22'))
    for (const date of ['2026-09-18', '2026-09-20', '2026-09-22']) await expect(planner.locator(`.day[data-date="${date}"]`)).toHaveClass(/in-range/)
    await expect(planner.locator('.day[data-date="2026-09-23"]')).not.toHaveClass(/in-range/)
    const back = await emptySpot(page, '2026-09-16')
    await page.mouse.move(back.x, back.y, { steps: 4 })
    await expect(planner.locator('.day[data-date="2026-09-22"]')).not.toHaveClass(/in-range/)
    await page.mouse.up()
    await expect(page.getByRole('status')).toHaveText('range:2026-09-16..2026-09-18')
    await expect(planner.locator('.day.in-range')).toHaveCount(0)
  })

  test('cancels a range with Escape', async ({ page, scenario }) => {
    await scenario('editable')
    const planner = page.locator('c2-month-planner')
    await dragTo(page, await emptySpot(page, '2026-09-16'), await emptySpot(page, '2026-09-18'))
    await expect(planner.locator('.day.in-range')).toHaveCount(3)
    await page.keyboard.press('Escape')
    await expect(planner.locator('.day.in-range')).toHaveCount(0)
    await page.mouse.up()
    await page.waitForTimeout(100)
    await expect(page.getByRole('status')).toHaveText('')
  })

  test('drags a bar to another day, keeping its length, with a live preview', async ({ page, scenario }) => {
    await scenario('editable')
    const status = page.getByRole('status')
    const flight = page.getByRole('button', { name: 'Flight, September 10, 2026' })
    await dragTo(page, await centre(flight), await emptySpot(page, '2026-09-12'))
    await expect(page.getByRole('button', { name: 'Flight, September 12, 2026' })).toHaveClass(/dragging/)
    await page.mouse.up()
    await expect(status).toHaveText('change:flight:2026-09-12..2026-09-12')
    await expect(page.getByRole('button', { name: 'Flight, September 12, 2026' })).not.toHaveClass(/dragging/)

    // A multi-day event moves by the days between the day pressed and the day released.
    const vacation = page.getByRole('button', { name: /^Vacation/ }).first()
    const box = (await vacation.boundingBox())!
    const pressed = { x: box.x + box.width * 0.375, y: box.y + box.height / 2 } // Friday the 11th of Thursday – Sunday
    const target = await emptySpot(page, '2026-09-13')
    await dragTo(page, pressed, { x: target.x, y: pressed.y })
    await page.mouse.up()
    await expect(status).toHaveText('change:vacation:2026-09-12..2026-09-17')
    await expect(page.getByRole('button', { name: 'Vacation, September 12, 2026 – September 17, 2026' })).toHaveCount(2)
  })

  test('resizes a bar from its end and its start edge', async ({ page, scenario }) => {
    await scenario('editable')
    const status = page.getByRole('status')
    const planner = page.locator('c2-month-planner')
    const end = planner.locator('.event', { hasText: 'Vacation' }).nth(1).locator('.handle-end')
    await dragTo(page, await centre(end), await emptySpot(page, '2026-09-17'))
    await expect(page.getByRole('button', { name: 'Vacation, September 10, 2026 – September 17, 2026' }).first()).toHaveClass(/dragging/)
    await page.mouse.up()
    await expect(status).toHaveText('change:vacation:2026-09-10..2026-09-17')

    const start = planner.locator('.event', { hasText: 'Vacation' }).first().locator('.handle-start')
    await dragTo(page, await centre(start), await emptySpot(page, '2026-09-08'))
    await page.mouse.up()
    await expect(status).toHaveText('change:vacation:2026-09-08..2026-09-17')

    // The start cannot pass the end.
    const flightStart = planner.locator('.event', { hasText: 'Flight' }).locator('.handle-start')
    await dragTo(page, await centre(flightStart), await emptySpot(page, '2026-09-13'))
    await page.mouse.up()
    await page.waitForTimeout(100)
    await expect(status).toHaveText('change:vacation:2026-09-08..2026-09-17')
  })

  test('cancels a drag with Escape, without firing anything', async ({ page, scenario }) => {
    await scenario('editable')
    const flight = page.getByRole('button', { name: 'Flight, September 10, 2026' })
    await dragTo(page, await centre(flight), await emptySpot(page, '2026-09-12'))
    await expect(page.getByRole('button', { name: 'Flight, September 12, 2026' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: 'Flight, September 10, 2026' })).toBeVisible()
    await page.mouse.up()
    await page.waitForTimeout(100)
    await expect(page.getByRole('status')).toHaveText('')
    await expect(page.locator('c2-month-planner .event.dragging')).toHaveCount(0)
  })

  test('keeps a press that barely moves a click', async ({ page, scenario }) => {
    await scenario('editable')
    const from = await centre(page.getByRole('button', { name: 'Flight, September 10, 2026' }))
    await dragTo(page, from, { x: from.x + 2, y: from.y + 1 })
    await page.mouse.up()
    await expect(page.getByRole('status')).toHaveText('click:flight')
  })

  test('moves and resizes a focused bar with Alt+Arrow keys', async ({ page, scenario }) => {
    await scenario('editable')
    const status = page.getByRole('status')
    await page.getByRole('button', { name: 'Flight, September 10, 2026' }).focus()
    await page.keyboard.press('Alt+ArrowRight')
    await expect(status).toHaveText('change:flight:2026-09-11..2026-09-11')
    // Focus follows the bar once the app has applied the change.
    await expect(page.getByRole('button', { name: 'Flight, September 11, 2026' })).toBeFocused()
    await page.keyboard.press('Alt+ArrowDown')
    await expect(status).toHaveText('change:flight:2026-09-18..2026-09-18')
    await page.keyboard.press('Alt+Shift+ArrowRight')
    await expect(status).toHaveText('change:flight:2026-09-18..2026-09-19')
    await expect(page.getByRole('button', { name: 'Flight, September 18, 2026 – September 19, 2026' })).toBeFocused()
    await page.keyboard.press('Alt+ArrowUp')
    await expect(status).toHaveText('change:flight:2026-09-11..2026-09-12')
    await page.keyboard.press('Alt+Shift+ArrowLeft')
    await expect(status).toHaveText('change:flight:2026-09-11..2026-09-11')
    // The end cannot go before the start.
    await page.keyboard.press('Alt+Shift+ArrowLeft')
    await page.keyboard.press('Alt+ArrowLeft')
    await expect(status).toHaveText('change:flight:2026-09-10..2026-09-10')
  })

  test('fires day-click on a tap when compact', async ({ page, scenario }) => {
    await scenario('editable-compact')
    const planner = page.locator('c2-month-planner')
    await planner.getByRole('button', { name: 'September 10, 2026, has events' }).click()
    await expect(page.getByRole('status')).toHaveText('day:2026-09-10')
    await expect(planner.getByRole('heading', { name: 'Thursday, September 10' })).toBeVisible()
  })

  test('has no axe violations', async ({ page, scenario }) => {
    await scenario('editable')
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    expect(results.violations).toEqual([])
  })
})

test('leaves a planner without editable as it was', async ({ page, scenario }) => {
  await scenario()
  const planner = page.locator('c2-month-planner')
  const status = page.getByRole('status')
  await expect(planner.locator('.day-select').first()).toBeHidden()
  await expect(planner.locator('.handle')).toHaveCount(0)

  const spot = await emptySpot(page, '2026-09-16')
  await page.mouse.click(spot.x, spot.y)
  await dragTo(page, await emptySpot(page, '2026-09-16'), await emptySpot(page, '2026-09-18'))
  await expect(planner.locator('.day.in-range')).toHaveCount(0)
  await page.mouse.up()

  const flight = page.getByRole('button', { name: 'Flight, September 10, 2026' })
  await dragTo(page, await centre(flight), await emptySpot(page, '2026-09-12'))
  await expect(planner.locator('.event.dragging')).toHaveCount(0)
  await page.mouse.up()
  await flight.focus()
  await page.keyboard.press('Alt+ArrowRight')
  await page.waitForTimeout(100)
  await expect(status).toHaveText('')
  await expect(flight).toBeVisible()
})
