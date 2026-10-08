import AxeBuilder from '@axe-core/playwright'
import type { Locator } from '@playwright/test'
import { expect as baseExpect } from '@playwright/test'
import { hostAria } from '../../../../tests/component-fixture'
import { test, expect } from './fixture'

// Formatted times in names and the axis follow the browser's zone; pin it so they are the same on every machine.
test.use({ timezoneId: 'UTC' })

const segment = (subject: Locator, name: string | RegExp) => subject.getByRole('gridcell', { name })
const width = async (locator: Locator) => (await locator.boundingBox())!.width

test('draws one band per series, sized by time, with a legend and an axis', async ({ page, scenario }) => {
  await scenario()
  const subject = page.locator('c2-state-timeline')
  baseExpect(await hostAria(subject, 'role')).toBe('grid')
  baseExpect(await hostAria(subject, 'aria-label')).toBe('Service status')
  await expect(subject.getByRole('row')).toHaveCount(3)
  await expect(subject.getByRole('rowheader')).toHaveText(['API', 'Database', 'Worker'])
  await expect(subject.getByRole('gridcell')).toHaveCount(8)

  // A segment without an end lasts until the next one starts; the last one runs to `end`.
  const degraded = segment(subject, 'API: Degraded, 8 Oct, 10:00 – 8 Oct, 10:30, 30 min')
  const recovered = segment(subject, 'API: Operational, 8 Oct, 10:30 – 8 Oct, 12:00, 1 h 30 min')
  await expect(degraded).toBeVisible()
  await expect(recovered).toBeVisible()
  baseExpect(Math.abs((await width(recovered)) / (await width(degraded)) - 3)).toBeLessThan(0.1)

  // Wide segments write their state; a null state is an empty "No data" stretch.
  await expect(recovered).toContainText('Operational')
  await expect(segment(subject, /^Worker: No data, 8 Oct, 11:00/)).toBeVisible()
  await expect(subject.locator('[part="legend"] li')).toHaveText(['Operational', 'Degraded', 'Outage', 'No data'])
  await expect(subject.locator('[part="tick"]').first()).toHaveText('09:00')
  await expect(subject.locator('[part="tick"]').last()).toHaveText('12:00')
})

test('moves between segments and bands with the arrow keys behind a single tab stop', async ({ page, scenario, tab }) => {
  await scenario()
  const subject = page.locator('c2-state-timeline')
  await page.locator('#before').focus()
  await tab()
  const first = segment(subject, /^API: Operational, 8 Oct, 09:00/)
  await expect(first).toBeFocused()
  await expect(first).toHaveCSS('outline-style', 'solid')

  await page.keyboard.press('ArrowRight')
  await expect(segment(subject, /^API: Degraded/)).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(subject.getByRole('gridcell', { name: /^Database: / }).and(page.locator(':focus'))).toHaveCount(1)
  await page.keyboard.press('End')
  await expect(segment(subject, /^Database: Operational, 8 Oct, 10:45/)).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(segment(subject, /^Worker: No data/)).toBeFocused()
  await page.keyboard.press('Home')
  await expect(segment(subject, /^Worker: Operational/)).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowUp')
  await expect(segment(subject, /^API: Operational, 8 Oct, 09:00/)).toBeFocused()

  // The keyboard shows the tooltip of the focused segment.
  await expect(subject.locator('[part="tooltip"]')).toContainText('1 h')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('status')).toHaveText('click:API:ok:0')
  await tab()
  await expect(page.locator('#after')).toBeFocused()
  await tab(true)
  await expect(segment(subject, /^API: Operational, 8 Oct, 09:00/)).toBeFocused()
})

test('hovering a segment shows its tooltip and reports it; leaving hides it', async ({ page, scenario }) => {
  await scenario()
  const subject = page.locator('c2-state-timeline')
  const tooltip = subject.locator('[part="tooltip"]')
  await expect(tooltip).toHaveCount(0)
  await segment(subject, /^Database: Outage/).hover()
  await expect(tooltip).toBeVisible()
  await expect(tooltip).toContainText('Database')
  await expect(tooltip).toContainText('Outage')
  await expect(tooltip).toContainText('30 min')
  await page.mouse.move(5, 5)
  await expect(tooltip).toHaveCount(0)
  await expect(page.getByRole('status')).toHaveText('hover:Outage hover:none')
})

test('clicking a segment fires segment-click with the segment as given', async ({ page, scenario }) => {
  await scenario()
  await segment(page.locator('c2-state-timeline'), /^Database: Outage/).click()
  await expect(page.getByRole('status')).toContainText('click:Database:down:1')
})

test('without states or a range, it spans the data and colours each value on its own', async ({ page, scenario }) => {
  await scenario('auto')
  const subject = page.locator('c2-state-timeline')
  await expect(subject.getByRole('gridcell')).toHaveCount(3)
  await expect(subject.locator('[part="legend"] li')).toHaveText(['passed', 'failed'])
  const [passed, failed] = await subject
    .locator('[part="legend"] .swatch')
    .evaluateAll((swatches) => swatches.map((swatch) => getComputedStyle(swatch).backgroundColor))
  baseExpect(passed).not.toBe(failed)
  const track = (await subject.locator('[part="track"]').boundingBox())!
  const first = (await segment(subject, /^Build: passed, 8 Oct, 09:00:00/).boundingBox())!
  const last = (await segment(subject, /^Build: passed, 8 Oct, 09:20:00/).boundingBox())!
  baseExpect(Math.abs(first.x - track.x)).toBeLessThan(2)
  baseExpect(Math.abs(last.x + last.width - (track.x + track.width))).toBeLessThan(2)
})

test('reads series and states from JSON attributes', async ({ page, scenario }) => {
  await scenario('attribute')
  const subject = page.locator('c2-state-timeline')
  await expect(segment(subject, /^Build: Failed/)).toBeVisible()
  await expect(subject.locator('[part="legend"] li')).toHaveText(['Failed', 'passed'])
})

test('shows the empty slot when there is no series', async ({ page, scenario }) => {
  await scenario('empty')
  const subject = page.locator('c2-state-timeline')
  await expect(subject.getByRole('gridcell')).toHaveCount(0)
  await expect(subject.getByText('Nothing reported yet')).toBeVisible()
})

test('renderTooltip replaces the tooltip contents', async ({ page, scenario }) => {
  await scenario('tooltip')
  const subject = page.locator('c2-state-timeline')
  await segment(subject, /^API: Degraded/).hover()
  await expect(subject.locator('[part="tooltip"] .custom')).toHaveText('API is Degraded')
})

test('has no detectable accessibility violations', async ({ page, scenario }) => {
  await scenario()
  const results = await new AxeBuilder({ page }).include('c2-state-timeline').analyze()
  baseExpect(results.violations).toEqual([])
})
