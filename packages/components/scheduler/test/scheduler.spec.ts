import type { Locator, Page } from '@playwright/test'
import { test, expect, accessible, watch } from '../../../../tests/component-fixture'

const RESOURCES = [
  { id: 'ana', label: 'Ana Ruiz', group: 'Design', description: 'Product designer', color: '#7c3aed' },
  { id: 'kenji', label: 'Kenji Ono', group: 'Design', description: 'UX research' },
  { id: 'aurora', label: 'Aurora', group: 'Rooms', description: '8 seats' },
  { id: 'borealis', label: 'Borealis', group: 'Rooms', description: '4 seats' },
]

const EVENTS = [
  { id: 'kickoff', resource: 'ana', start: '2026-11-09T09:00', end: '2026-11-09T10:30', title: 'Kick-off' },
  { id: 'review', resource: 'ana', start: '2026-11-09T11:30', end: '2026-11-09T13:30', title: 'Design review' },
  { id: 'interviews', resource: 'kenji', start: '2026-11-09T09:30', end: '2026-11-09T11:30', title: 'Interviews' },
  { id: 'sync', resource: 'kenji', start: '2026-11-09T10:00', end: '2026-11-09T11:00', title: 'Sync' },
  { id: 'standup', resource: 'aurora', start: '2026-11-09T09:00', end: '2026-11-09T10:00', title: 'Stand-up' },
  { id: 'one-on-one', resource: 'borealis', start: '2026-11-09T13:00', end: '2026-11-09T14:30', title: 'One-on-one', readonly: true },
  { id: 'later', resource: 'ana', start: '2026-11-12T09:00', end: '2026-11-12T12:00', title: 'Workshop' },
]

/** 07:00 to 19:00 in twelve 80px columns: the whole day fits the viewport, so no column hides under the sticky one. */
function markup(attributes = 'editable') {
  return `<c2-scheduler date="2026-11-09" day-start="07:00" day-end="19:00" locale="en-GB" ${attributes}
    style="--c2-scheduler__slot--width: 80px"
    resources='${JSON.stringify(RESOURCES)}' events='${JSON.stringify(EVENTS)}'></c2-scheduler>`
}

const scheduler = (page: Page) => page.locator('c2-scheduler')
const lane = (page: Page, resource: string) => scheduler(page).locator(`.lane[data-resource="${resource}"]`)
const bar = (page: Page, title: string) => scheduler(page).getByRole('button', { name: new RegExp(`^${title},`) })
const events = async (locator: Locator) => JSON.parse((await locator.getAttribute('data-events')) ?? '[]')
const activeName = (page: Page) => scheduler(page).evaluate((element) => element.shadowRoot!.activeElement?.getAttribute('aria-label') ?? '')

/** The page position of a time on a resource's row, for the day view drawn from 07:00 to 19:00. */
async function at(page: Page, resource: string, time: string) {
  const box = (await lane(page, resource).boundingBox())!
  const [hours, minutes] = time.split(':').map(Number)
  return { x: box.x + ((hours * 60 + minutes - 420) / 720) * box.width, y: box.y + box.height / 2 }
}

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 8 })
  await page.mouse.up()
}

test.beforeEach(async ({ page }) => {
  // Monday 9 November 2026, 10:30.
  await page.clock.install({ time: new Date(2026, 10, 9, 10, 30) })
})

test('the day view draws grouped resources, named bars, overlapping bookings in lanes and the time now', async ({ page, renderScenario }) => {
  await renderScenario(markup(''))
  await expect(scheduler(page).getByRole('heading', { name: 'Monday, 9 November 2026' })).toBeVisible()
  await expect(scheduler(page).getByRole('grid', { name: 'Schedule' })).toBeVisible()
  await expect(bar(page, 'Kick-off')).toHaveAccessibleName('Kick-off, Ana Ruiz, Monday 9 November, 09:00 to 10:30')
  // Another day's booking is not drawn.
  await expect(bar(page, 'Workshop')).toHaveCount(0)
  // Overlapping bookings stack, and the row grows to fit them.
  const interviews = (await bar(page, 'Interviews').boundingBox())!
  const sync = (await bar(page, 'Sync').boundingBox())!
  expect(sync.y).toBeGreaterThan(interviews.y + interviews.height - 1)
  // Bars sit where their times are.
  const kickoff = (await bar(page, 'Kick-off').boundingBox())!
  expect(Math.abs(kickoff.x - (await at(page, 'ana', '09:00')).x)).toBeLessThan(4)
  expect(Math.abs(kickoff.x + kickoff.width - (await at(page, 'ana', '10:30')).x)).toBeLessThan(4)
  // The line for now is on every row, at 10:30.
  const now = scheduler(page).locator('.lane[data-resource="ana"] .now')
  const line = (await now.boundingBox())!
  expect(Math.abs(line.x + line.width / 2 - (await at(page, 'ana', '10:30')).x)).toBeLessThan(2)
  await expect(scheduler(page).locator('.lane .now')).toHaveCount(4)
  // Before 09:00 and after 18:00 is shaded.
  await expect(lane(page, 'ana').locator('.off')).toHaveCount(2)
  await accessible(page)
})

test('a group collapses and opens again', async ({ page, renderScenario }) => {
  await renderScenario(markup(''))
  const toggle = scheduler(page).getByRole('button', { name: 'Rooms · 2' })
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(lane(page, 'aurora')).toHaveCount(0)
  await toggle.click()
  await expect(lane(page, 'aurora')).toHaveCount(1)
})

test('the header pages through days and switches views, reporting the range shown', async ({ page, renderScenario }) => {
  await renderScenario(markup(''))
  await watch(scheduler(page), 'date-change')
  await scheduler(page).getByRole('button', { name: 'Next day' }).click()
  await expect(scheduler(page)).toHaveAttribute('date', '2026-11-10')
  expect(await events(scheduler(page))).toEqual([{ date: '2026-11-10', view: 'day', start: '2026-11-10', end: '2026-11-10' }])
  await scheduler(page).getByRole('button', { name: 'Today' }).click()
  await expect(scheduler(page)).toHaveAttribute('date', '2026-11-09')

  await watch(scheduler(page), 'view-change')
  await scheduler(page).locator('c2-button[value="week"]').click()
  await expect(scheduler(page)).toHaveAttribute('view', 'week')
  expect(await events(scheduler(page))).toEqual([{ date: '2026-11-09', view: 'week', start: '2026-11-09', end: '2026-11-15' }])
  await expect(scheduler(page).getByRole('heading')).toHaveText('9 – 15 November 2026')
  await expect(scheduler(page).locator('.tick')).toHaveCount(7)
  await expect(bar(page, 'Workshop')).toBeVisible()
  // The weekend is shaded in the week view; working hours are not.
  await expect(lane(page, 'ana').locator('.off')).toHaveCount(2)

  await scheduler(page).locator('c2-button[value="month"]').click()
  await expect(scheduler(page).getByRole('heading')).toHaveText('November 2026')
  await expect(scheduler(page).locator('.tick')).toHaveCount(30)
  await scheduler(page).getByRole('button', { name: 'Next month' }).click()
  await expect(scheduler(page)).toHaveAttribute('date', '2026-12-09')
})

test('a click on a bar reports it', async ({ page, renderScenario }) => {
  await renderScenario(markup(''))
  await watch(scheduler(page), 'event-click')
  await bar(page, 'Stand-up').click()
  expect((await events(scheduler(page)))[0].event.id).toBe('standup')
})

test('dragging across empty time selects a range snapped to the quarter hour; a click selects the column', async ({ page, renderScenario }) => {
  await renderScenario(markup())
  await watch(scheduler(page), 'range-select')
  await drag(page, await at(page, 'aurora', '11:05'), await at(page, 'aurora', '12:28'))
  expect(await events(scheduler(page))).toEqual([{ resource: 'aurora', start: '2026-11-09T11:00', end: '2026-11-09T12:30' }])
  const point = await at(page, 'borealis', '15:20')
  await page.mouse.click(point.x, point.y)
  expect((await events(scheduler(page)))[1]).toEqual({ resource: 'borealis', start: '2026-11-09T15:00', end: '2026-11-09T16:00' })
})

test('dragging a bar moves it in time and to another row; its edge resizes it; Escape cancels', async ({ page, renderScenario }) => {
  await renderScenario(markup())
  await watch(scheduler(page), 'event-change')
  await drag(page, await at(page, 'ana', '09:45'), await at(page, 'aurora', '10:45'))
  expect(await events(scheduler(page))).toEqual([
    { event: expect.objectContaining({ id: 'kickoff' }), start: '2026-11-09T10:00', end: '2026-11-09T11:30', resource: 'aurora' },
  ])
  // The scheduler never changes `events` itself.
  await expect(bar(page, 'Kick-off')).toHaveAccessibleName(/Ana Ruiz, Monday 9 November, 09:00 to 10:30/)

  const review = (await bar(page, 'Design review').boundingBox())!
  const edge = { x: review.x + review.width - 2, y: review.y + review.height / 2 }
  await drag(page, edge, { x: (await at(page, 'ana', '14:00')).x, y: edge.y })
  expect((await events(scheduler(page)))[1]).toMatchObject({ start: '2026-11-09T11:30', end: '2026-11-09T14:00', resource: 'ana' })

  const standup = await at(page, 'aurora', '09:30')
  await page.mouse.move(standup.x, standup.y)
  await page.mouse.down()
  await page.mouse.move(standup.x + 120, standup.y, { steps: 5 })
  await expect(scheduler(page).locator('.preview')).toHaveCount(1)
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await expect(scheduler(page).locator('.preview')).toHaveCount(0)
  expect(await events(scheduler(page))).toHaveLength(2)

  // A read-only booking does not move.
  await drag(page, await at(page, 'borealis', '13:30'), await at(page, 'borealis', '15:30'))
  expect(await events(scheduler(page))).toHaveLength(2)
})

test('from the keyboard: the slot cursor walks every slot past bookings, Enter selects or steps onto a bar, which moves, resizes and changes row', async ({
  page,
  renderScenario,
}) => {
  await renderScenario(markup())
  await page.evaluate(() => (window as unknown as { applyChanges: (element: Element) => void }).applyChanges(document.querySelector('c2-scheduler')!))
  await watch(scheduler(page), 'range-select')
  // The grid is one Tab stop: the first row, at the scroll time.
  await scheduler(page).getByRole('button', { name: 'Next day' }).focus()
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab')
  expect(await activeName(page)).toBe('Ana Ruiz, Monday 9 November, 08:00 to 09:00')
  await page.keyboard.press('Enter')
  expect(await events(scheduler(page))).toEqual([{ resource: 'ana', start: '2026-11-09T08:00', end: '2026-11-09T09:00' }])
  await expect(scheduler(page).getByRole('status')).toHaveText('New booking for Ana Ruiz, Monday 9 November, 08:00 to 09:00')

  // The cursor walks over booked slots, which read their bookings, and on past two bookings to free time.
  await page.keyboard.press('ArrowRight')
  expect(await activeName(page)).toBe('Ana Ruiz, Monday 9 November, 09:00 to 10:00, booked: Kick-off')
  for (const label of ['10:00 to 11:00, booked: Kick-off', '11:00 to 12:00, booked: Design review', '12:00 to 13:00, booked: Design review']) {
    await page.keyboard.press('ArrowRight')
    expect(await activeName(page)).toBe(`Ana Ruiz, Monday 9 November, ${label}`)
  }
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  expect(await activeName(page)).toBe('Ana Ruiz, Monday 9 November, 14:00 to 15:00')
  await page.keyboard.press('Enter')
  expect((await events(scheduler(page))).at(-1)).toEqual({ resource: 'ana', start: '2026-11-09T14:00', end: '2026-11-09T15:00' })

  // Enter on a booked slot steps onto its bar; Escape comes back to that slot.
  await page.keyboard.press('Home')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  expect(await activeName(page)).toBe('Ana Ruiz, Monday 9 November, 10:00 to 11:00, booked: Kick-off')
  await page.keyboard.press('Enter')
  expect(await activeName(page)).toBe('Kick-off, Ana Ruiz, Monday 9 November, 09:00 to 10:30')
  await page.keyboard.press('Escape')
  expect(await activeName(page)).toBe('Ana Ruiz, Monday 9 November, 10:00 to 11:00, booked: Kick-off')

  // On the bar, the arrows move it, Shift resizes it and Alt changes its row.
  await page.keyboard.press('Enter')
  await page.keyboard.press('ArrowRight')
  await expect.poll(() => activeName(page)).toBe('Kick-off, Ana Ruiz, Monday 9 November, 09:15 to 10:45')
  await expect(scheduler(page).getByRole('status')).toHaveText('Kick-off moved to Ana Ruiz, Monday 9 November, 09:15 to 10:45')
  await page.keyboard.press('Shift+ArrowRight')
  await expect.poll(() => activeName(page)).toBe('Kick-off, Ana Ruiz, Monday 9 November, 09:15 to 11:00')
  await page.keyboard.press('Alt+ArrowDown')
  await expect.poll(() => activeName(page)).toBe('Kick-off, Kenji Ono, Monday 9 November, 09:15 to 11:00')
  // Escape goes back to the slot cursor where the bar starts on its new row; Down moves to the next row.
  await page.keyboard.press('Escape')
  expect(await activeName(page)).toBe('Kenji Ono, Monday 9 November, 09:00 to 10:00, booked: Kick-off, Interviews')
  await page.keyboard.press('ArrowDown')
  expect(await activeName(page)).toBe('Aurora, Monday 9 November, 09:00 to 10:00, booked: Stand-up')
})

test('a keyboard move the app declines does not pull focus back on a later update', async ({ page, renderScenario }) => {
  await renderScenario(markup())
  await watch(scheduler(page), 'event-change')
  await bar(page, 'Stand-up').focus()
  await page.keyboard.press('ArrowRight')
  expect(await events(scheduler(page))).toHaveLength(1)
  // The app ignores the change; the user goes on to the header.
  await scheduler(page).getByRole('button', { name: 'Today' }).focus()
  await scheduler(page).evaluate((element) => {
    const host = element as HTMLElement & { events: unknown[] }
    host.events = [...host.events]
  })
  await expect.poll(() => scheduler(page).evaluate((element) => element.shadowRoot!.activeElement?.textContent?.trim())).toBe('Today')
})

test('a read-only booking steps aside instead of moving', async ({ page, renderScenario }) => {
  await renderScenario(markup())
  await watch(scheduler(page), 'event-change')
  await bar(page, 'One-on-one').focus()
  expect(await activeName(page)).toBe('One-on-one, Borealis, Monday 9 November, 13:00 to 14:30, read-only')
  await page.keyboard.press('ArrowRight')
  expect(await activeName(page)).toBe('Borealis, Monday 9 November, 15:00 to 16:00')
  expect(await events(scheduler(page))).toEqual([])
})

const ABSENCE_RESOURCES = [
  { id: 'ana', label: 'Ana Ruiz' },
  { id: 'ben', label: 'Ben Carter' },
  { id: 'lea', label: 'Léa Moreau' },
]
const ABSENCES = [
  { id: 'vacation', resource: 'ana', start: '2026-11-10', end: '2026-11-13', title: 'Vacation' },
  { id: 'request', resource: 'ben', start: '2026-11-11', end: '2026-11-12', title: 'Vacation', pending: true },
]
const BANDS = [
  { start: '2026-11-11', end: '2026-11-12', label: 'Armistice Day' },
  { start: '2026-11-13', end: '2026-11-14', label: 'Non-working day', resource: 'lea' },
]

function absenceMarkup(attributes = '') {
  return `<c2-scheduler view="week" date="2026-11-09" locale="en-GB" ${attributes}
    resources='${JSON.stringify(ABSENCE_RESOURCES)}' events='${JSON.stringify(ABSENCES)}'></c2-scheduler>`
}

test('the absence options are off by default: no band, no hatching and no summary row', async ({ page, renderScenario }) => {
  await renderScenario(markup(''))
  await expect(bar(page, 'Kick-off')).toBeVisible()
  await expect(scheduler(page).locator('.band, .event.pending, .summary')).toHaveCount(0)
  await expect(scheduler(page).getByRole('row')).toHaveCount(7)
})

test('a pending event is hatched and named pending', async ({ page, renderScenario }) => {
  await renderScenario(absenceMarkup())
  const request = scheduler(page).locator('.event[data-id="request"]')
  await expect(request).toHaveClass(/\bpending\b/)
  await expect(request).toHaveAccessibleName('Vacation, Ben Carter, Wednesday 11 November, 00:00 to 00:00, pending')
  await expect(scheduler(page).locator('.event[data-id="vacation"]')).not.toHaveClass(/\bpending\b/)
  expect(await request.evaluate((element) => getComputedStyle(element).backgroundImage)).toContain('repeating-linear-gradient')
  await accessible(page)
})

test('bands shade every row or one resource, label the header and are read with the slot', async ({ page, renderScenario }) => {
  await renderScenario(absenceMarkup(`bands='${JSON.stringify(BANDS)}'`))
  // The holiday is on every row and in the header; the non-working day only on its resource's row.
  await expect(lane(page, 'ana').locator('.band')).toHaveCount(1)
  await expect(lane(page, 'lea').locator('.band')).toHaveCount(2)
  await expect(scheduler(page).locator('.scale .band')).toHaveCount(1)
  await expect(scheduler(page).locator('.scale .band')).toHaveAttribute('title', 'Armistice Day')
  // The band sits over its day: the third of seven columns.
  const lanebox = (await lane(page, 'ana').boundingBox())!
  const band = (await lane(page, 'ana').locator('.band').boundingBox())!
  expect(Math.abs(band.x - (lanebox.x + (2 / 7) * lanebox.width))).toBeLessThan(2)
  expect(Math.abs(band.width - lanebox.width / 7)).toBeLessThan(2)

  await lane(page, 'lea').focus()
  await page.keyboard.press('Home')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  expect(await activeName(page)).toBe('Léa Moreau, Wednesday 11 November, 00:00 to 00:00, Armistice Day')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  expect(await activeName(page)).toBe('Léa Moreau, Friday 13 November, 00:00 to 00:00, Non-working day')
  await accessible(page)
})

test('renderSummary draws a summary row with one cell per column from the events over it', async ({ page, renderScenario }) => {
  await renderScenario(absenceMarkup('summary-heading="Out"'))
  await scheduler(page).evaluate((element) => {
    const host = element as HTMLElement & { renderSummary: (context: { start: string; events: { resource: string }[]; resources: unknown[] }) => string }
    host.renderSummary = ({ start, events, resources }) => (events.length ? `${start.slice(8, 10)}: ${events.length}/${resources.length}` : '')
  })
  const summary = scheduler(page).locator('.summary')
  await expect(summary.getByRole('rowheader')).toHaveText('Out')
  const cells = summary.locator('.summary-cell')
  await expect(cells).toHaveCount(7)
  await expect(cells).toHaveText(['', '10: 1/3', '11: 2/3', '12: 1/3', '', '', ''])
  // Without a heading the row is named by its message.
  await scheduler(page).evaluate((element) => element.removeAttribute('summary-heading'))
  await expect(summary.getByRole('rowheader')).toHaveText('Summary')
  await accessible(page)
})
