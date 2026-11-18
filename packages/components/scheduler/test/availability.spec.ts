import type { Page } from '@playwright/test'
import { test, expect, accessible, watch } from '../../../../tests/component-fixture'

// Four attendees on Monday 9 November 2026: Ana is busy 09:00 to 10:30, Ben has a pending interview 10:00 to 11:00,
// Chloé a talk 13:00 to 14:00 and Dev the gym 08:00 to 09:30.
const ATTENDEES = [
  { id: 'ana', label: 'Ana Ruiz' },
  { id: 'ben', label: 'Ben Carter' },
  { id: 'chloe', label: 'Chloé Martin' },
  { id: 'dev', label: 'Dev Patel' },
]

const BOOKINGS = [
  { id: 'kickoff', resource: 'ana', start: '2026-11-09T09:00', end: '2026-11-09T10:30', title: 'Kick-off', readonly: true },
  { id: 'interview', resource: 'ben', start: '2026-11-09T10:00', end: '2026-11-09T11:00', title: 'Interview', pending: true, readonly: true },
  { id: 'talk', resource: 'chloe', start: '2026-11-09T13:00', end: '2026-11-09T14:00', title: 'Lunch talk', readonly: true },
  { id: 'gym', resource: 'dev', start: '2026-11-09T08:00', end: '2026-11-09T09:30', title: 'Gym', readonly: true },
]

const PROPOSAL = { start: '2026-11-09T10:00', end: '2026-11-09T11:00', title: 'Team sync' }

/** 07:00 to 19:00 in twelve 80px columns, so the whole day fits the viewport. */
function markup(attributes = `proposal='${JSON.stringify(PROPOSAL)}'`) {
  return `<c2-scheduler date="2026-11-09" day-start="07:00" day-end="19:00" locale="en-GB" ${attributes}
    style="--c2-scheduler__slot--width: 80px"
    resources='${JSON.stringify(ATTENDEES)}' events='${JSON.stringify(BOOKINGS)}'></c2-scheduler>`
}

const scheduler = (page: Page) => page.locator('c2-scheduler')
const lane = (page: Page, resource: string) => scheduler(page).locator(`.lane[data-resource="${resource}"]`)
const block = (page: Page) => scheduler(page).locator('.proposal')
const column = (page: Page, resource: string) => lane(page, resource).locator('.proposal-column')
const events = async (page: Page) => JSON.parse((await scheduler(page).getAttribute('data-events')) ?? '[]')
const activeName = (page: Page) => scheduler(page).evaluate((element) => element.shadowRoot!.activeElement?.getAttribute('aria-label') ?? '')
const settle = (page: Page) => page.evaluate(() => new Promise((resolve) => setTimeout(resolve)))

/** The page position of a time on a resource's row, for the day drawn from 07:00 to 19:00. */
async function at(page: Page, resource: string, time: string) {
  const box = (await lane(page, resource).boundingBox())!
  const [hours, minutes] = time.split(':').map(Number)
  return { x: box.x + ((hours * 60 + minutes - 420) / 720) * box.width, y: box.y + box.height / 2 }
}

/** Plays the app: each `proposal-change` is applied to `proposal`. */
async function applyChanges(page: Page) {
  await scheduler(page).evaluate((element) => {
    const host = element as HTMLElement & { proposal: Record<string, string> }
    element.addEventListener('proposal-change', (event) => {
      const { start, end } = (event as CustomEvent<{ start: string; end: string }>).detail
      host.proposal = { ...host.proposal, start, end }
    })
  })
}

test.beforeEach(async ({ page }) => {
  // Monday 9 November 2026, 08:00.
  await page.clock.install({ time: new Date(2026, 10, 9, 8, 0) })
})

test('without a proposal nothing of it is drawn', async ({ page, renderScenario }) => {
  await renderScenario(markup(''))
  await expect(scheduler(page).locator('.event')).toHaveCount(4)
  await expect(scheduler(page).locator('.proposal, .proposal-column')).toHaveCount(0)
  await expect(scheduler(page).getByRole('row')).toHaveCount(5)
  // An invalid proposal is ignored the same way.
  await scheduler(page).evaluate(
    (element) => ((element as HTMLElement & { proposal: unknown }).proposal = { start: '2026-11-09T11:00', end: '2026-11-09T10:00' }),
  )
  await settle(page)
  await expect(scheduler(page).locator('.proposal, .proposal-column')).toHaveCount(0)
})

test('the proposal is a block in the header and a column on every row, coloured by who is busy then', async ({ page, renderScenario }) => {
  await renderScenario(markup())
  await expect(block(page)).toHaveAccessibleName('Team sync, Monday 9 November, 10:00 to 11:00, busy: Ana Ruiz, tentative: Ben Carter')
  await expect(block(page)).toHaveText('Team sync')
  await expect(block(page)).toHaveClass(/\bbusy\b/)
  await expect(scheduler(page).locator('.proposal-column')).toHaveCount(4)
  await expect(column(page, 'ana')).toHaveClass(/\bbusy\b/)
  await expect(column(page, 'ben')).toHaveClass(/\btentative\b/)
  await expect(column(page, 'chloe')).not.toHaveClass(/\b(busy|tentative)\b/)
  const border = (resource: string) => column(page, resource).evaluate((element) => getComputedStyle(element).borderInlineStartColor)
  expect(await border('ana')).toBe('rgb(220, 38, 38)')
  expect(await border('ben')).toBe('rgb(217, 119, 6)')
  expect(await border('dev')).toBe('rgb(22, 163, 74)')
  // Block and columns sit over 10:00 to 11:00.
  const from = await at(page, 'chloe', '10:00')
  const to = await at(page, 'chloe', '11:00')
  for (const box of [(await block(page).boundingBox())!, (await column(page, 'chloe').boundingBox())!]) {
    expect(Math.abs(box.x - from.x)).toBeLessThanOrEqual(1)
    expect(Math.abs(box.x + box.width - to.x)).toBeLessThanOrEqual(1)
  }
  // The colours are variables.
  await scheduler(page).evaluate((element) => (element as HTMLElement).style.setProperty('--c2-scheduler__proposal__busy--color', 'rgb(1, 2, 3)'))
  expect(await border('ana')).toBe('rgb(1, 2, 3)')
  // Without a title the block is named by its message; when no one is busy it says so.
  await scheduler(page).evaluate((element) => {
    ;(element as HTMLElement & { proposal: unknown }).proposal = { start: '2026-11-09T11:00', end: '2026-11-09T12:00' }
  })
  await expect(block(page)).toHaveAccessibleName('Proposed time, Monday 9 November, 11:00 to 12:00, everyone is free')
  await expect(block(page)).not.toHaveClass(/\b(busy|tentative)\b/)
  await accessible(page)
})

test('dragging the column on a row moves the proposal, checked on drop; Escape cancels', async ({ page, renderScenario }) => {
  await renderScenario(markup(`editable proposal='${JSON.stringify(PROPOSAL)}'`))
  await watch(scheduler(page), 'proposal-change')
  await scheduler(page).evaluate((element) => element.addEventListener('range-select', () => element.setAttribute('data-selected', '')))
  const start = await at(page, 'chloe', '10:30')
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move((await at(page, 'chloe', '13:15')).x, start.y, { steps: 8 })
  // While it moves, it is neutral: who is busy is not checked on every move.
  await expect(column(page, 'ana')).toHaveClass(/\bmoving\b/)
  await expect(block(page)).toHaveClass(/\bmoving\b/)
  const moved = (await column(page, 'chloe').boundingBox())!
  expect(Math.abs(moved.x - (await at(page, 'chloe', '12:45')).x)).toBeLessThanOrEqual(1)
  await page.mouse.up()
  await settle(page)
  expect(await events(page)).toEqual([{ start: '2026-11-09T12:45', end: '2026-11-09T13:45', busy: ['chloe'], tentative: [] }])
  // The scheduler never moves the proposal itself.
  await expect(block(page)).toHaveAccessibleName(/10:00 to 11:00/)
  await expect(column(page, 'ana')).toHaveClass(/\bbusy\b/)

  // The header block's edge resizes it.
  const box = (await block(page).boundingBox())!
  const edge = { x: box.x + box.width - 2, y: box.y + box.height / 2 }
  await page.mouse.move(edge.x, edge.y)
  await page.mouse.down()
  await page.mouse.move((await at(page, 'chloe', '12:00')).x, edge.y, { steps: 8 })
  await page.mouse.up()
  await settle(page)
  expect((await events(page))[1]).toEqual({ start: '2026-11-09T10:00', end: '2026-11-09T12:00', busy: ['ana'], tentative: ['ben'] })

  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x + 120, start.y, { steps: 5 })
  await expect(scheduler(page).locator('.proposal-column.moving')).toHaveCount(4)
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await settle(page)
  await expect(scheduler(page).locator('.proposal-column.moving')).toHaveCount(0)
  expect(await events(page)).toHaveLength(2)
  // A press on the proposal never starts a new booking.
  await page.mouse.click(start.x, start.y)
  await settle(page)
  expect(await scheduler(page).getAttribute('data-selected')).toBeNull()
  expect(await events(page)).toHaveLength(2)
})

test('from the keyboard the arrows move the proposal, Shift changes its end, and each move is announced', async ({ page, renderScenario }) => {
  await renderScenario(markup())
  await applyChanges(page)
  await watch(scheduler(page), 'proposal-change')
  await block(page).focus()
  await expect.poll(() => activeName(page)).toBe('Team sync, Monday 9 November, 10:00 to 11:00, busy: Ana Ruiz, tentative: Ben Carter')
  await page.keyboard.press('ArrowRight')
  await expect.poll(() => activeName(page)).toBe('Team sync, Monday 9 November, 10:15 to 11:15, busy: Ana Ruiz, tentative: Ben Carter')
  await expect(scheduler(page).getByRole('status')).toHaveText('Team sync, Monday 9 November, 10:15 to 11:15, busy: Ana Ruiz, tentative: Ben Carter')
  await page.keyboard.press('Shift+ArrowLeft')
  await expect.poll(() => activeName(page)).toBe('Team sync, Monday 9 November, 10:15 to 11:00, busy: Ana Ruiz, tentative: Ben Carter')
  for (let step = 0; step < 3; step++) {
    await page.keyboard.press('ArrowRight')
    await settle(page)
  }
  await expect.poll(() => activeName(page)).toBe('Team sync, Monday 9 November, 11:00 to 11:45, everyone is free')
  await expect(block(page)).not.toHaveClass(/\b(busy|tentative)\b/)
  expect((await events(page)).at(-1)).toEqual({ start: '2026-11-09T11:00', end: '2026-11-09T11:45', busy: [], tentative: [] })
  // A resize never goes below one snap step.
  for (let step = 0; step < 4; step++) {
    await page.keyboard.press('Shift+ArrowLeft')
    await settle(page)
  }
  await expect.poll(() => activeName(page)).toBe('Team sync, Monday 9 November, 11:00 to 11:15, everyone is free')
})

test('findFreeTime returns the first time no one is booked, within working hours and off the weekend', async ({ page, renderScenario }) => {
  await renderScenario(markup(''))
  const find = (minutes: number, after?: string) =>
    scheduler(page).evaluate(
      (element, [length, from]) =>
        (element as HTMLElement & { findFreeTime: (minutes: number, after?: string) => unknown }).findFreeTime(length as number, from as string | undefined),
      [minutes, after] as const,
    )
  // 09:00 is Ana's and Dev's, 10:30 still Ben's pending interview.
  expect(await find(60)).toEqual({ start: '2026-11-09T11:00', end: '2026-11-09T12:00' })
  expect(await find(30)).toEqual({ start: '2026-11-09T11:00', end: '2026-11-09T11:30' })
  expect(await find(60, '2026-11-09T12:30')).toEqual({ start: '2026-11-09T14:00', end: '2026-11-09T15:00' })
  expect(await find(60, '2026-11-09T17:30')).toBeNull()
  expect(await find(0)).toBeNull()
  // A Saturday has no working time.
  await scheduler(page).evaluate((element) => element.setAttribute('date', '2026-11-14'))
  expect(await find(60)).toBeNull()
})

test('renderProposal draws the block from who is free', async ({ page, renderScenario }) => {
  await renderScenario(markup())
  await scheduler(page).evaluate((element) => {
    const host = element as HTMLElement & {
      renderProposal: (context: { title: string; start: string; busy: unknown[]; tentative: unknown[]; resources: unknown[] }) => string
    }
    host.renderProposal = ({ title, start, busy, tentative, resources }) =>
      `${title} ${start.slice(11)}: ${resources.length - busy.length - tentative.length}/${resources.length}`
  })
  await expect(block(page)).toHaveText('Team sync 10:00: 2/4')
  // Its name stays the scheduler's.
  await expect(block(page)).toHaveAccessibleName(/^Team sync, Monday 9 November, 10:00 to 11:00, busy: Ana Ruiz/)
  await accessible(page)
})
