import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import type { MonthPlanner } from '../src/month-planner'
import { test, expect } from './fixture'

/** The planner's inner elements, for assertions on what is drawn rather than read. */
const shadow = (page: Page, selector: string) => page.locator('c2-month-planner').locator(selector)

async function axe(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  return results.violations
}

test.describe('agenda view', () => {
  // Today must not fall in the month shown, or it adds a group of its own.
  test.beforeEach(async ({ page }) => page.clock.install({ time: new Date(2026, 10, 18, 10) }))

  test('lists the days that have events, each under its own heading', async ({ page, scenario }) => {
    await scenario('agenda')
    const list = page.getByRole('list', { name: 'Events by day' })
    await expect(list).toBeVisible()
    // Vacation covers September 10 – 15 and Moving week the 28th onwards: nine days.
    await expect(list.locator(':scope > li')).toHaveCount(9)
    await expect(page.getByRole('heading', { level: 3 })).toHaveText([
      'Thursday, September 10',
      'Friday, September 11',
      'Saturday, September 12',
      'Sunday, September 13',
      'Monday, September 14',
      'Tuesday, September 15',
      'Monday, September 28',
      'Tuesday, September 29',
      'Wednesday, September 30',
    ])
    // The 10th: the longer event first, then the one-day flight; the grid is not drawn.
    const tenth = list.locator(':scope > li').first().getByRole('button')
    await expect(tenth).toHaveText([/Vacation/, /Flight/])
    await expect(tenth.first()).toHaveAccessibleName('Vacation, September 10, 2026 – September 15, 2026')
    await expect(shadow(page, '.weeks')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'September 2026' })).toBeVisible()
  })

  test('reads the view from its attribute', async ({ page, scenario }) => {
    await scenario('agenda-attribute')
    await expect(page.getByRole('list', { name: 'Events by day' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Flight, September 10, 2026' })).toHaveCount(1)
  })

  test('opens an event from the keyboard', async ({ page, scenario }) => {
    await scenario('agenda')
    await page.getByRole('button', { name: 'Flight, September 10, 2026' }).press('Enter')
    await expect(page.getByRole('status')).toHaveText('click:flight')
    await page
      .getByRole('button', { name: /^Moving week/ })
      .first()
      .press('Space')
    await expect(page.getByRole('status')).toHaveText('click:move')
  })

  test('pages between months and follows new events', async ({ page, scenario }) => {
    await scenario('agenda')
    await page.getByRole('button', { name: 'Next month' }).press('Enter')
    await expect(page.getByRole('status')).toHaveText('month:2026-10')
    // Moving week continues from September 28 to October 4.
    await expect(page.getByRole('heading', { level: 3 })).toHaveText(['Thursday, October 1', 'Friday, October 2', 'Saturday, October 3', 'Sunday, October 4'])
    await page.locator('c2-month-planner').evaluate((planner: MonthPlanner) => {
      planner.events = [...planner.events, { id: 'review', title: 'Review', start: '2026-10-20' }]
    })
    await expect(page.getByRole('heading', { level: 3 })).toHaveCount(5)
    await expect(page.getByRole('button', { name: 'Review, October 20, 2026' })).toHaveCount(1)
  })

  test('marks today, even on a day without events', async ({ page, scenario }) => {
    await page.clock.setSystemTime(new Date(2026, 8, 20, 10))
    await scenario('agenda')
    const today = page.getByRole('heading', { name: 'Sunday, September 20 Today' })
    await expect(today).toHaveAttribute('aria-current', 'date')
    await expect(shadow(page, '.agenda-day.today .agenda-empty')).toHaveText('No events')
    // In date order, between the 15th and the 28th.
    await expect(page.getByRole('heading', { level: 3 })).toHaveCount(10)
    await expect(page.getByRole('heading', { level: 3 }).nth(6)).toHaveText('Sunday, September 20 Today')
  })

  test('says so for a month without events, through the empty slot', async ({ page, scenario }) => {
    await scenario('agenda')
    await page.getByRole('button', { name: 'Previous month' }).press('Enter')
    await expect(page.getByRole('heading', { name: 'August 2026' })).toBeVisible()
    await expect(shadow(page, '[part="empty"]')).toHaveText('No events this month')
    await expect(page.getByRole('list', { name: 'Events by day' })).toHaveCount(0)

    await scenario('agenda-empty-slot')
    await page.getByRole('button', { name: 'Previous month' }).press('Enter')
    await expect(page.getByText('Nothing planned')).toBeVisible()
  })

  test('draws each event through renderAgendaEvent, keeping the button', async ({ page, scenario }) => {
    await scenario('agenda-renderer')
    const flight = page.getByRole('button', { name: 'Flight, September 10, 2026' })
    await expect(flight).toHaveText('Flight [2026-09-10 2026-09-10..2026-09-10]')
    await expect(page.getByRole('button', { name: /^Vacation/ }).nth(2)).toHaveText('Vacation [2026-09-12 2026-09-10..2026-09-15]')
    await flight.press('Enter')
    await expect(page.getByRole('status')).toHaveText('click:flight')
  })

  test('keeps the day heading at the top while its events scroll past', async ({ page, scenario }) => {
    await scenario('agenda')
    const list = shadow(page, '.agenda-view')
    await page.locator('c2-month-planner').evaluate((planner) => planner.style.setProperty('--c2-month-planner__agenda--max-height', '160px'))
    await expect.poll(async () => (await list.boundingBox())?.height).toBeLessThanOrEqual(161)
    // Scroll the second day's top 10px past the list's top edge: its heading stays on that edge, the first day's is gone.
    await list.evaluate((element) => {
      const day = element.children[1]
      element.scrollTop += day.getBoundingClientRect().top - element.getBoundingClientRect().top + 10
    })
    await expect
      .poll(() =>
        list.evaluate((element) => {
          const heading = element.children[1].querySelector('h3')!
          return Math.abs(heading.getBoundingClientRect().top - element.getBoundingClientRect().top)
        }),
      )
      // Sticky offsets land on different subpixels per engine.
      .toBeLessThanOrEqual(1)
    await expect
      .poll(() =>
        list.evaluate((element) => {
          const heading = element.children[0].querySelector('h3')!
          return heading.getBoundingClientRect().bottom <= element.getBoundingClientRect().top + 1
        }),
      )
      .toBe(true)
  })

  test('goes back to the grid', async ({ page, scenario }) => {
    await scenario('agenda')
    await page.locator('c2-month-planner').evaluate((planner: MonthPlanner) => (planner.view = 'month'))
    await expect(page.getByRole('list', { name: 'Events by day' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Vacation, September 10, 2026 – September 15, 2026' })).toHaveCount(2)
  })

  test('keeps its list on a narrow planner', async ({ page, scenario }) => {
    await scenario('agenda-compact')
    await expect(page.getByRole('list', { name: 'Events by day' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Flight, September 10, 2026' })).toBeVisible()
  })

  test('has no axe violations', async ({ page, scenario }) => {
    await scenario('agenda-changes')
    await expect(page.getByRole('list', { name: 'Events by day' })).toBeVisible()
    expect(await axe(page)).toEqual([])
  })
})

test.describe('background events', () => {
  test('draws a band behind the days, not a bar', async ({ page, scenario }) => {
    await scenario('changes')
    // Monday 14 – Friday 18 is one week row with a Monday start; the window on the 26th is in the next one.
    await expect(shadow(page, '[part="band"]')).toHaveCount(2)
    const band = shadow(page, '[part="band"]').first()
    const label = shadow(page, '[part="band-label"]').filter({ hasText: 'Change freeze' })
    await expect(label.locator('[aria-hidden="true"]')).toHaveText('Change freeze')
    await expect(page.getByText('Change freeze, September 14, 2026 – September 18, 2026')).toHaveCount(1)
    await expect(page.getByRole('button', { name: /Change freeze|Maintenance window/ })).toHaveCount(0)

    // The title has a row of its own under the day numbers, and the bar on the 16th its lane under that.
    const deploy = page.getByRole('button', { name: 'Deploy billing API, September 16, 2026' })
    const [bandBox, labelBox, barBox] = [await band.boundingBox(), await label.boundingBox(), await deploy.boundingBox()]
    // Grid tracks round to different subpixels per engine: allow a pixel.
    expect(Math.abs(labelBox!.x - bandBox!.x)).toBeLessThanOrEqual(1)
    expect(labelBox!.y).toBeGreaterThanOrEqual(bandBox!.y + 19)
    expect(barBox!.x).toBeGreaterThan(bandBox!.x)
    expect(barBox!.x + barBox!.width).toBeLessThan(bandBox!.x + bandBox!.width)
    expect(barBox!.y).toBeGreaterThanOrEqual(labelBox!.y + labelBox!.height - 1)
    await deploy.click()
    await expect(page.getByRole('status')).toHaveText('click:deploy')
  })

  test('gives overlapping bands a title row each', async ({ page, scenario }) => {
    await scenario('changes-overlap')
    const freeze = await shadow(page, '[part="band-label"]').filter({ hasText: 'Change freeze' }).boundingBox()
    const network = await shadow(page, '[part="band-label"]').filter({ hasText: 'Network window' }).boundingBox()
    expect(network!.y).toBeGreaterThanOrEqual(freeze!.y + freeze!.height - 1)
    // The bar moves below both rows.
    const deploy = await page.getByRole('button', { name: 'Deploy billing API, September 16, 2026' }).boundingBox()
    expect(deploy!.y).toBeGreaterThanOrEqual(network!.y + network!.height - 1)
  })

  test('uses its own colour as the shade', async ({ page, scenario }) => {
    await scenario('changes')
    await expect(shadow(page, '[part="band"]').last()).toHaveCSS('background-color', 'rgba(180, 83, 9, 0.16)')
  })

  test('lets a press through to the day under it when editable', async ({ page, scenario }) => {
    await scenario('changes-editable')
    // Read with the days' own names on the editable grid, not a second time from the title.
    await expect(page.getByText('Change freeze, September 14, 2026 – September 18, 2026')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'September 15, 2026, Change freeze', exact: true })).toHaveCount(1)
    const band = shadow(page, '[part="band"]').first()
    await band.scrollIntoViewIfNeeded()
    const box = (await band.boundingBox())!
    // The bottom of the band's first day, the 14th, below its bars.
    await page.mouse.click(box.x + box.width / 10, box.y + box.height - 6)
    await expect(page.getByRole('status')).toHaveText('day:2026-09-14')
  })

  test('is read with the day on a compact planner, and listed first', async ({ page, scenario }) => {
    await page.clock.install({ time: new Date(2026, 8, 16, 10) })
    await scenario('changes-compact')
    await expect(shadow(page, '[part="band"]').first()).toBeHidden()
    await expect(page.getByRole('button', { name: 'September 15, 2026, Change freeze', exact: true })).toHaveCount(1)
    const today = page.getByRole('button', { name: 'September 16, 2026, today, Change freeze, has events' })
    await expect(today).toHaveAttribute('aria-pressed', 'true')
    // One dot, for the deploy: a band is not an event dot.
    await expect(today.locator('.dot')).toHaveCount(1)
    const listed = page.getByRole('region', { name: 'Wednesday, September 16' }).getByRole('listitem')
    await expect(listed).toHaveText([/Change freeze/, /Deploy billing API/])
    await expect(listed.first().getByRole('button')).toHaveCount(0)
  })

  test('is listed first under its days in the agenda view', async ({ page, scenario }) => {
    await page.clock.install({ time: new Date(2026, 10, 18, 10) })
    await scenario('agenda-changes')
    const sixteenth = page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: 'Wednesday, September 16' }) })
    await expect(sixteenth.getByRole('listitem')).toHaveText([/Change freeze/, /Deploy billing API/])
    await expect(sixteenth.getByRole('button')).toHaveCount(1)
  })

  test('costs nothing while unused: no band and no list are drawn', async ({ page, scenario }) => {
    await scenario()
    await expect(page.getByRole('button', { name: /^Vacation/ })).toHaveCount(2)
    await expect(shadow(page, '.band')).toHaveCount(0)
    await expect(shadow(page, '.agenda-view')).toHaveCount(0)
    await expect(shadow(page, '.agenda-list .background')).toHaveCount(0)
  })

  test('has no axe violations', async ({ page, scenario }) => {
    await scenario('changes')
    await expect(shadow(page, '[part="band"]').first()).toBeVisible()
    expect(await axe(page)).toEqual([])
  })
})
