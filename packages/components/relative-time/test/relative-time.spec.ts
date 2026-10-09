import AxeBuilder from '@axe-core/playwright'
import { test, expect } from './fixture'

const NOW = new Date('2026-10-08T12:00:00Z')

// Paused, so time moves only through `runFor` and page-load time cannot shift a phrase.
test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: NOW.getTime() - 1000 })
  await page.clock.pauseAt(NOW)
})

test('phrases the distance and keeps it current as time passes', async ({ page, scenario }) => {
  await scenario()
  const time = page.locator('#subject time')
  await expect(time).toHaveText('5 seconds ago')
  await expect(time).toHaveAttribute('datetime', '2026-10-08T11:59:55.000Z')
  await expect(time).toHaveAttribute('title', /2026/)

  await page.clock.runFor(10_000)
  await expect(time).toHaveText('15 seconds ago')
  await page.clock.runFor(60_000)
  await expect(time).toHaveText('1 minute ago')
  await page.clock.runFor(2 * 3_600_000)
  await expect(time).toHaveText('2 hours ago')
})

test('counts down to a future date and drops to seconds under a minute', async ({ page, scenario }) => {
  await scenario('future')
  const time = page.locator('#subject time')
  await expect(time).toHaveText('in 2 minutes')
  await page.clock.runFor(31_000)
  await expect(time).toHaveText('in 59 seconds')
  await page.clock.runFor(59_000)
  await expect(time).toHaveText('now')
  await page.clock.runFor(3_000)
  await expect(time).toHaveText('3 seconds ago')
})

test('follows numeric, format and the largest unit that fits', async ({ page, scenario }) => {
  await scenario('numeric')
  await expect(page.locator('#auto time')).toHaveText('yesterday')
  await expect(page.locator('#always time')).toHaveText('1 day ago')
  await expect(page.locator('#short time')).toHaveText('3 hr. ago')
  await expect(page.locator('#weeks time')).toHaveText('2 weeks ago')
  await expect(page.locator('#months time')).toHaveText('2 months ago')
  await expect(page.locator('#years time')).toHaveText('2 years ago')
})

test('takes the locale from the nearest lang attribute', async ({ page, scenario }) => {
  await scenario('lang')
  await expect(page.locator('#subject time')).toHaveText(/il y a 3\sminutes/)
})

test('reads a millisecond timestamp', async ({ page, scenario }) => {
  await scenario('timestamp')
  await expect(page.locator('#subject time')).toHaveText('2 hours ago')
})

test('shows the default slot until it holds a valid date', async ({ page, scenario }) => {
  await scenario('fallback')
  await expect(page.locator('#unset')).toHaveText('Never')
  await expect(page.locator('#unset time')).toHaveCount(0)
  await expect(page.locator('#invalid')).toHaveText('Unknown')

  await page.locator('#unset').evaluate((element) => ((element as HTMLElementTagNameMap['c2-relative-time']).date = new Date(Date.now() - 120_000)))
  await expect(page.locator('#unset time')).toHaveText('2 minutes ago')
})

test('no-update draws the phrase once', async ({ page, scenario }) => {
  await scenario('no-update')
  const time = page.locator('#subject time')
  await expect(time).toHaveText('5 seconds ago')
  await page.clock.runFor(120_000)
  await expect(time).toHaveText('5 seconds ago')

  // Clearing it resumes updates from the current time.
  await page.locator('#subject').evaluate((element) => element.removeAttribute('no-update'))
  await expect(time).toHaveText('2 minutes ago')
})

test('has no axe violations', async ({ page, scenario }) => {
  await scenario('numeric')
  // axe schedules its own timers, which a paused clock never fires.
  await page.clock.resume()
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(results.violations).toEqual([])
})
