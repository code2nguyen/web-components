import AxeBuilder from '@axe-core/playwright'
import { test, expect } from './fixture'

test('shows the date in the medium style by default, in a <time> element', async ({ page, scenario }) => {
  await scenario()
  const time = page.locator('#subject time')
  await expect(time).toHaveText('Oct 14, 2026')
  await expect(time).toHaveAttribute('datetime', '2026-10-14T15:05:09.000Z')
})

test('follows date-style and time-style, which win over individual fields', async ({ page, scenario }) => {
  await scenario('styles')
  await expect(page.locator('#full time')).toHaveText('Wednesday, October 14, 2026')
  await expect(page.locator('#short time')).toHaveText(/^10\/14\/26, 3:05\sPM$/)
  await expect(page.locator('#time time')).toHaveText(/^3:05:09\sPM$/)
  await expect(page.locator('#mixed time')).toHaveText('October 14, 2026')
})

test('shows only the named fields, in the hour format and time zone asked for', async ({ page, scenario }) => {
  await scenario('fields')
  await expect(page.locator('#month-year time')).toHaveText('October 2026')
  await expect(page.locator('#clock time')).toHaveText('15:05')
  await expect(page.locator('#twelve time')).toHaveText(/^3:05\s?pm$/i)
  await expect(page.locator('#zone time')).toHaveText(/^10:05\sPM GMT\+7$/)
})

test('takes the locale from the nearest lang attribute and follows it when it changes', async ({ page, scenario }) => {
  await scenario('lang')
  const time = page.locator('#subject time')
  await expect(time).toHaveText('14 octobre 2026')
  await page.locator('p[lang]').evaluate((el) => el.setAttribute('lang', 'de'))
  await expect(time).toHaveText('14. Oktober 2026')
  // An explicit locale wins over the lang attribute.
  await page.locator('#subject').evaluate((el) => el.setAttribute('locale', 'en-US'))
  await expect(time).toHaveText('October 14, 2026')
})

test('reads a millisecond timestamp and a Date property', async ({ page, scenario }) => {
  await scenario('timestamp')
  const time = page.locator('#subject time')
  await expect(time).toHaveText('Oct 14, 2026')
  await page.locator('#subject').evaluate((element) => ((element as HTMLElementTagNameMap['c2-format-date']).date = new Date(Date.UTC(2025, 0, 2))))
  await expect(time).toHaveText('Jan 2, 2025')
})

test('shows the default slot until it holds a valid date', async ({ page, scenario }) => {
  await scenario('fallback')
  await expect(page.locator('#unset')).toHaveText('No date')
  await expect(page.locator('#unset time')).toHaveCount(0)
  await expect(page.locator('#invalid')).toHaveText('Unknown')

  await page.locator('#unset').evaluate((element) => element.setAttribute('date', '2026-10-14T15:05:09Z'))
  await expect(page.locator('#unset time')).toHaveAttribute('datetime', '2026-10-14T15:05:09.000Z')
})

test('an unknown time zone falls back to the reader zone and keeps the style', async ({ page, scenario }) => {
  await scenario('bad-options')
  await expect(page.locator('#subject time')).toHaveText(/^October 1[345], 2026$/)
})

test('has no axe violations', async ({ page, scenario }) => {
  await scenario('styles')
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(results.violations).toEqual([])
})
