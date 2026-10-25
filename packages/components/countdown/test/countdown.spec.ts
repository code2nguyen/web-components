import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { test, expect } from './fixture'

const NOW = new Date('2026-10-08T12:00:00Z')

// Paused, so time moves only through `runFor` and page-load time cannot shift a value.
test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: NOW.getTime() - 1000 })
  await page.clock.pauseAt(NOW)
})

const events = (page: Page) => page.evaluate(() => (window as unknown as { countdownEvents: { type: string; remaining?: number }[] }).countdownEvents)

test('draws a segment per unit and counts down', async ({ page, scenario }) => {
  await scenario()
  const subject = page.locator('#subject')
  await expect(subject.locator('.value')).toHaveText(['02', '14', '05', '31'])
  await expect(subject.locator('.label')).toHaveText(['days', 'hours', 'minutes', 'seconds'])
  await expect(subject).toHaveHostAria('role', 'timer')
  await expect(subject).toHaveState('running')

  await page.clock.runFor(2_000)
  await expect(subject.locator('.value')).toHaveText(['02', '14', '05', '29'])
  await page.clock.runFor(30_000)
  await expect(subject.locator('.value')).toHaveText(['02', '14', '04', '59'])
  // The last tick reports what was left when the value changed.
  const ticks = (await events(page)).filter(({ type }) => type === 'tick')
  expect(ticks.length).toBeGreaterThanOrEqual(2)
  expect(ticks.at(-1)?.remaining).toBeLessThanOrEqual(2 * 86_400_000 + 14 * 3_600_000 + 5 * 60_000 - 1000)
})

test('reads one unit name per count, singular included', async ({ page, scenario }) => {
  await scenario()
  await page.clock.runFor(30_000)
  await expect(page.locator('#subject .label').last()).toHaveText('second')
})

test('the largest unit absorbs the rest, and trim drops leading zeros', async ({ page, scenario }) => {
  await scenario('units')
  // Two days, three hours and 30 seconds in hours and minutes: the minute rounds up.
  await expect(page.locator('#subject .value')).toHaveText(['51', '01'])
  await expect(page.locator('#trim .text')).toHaveText('3h 12m 5s')
})

test('trim hides the leading zero segments and their separators', async ({ page, scenario }) => {
  await scenario('trimmed')
  const subject = page.locator('#subject')
  await expect(subject.locator('.segment:visible .value')).toHaveText(['03', '12', '05'])
  await expect(subject.locator('.segment')).toHaveCount(4)
})

test('a removed or non-numeric duration leaves the element inactive', async ({ page, scenario }) => {
  await scenario('invalid')
  const nan = page.locator('#nan')
  await expect(nan.locator('.text')).toHaveText('00:00')
  await expect(nan).not.toHaveState('ended')

  const subject = page.locator('#subject')
  await page.clock.runFor(1_000)
  await subject.evaluate((element) => element.removeAttribute('duration'))
  await expect(subject).not.toHaveState('running')
  await expect(subject).not.toHaveState('ended')
  expect((await events(page)).filter(({ type }) => type === 'complete')).toHaveLength(0)
})

test('a timer counts its duration in a clock', async ({ page, scenario }) => {
  await scenario('clock')
  const text = page.locator('#subject .text')
  await expect(text).toHaveText('01:05')
  await page.clock.runFor(6_000)
  await expect(text).toHaveText('00:59')
})

test('writes a phrase with inline, read by assistive technology', async ({ page, scenario }) => {
  await scenario('inline')
  await expect(page.locator('#subject .text')).toHaveText('1 day, 2 hours, 1 minute, 4 seconds')
  await expect(page.locator('#subject .visually-hidden')).toHaveText('1 day, 2 hours, 1 minute, 4 seconds')
  await expect(page.locator('#subject .drawn')).toHaveAttribute('aria-hidden', 'true')
})

test('enters the warning state under warn-at seconds', async ({ page, scenario }) => {
  await scenario('warning')
  const subject = page.locator('#subject')
  await expect(subject).not.toHaveState('warning')
  await page.clock.runFor(2_000)
  await expect(subject).toHaveState('warning')
  await expect(subject.locator('.text')).toHaveText('00:10')
  await expect(subject.locator('.text')).toHaveCSS('color', 'rgb(220, 38, 38)')
})

test('pause, start and reset drive a timer', async ({ page, scenario }) => {
  await scenario('paused')
  const subject = page.locator('#subject')
  const text = subject.locator('.text')
  await expect(text).toHaveText('01:30')
  await expect(subject).toHaveState('paused')
  await page.clock.runFor(5_000)
  await expect(text).toHaveText('01:30')

  await page.getByRole('button', { name: 'Start' }).click()
  await expect(subject).toHaveState('running')
  await page.clock.runFor(10_000)
  await expect(text).toHaveText('01:20')

  await page.getByRole('button', { name: 'Pause' }).click()
  await page.clock.runFor(20_000)
  await expect(text).toHaveText('01:20')

  await page.getByRole('button', { name: 'Start' }).click()
  await page.clock.runFor(5_000)
  await expect(text).toHaveText('01:15')

  await page.getByRole('button', { name: 'Reset' }).click()
  await expect(text).toHaveText('01:30')
  await page.clock.runFor(1_000)
  await expect(text).toHaveText('01:29')
})

test('fires complete once at zero and shows the ended slot', async ({ page, scenario }) => {
  await scenario('ended')
  const subject = page.locator('#subject')
  await expect(subject.locator('.text')).toHaveText('00:03')
  await page.clock.runFor(4_000)
  await expect(subject).toHaveState('ended')
  await expect(subject.getByText('We are live!')).toBeVisible()
  await page.clock.runFor(5_000)
  expect((await events(page)).filter(({ type }) => type === 'complete')).toHaveLength(1)

  // The same moment handed over again (a framework re-render) or a reset does not end it a second time.
  await subject.evaluate((element: HTMLElementTagNameMap['c2-countdown']) => {
    element.date = new Date(String(element.date))
    element.reset()
  })
  await page.clock.runFor(2_000)
  expect((await events(page)).filter(({ type }) => type === 'complete')).toHaveLength(1)

  // A date already past draws zeros and never counted down.
  const past = page.locator('#past')
  await expect(past.locator('.text')).toHaveText('00:00')
  await expect(past).toHaveState('ended')
})

test('a timer that ran out starts again from its full duration', async ({ page, scenario }) => {
  await scenario('warning')
  await page.clock.runFor(13_000)
  const subject = page.locator('#subject')
  await expect(subject).toHaveState('ended')
  await subject.evaluate((element: HTMLElementTagNameMap['c2-countdown']) => element.start())
  await expect(subject.locator('.text')).toHaveText('00:12')
  await expect(subject).toHaveState('running')
})

test('takes the language from the nearest lang attribute', async ({ page, scenario }) => {
  await scenario('lang')
  await expect(page.locator('#subject .text')).toHaveText(/2\sjours et 3\sheures/)
})

test('has no axe violations', async ({ page, scenario }) => {
  for (const name of ['default', 'inline', 'ended']) {
    await scenario(name)
    // axe schedules its own timers, which a paused clock never fires.
    await page.clock.resume()
    const results = await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    expect(results.violations).toEqual([])
  }
})
