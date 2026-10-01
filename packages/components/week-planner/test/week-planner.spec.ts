import AxeBuilder from '@axe-core/playwright'
import { test, expect } from './fixture'

// Wednesday of ISO week 40 (an even week), 10:24.
test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date(2026, 8, 30, 10, 24) })
})

test('places a block from its start to its end time', async ({ page, scenario }) => {
  await scenario('every-week')
  const workshop = await page.getByRole('button', { name: 'Workshop, Tuesday 10:00–12:00' }).boundingBox()
  const standup = await page.getByRole('button', { name: 'Stand-up, Monday 08:30–09:00' }).boundingBox()
  // 48px per hour: two hours tall, half an hour tall.
  expect(workshop!.height).toBeCloseTo(96 - 2, 0)
  expect(standup!.height).toBeCloseTo(24 - 2, 0)
  expect(workshop!.x).toBeGreaterThan(standup!.x)
})

test('cascades overlapping events instead of splitting the column', async ({ page, scenario }) => {
  await scenario('every-week')
  const column = await page.locator('c2-week-planner').getByRole('group', { name: 'Tuesday' }).boundingBox()
  const workshop = await page.getByRole('button', { name: /^Workshop/ }).boundingBox()
  const review = await page.getByRole('button', { name: /^Review/ }).boundingBox()
  // The first takes the whole column, the second steps in by a quarter and runs to the right edge.
  // Within 1.5px: the column box includes its 1px grid line.
  const near = (actual: number, expected: number) => expect(Math.abs(actual - expected)).toBeLessThan(1.5)
  near(workshop!.width, column!.width - 4)
  near(review!.x - column!.x, column!.width / 4 + 2)
  near(review!.x + review!.width, workshop!.x + workshop!.width)
  expect(review!.y).toBeGreaterThan(workshop!.y)
})

test('keeps every line of a block inside it when the hour rows are short', async ({ page, scenario }) => {
  await scenario('every-week')
  const planner = page.locator('c2-week-planner')
  await planner.evaluate((element) => element.style.setProperty('--c2-week-planner__hour--height', '24px'))
  // Review (90 minutes) is 34px: too short for title and time on two lines, so they share one row. Workshop (two
  // hours, 46px) keeps two.
  await expect(page.getByRole('button', { name: /^Review/ }).locator('.event-body')).toHaveCSS('flex-direction', 'row')
  await expect(page.getByRole('button', { name: /^Workshop/ }).locator('.event-body')).toHaveCSS('flex-direction', 'column')
  // (Stand-up, 30 minutes, is 10px: no line fits, the block just clips it.)
  for (const name of [/^Workshop/, /^Review/]) {
    const event = page.getByRole('button', { name }).first()
    const box = (await event.boundingBox())!
    for (const part of await event.locator('.event-title, .event-time').all()) {
      if (!(await part.isVisible())) continue
      const line = (await part.boundingBox())!
      expect(line.y).toBeGreaterThanOrEqual(box.y - 0.5)
      expect(line.y + line.height).toBeLessThanOrEqual(box.y + box.height + 0.5)
    }
  }
})

test('wraps a title between words and never splits a word', async ({ page, scenario }) => {
  await scenario('every-week')
  const title = page.getByRole('button', { name: /^Workshop/ }).locator('.event-title')
  await expect(title).toHaveCSS('overflow-wrap', 'normal')
  await expect(title).toHaveCSS('hyphens', 'manual')
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
  // Hour lines are translucent, so they still show over the tint instead of blending into it.
  await expect(column.locator('.hour-line').first()).toHaveCSS('border-bottom-color', 'rgba(24, 24, 27, 0.06)')
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
  // The current week's number sits in a badge on its own button only.
  await expect(page.getByRole('button', { name: 'Even week 40 this week' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Odd week', exact: true })).toBeVisible()
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

test('keeps white text on an event with its own colour when the theme darkens the default text', async ({ page, scenario }) => {
  await scenario()
  await page.locator('c2-week-planner').evaluate((element) => (element as HTMLElement).style.setProperty('--c2-week-planner__event--color', 'rgb(24, 24, 27)'))
  await expect(page.getByRole('button', { name: /^Review/ })).toHaveCSS('color', 'rgb(255, 255, 255)')
  await expect(page.getByRole('button', { name: /^Workshop/ })).toHaveCSS('color', 'rgb(24, 24, 27)')
})

test('speaks the language set in locale', async ({ page, scenario }) => {
  await scenario('french')
  await expect(page.getByRole('region', { name: 'Planning de la semaine' })).toBeVisible()
  await expect(page.locator('c2-week-planner').locator('c2-button-group')).toHaveAttribute('aria-label', 'Type de semaine')
  await expect(page.getByRole('button', { name: 'Semaine paire 40 cette semaine' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Semaine impaire', exact: true })).toBeVisible()
  await expect(page.locator('c2-week-planner').locator('.day-header').first()).toHaveText('lun.')
  await expect(page.getByRole('group', { name: /^mercredi, aujourd/ })).toBeVisible()
})

test.describe('without a locale attribute', () => {
  test.use({ locale: 'fr-FR' })

  test("follows the browser's language", async ({ page, scenario }) => {
    await scenario('browser-locale')
    await expect(page.getByRole('button', { name: 'Semaine paire 40 cette semaine' })).toBeVisible()
  })
})

test.describe('first day of the week', () => {
  for (const [locale, first] of [
    ['en-US', 'Sun'],
    ['en-GB', 'Mon'],
    ['fr', 'lun.'],
    ['ar-EG-u-nu-latn', 'السبت'],
  ]) {
    test(`follows the convention of ${locale}`, async ({ page, scenario }) => {
      await scenario(`week-${locale}`)
      await expect(page.locator('c2-week-planner').locator('.day-header').first()).toHaveText(first)
    })
  }

  test('lets week-start override the locale', async ({ page, scenario }) => {
    await scenario('week-en-US')
    await page.locator('c2-week-planner').evaluate((element) => element.setAttribute('week-start', 'monday'))
    await expect(page.locator('c2-week-planner').locator('.day-header').first()).toHaveText('Mon')
  })
})

test('shows one day of a swipeable strip on a narrow planner, opening on today', async ({ page, scenario }) => {
  await scenario('narrow')
  const planner = page.locator('c2-week-planner')
  const scroller = planner.locator('.scroller')
  const today = planner.getByRole('group', { name: 'Wednesday, today' })
  await expect(today).toBeInViewport({ ratio: 1 })
  await expect(planner.getByRole('group', { name: 'Tuesday' })).not.toBeInViewport()
  const { width } = (await today.boundingBox())!
  expect(width).toBeCloseTo((await scroller.boundingBox())!.width, 0)
  await expect(scroller).toHaveCSS('scroll-snap-type', 'x mandatory')

  // The arrows page one day at a time; the hour labels stay where they are.
  const label = planner.locator('.hour-label').first()
  const labelBox = await label.boundingBox()
  await planner.getByRole('button', { name: 'Previous days' }).click()
  await expect(planner.getByRole('group', { name: 'Tuesday' })).toBeInViewport({ ratio: 1 })
  await expect(page.getByRole('button', { name: /^Workshop/ })).toBeInViewport()
  expect((await label.boundingBox())!.x).toBeCloseTo(labelBox!.x, 0)
  await planner.getByRole('button', { name: 'Previous days' }).click()
  await expect(planner.getByRole('group', { name: 'Monday' })).toBeInViewport({ ratio: 1 })
  await expect(planner.getByRole('button', { name: 'Previous days' })).toBeDisabled()
})

test('shows three days on a medium planner and all seven on a wide one', async ({ page, scenario }) => {
  await scenario('medium')
  const planner = page.locator('c2-week-planner')
  await expect(planner.getByRole('group', { name: 'Wednesday, today' })).toBeInViewport({ ratio: 1 })
  const columns = planner.locator('.day')
  const scrollerWidth = (await planner.locator('.scroller').boundingBox())!.width
  expect((await columns.first().boundingBox())!.width).toBeCloseTo(scrollerWidth / 3, 0)
  await expect(planner.getByRole('button', { name: 'Next days' })).toBeVisible()

  await scenario()
  await expect(planner.getByRole('button', { name: 'Next days' })).toBeHidden()
  for (const day of ['Monday', 'Sunday']) await expect(planner.getByRole('group', { name: day })).toBeInViewport({ ratio: 1 })
})

test('keeps a content-sized planner from collapsing', async ({ page, scenario }) => {
  await scenario()
  const planner = page.locator('c2-week-planner')
  await planner.evaluate((element) => element.style.removeProperty('width'))
  // The scenario's flex row sizes its items from their content; the planner falls back to its intrinsic 720px.
  await expect.poll(async () => (await planner.boundingBox())!.width).toBeGreaterThan(700)
})

test('has no automatically detectable accessibility violations on a narrow planner', async ({ page, scenario }) => {
  await scenario('narrow')
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(results.violations).toEqual([])
})

test('shows a heading that also names the planner', async ({ page, scenario }) => {
  await scenario('heading')
  const planner = page.locator('c2-week-planner')
  await expect(planner.getByRole('heading', { name: 'Team schedule', level: 2 })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Team schedule' })).toBeVisible()

  // Next to the switch, the heading takes the free space and pushes the switch to the end.
  await scenario('heading-alternate')
  const heading = await planner.getByRole('heading', { name: 'Team schedule' }).boundingBox()
  const evenWeek = await planner.getByRole('button', { name: /^Even week/ }).boundingBox()
  expect(evenWeek!.x).toBeGreaterThan(heading!.x + heading!.width - 1)
  expect(Math.abs(evenWeek!.y + evenWeek!.height / 2 - (heading!.y + heading!.height / 2))).toBeLessThan(2)
})

test('has no header without a heading or the switch on a wide planner', async ({ page, scenario }) => {
  await scenario()
  await expect(page.locator('c2-week-planner').locator('.header')).toBeHidden()
  await expect(page.locator('c2-week-planner').getByRole('heading')).toHaveCount(0)
})
