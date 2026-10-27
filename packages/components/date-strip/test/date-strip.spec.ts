import { test, expect, accessible, watch } from '../../../../tests/component-fixture'
import type { Page } from '@playwright/test'
import type { DateStrip } from '../src/date-strip'

const strip = (page: Page) => page.locator('c2-date-strip')
const value = (page: Page) => strip(page).evaluate((element: DateStrip) => element.value)
const days = (page: Page) => page.getByRole('listbox').getByRole('option')

test.beforeEach(async ({ page }) => {
  // Wednesday 14 October 2026.
  await page.clock.setFixedTime(new Date('2026-10-14T10:00:00'))
})

// WebKit writes en-GB dates without the comma after the weekday that Chromium and Firefox put there.
test("shows the week holding today from the locale's first day, today marked, with weekday and number", async ({ page, renderScenario }) => {
  await renderScenario(`<div lang="en-GB"><c2-date-strip></c2-date-strip></div>`)
  await expect(days(page)).toHaveCount(7)
  await expect(days(page).first()).toHaveAccessibleName(/^Monday,? 12 October 2026$/)
  await expect(page.getByRole('option', { name: /^Wednesday,? 14 October 2026$/ })).toHaveAttribute('aria-current', 'date')
  await expect(days(page).first()).toContainText(/Mon\s*12/)
  await expect(strip(page).locator('[part="title"]')).toHaveText('October 2026')
  await accessible(page)

  // A US week starts on Sunday.
  await renderScenario(`<div lang="en-US"><c2-date-strip></c2-date-strip></div>`)
  await expect(days(page).first()).toHaveAccessibleName('Sunday, October 11, 2026')
})

test('a click picks the day, fires input then change, and the form receives it', async ({ page, renderScenario }) => {
  await renderScenario(`<form><c2-date-strip name="day" required></c2-date-strip></form>`)
  expect(await strip(page).evaluate((element: DateStrip) => element.validationMessage)).toBe('Please choose a day.')
  await watch(strip(page), 'change')
  await page.getByRole('option', { name: /October 16, 2026/ }).click()
  expect(await value(page)).toBe('2026-10-16')
  await expect(page.getByRole('option', { name: /October 16, 2026/ })).toHaveAttribute('aria-selected', 'true')
  expect(JSON.parse((await strip(page).getAttribute('data-events'))!)).toEqual([{ value: '2026-10-16' }])
  expect(await page.locator('form').evaluate((form: HTMLFormElement) => Object.fromEntries(new FormData(form)))).toEqual({ day: '2026-10-16' })
})

test('the arrows move by day and page on at the ends; the paging buttons move a week; Enter picks', async ({ page, renderScenario }) => {
  await renderScenario(`<div lang="en-US"><c2-date-strip value="2026-10-17"></c2-date-strip></div>`)
  await page.getByRole('option', { name: /October 17, 2026/ }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('option', { name: /October 18, 2026/ })).toBeFocused()
  await expect(days(page).first()).toHaveAccessibleName(/October 18, 2026/)
  await page.keyboard.press('End')
  await expect(page.getByRole('option', { name: /October 24, 2026/ })).toBeFocused()
  await page.keyboard.press('Enter')
  expect(await value(page)).toBe('2026-10-24')
  await page.getByRole('button', { name: 'Later days' }).click()
  await expect(days(page).first()).toHaveAccessibleName(/October 25, 2026/)
  await expect(strip(page).locator('[part="title"]')).toHaveText('October 2026')
  await page.getByRole('button', { name: 'Later days' }).click()
  await expect(strip(page).locator('[part="title"]')).toHaveText('November 2026')
})

test('markers are read with their day; min and max disable days and stop the paging; text follows the language', async ({ page, renderScenario }) => {
  await renderScenario(
    `<div lang="fr"><c2-date-strip min="2026-10-13" max="2026-10-17" markers='["2026-10-14",{"date":"2026-10-15","label":"2 séances"}]'></c2-date-strip></div>`,
  )
  await expect(page.getByRole('listbox', { name: 'Choisir un jour' })).toBeVisible()
  await expect(page.getByRole('option', { name: 'mercredi 14 octobre 2026, a des événements' })).toBeVisible()
  await expect(page.getByRole('option', { name: 'jeudi 15 octobre 2026, 2 séances' })).toBeVisible()
  await expect(page.getByRole('option', { name: 'lundi 12 octobre 2026' })).toHaveAttribute('aria-disabled', 'true')
  await expect(page.getByRole('button', { name: 'Jours précédents' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Jours suivants' })).toBeDisabled()
  await page.getByRole('option', { name: 'lundi 12 octobre 2026' }).click({ force: true })
  expect(await value(page)).toBe('')
  await accessible(page)
})

test('a disabled strip is out of the tab order, and the keys do not move onto a day outside max', async ({ page, renderScenario }) => {
  await renderScenario(`<button>Before</button><c2-date-strip disabled></c2-date-strip><button>After</button>`)
  await page.getByRole('button', { name: 'Before' }).focus()
  // The paging buttons are disabled too, so one Tab goes straight past the strip.
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'After' })).toBeFocused()

  await renderScenario(`<div lang="en-US"><c2-date-strip value="2026-10-15" max="2026-10-15"></c2-date-strip></div>`)
  await page.getByRole('option', { name: /October 15, 2026/ }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('option', { name: /October 15, 2026/ })).toBeFocused()
})

test('in a row too narrow for every day, the picked day is scrolled into sight', async ({ page, renderScenario }) => {
  await renderScenario(`<div style="width:180px"><c2-date-strip value="2026-10-17" start="2026-10-11"></c2-date-strip></div>`)
  await expect(page.getByRole('option', { name: /October 17, 2026/ })).toBeInViewport()
  const scrolled = await strip(page).evaluate((element) => element.shadowRoot!.querySelector<HTMLElement>('.days')!.scrollLeft)
  expect(scrolled).toBeGreaterThan(0)
})

test('disabled dates cannot be picked and the arrows step over them; paging fires range-change with the days shown', async ({ page, renderScenario }) => {
  await renderScenario(`<div lang="en-US"><c2-date-strip value="2026-10-13" disabled-dates="2026-10-14;2026-10-15"></c2-date-strip></div>`)
  await watch(strip(page), 'range-change')
  await expect(page.getByRole('option', { name: /October 14, 2026/ })).toHaveAttribute('aria-disabled', 'true')
  await page.getByRole('option', { name: /October 14, 2026/ }).click({ force: true })
  expect(await value(page)).toBe('2026-10-13')
  await page.getByRole('option', { name: /October 13, 2026/ }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('option', { name: /October 16, 2026/ })).toBeFocused()
  await page.getByRole('button', { name: 'Later days' }).click()
  expect(JSON.parse((await strip(page).getAttribute('data-events'))!)).toEqual([{ start: '2026-10-18', end: '2026-10-24' }])
})
