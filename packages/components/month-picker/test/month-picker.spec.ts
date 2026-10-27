import { test, expect, accessible, watch } from '../../../../tests/component-fixture'
import type { Page } from '@playwright/test'
import type { MonthPicker } from '../src/month-picker'

const picker = (page: Page) => page.locator('c2-month-picker')
const value = (page: Page) => picker(page).evaluate((element: MonthPicker) => element.value)

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-14T10:00:00'))
})

test("shows the value's year with its twelve months, the value selected and the current month marked", async ({ page, renderScenario }) => {
  await renderScenario(`<c2-month-picker value="2026-03"></c2-month-picker>`)
  await expect(page.getByRole('group', { name: 'Choose a month' })).toBeVisible()
  await expect(page.getByRole('grid', { name: '2026' }).getByRole('gridcell')).toHaveCount(12)
  await expect(page.getByRole('gridcell', { name: 'March 2026' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('gridcell', { name: 'October 2026' })).toHaveAttribute('aria-current', 'date')
  // One tab stop in the grid, on the value.
  await expect(picker(page).locator('.cell[tabindex="0"]')).toHaveText('Mar')
  await accessible(page)
})

test('a click picks the month, fires input then change, and the form receives it', async ({ page, renderScenario }) => {
  await renderScenario(`<form><c2-month-picker name="period" required></c2-month-picker></form>`)
  expect(await picker(page).evaluate((element: MonthPicker) => [element.checkValidity(), element.validationMessage])).toEqual([false, 'Please choose a month.'])
  await watch(picker(page), 'change')
  await page.getByRole('gridcell', { name: 'July 2026' }).click()
  expect(await value(page)).toBe('2026-07')
  expect(JSON.parse((await picker(page).getAttribute('data-events'))!)).toEqual([{ value: '2026-07' }])
  expect(await page.locator('form').evaluate((form: HTMLFormElement) => Object.fromEntries(new FormData(form)))).toEqual({ period: '2026-07' })
  await page.locator('form').evaluate((form: HTMLFormElement) => form.reset())
  expect(await value(page)).toBe('')
})

test('the arrow keys move through the grid and on into the next year; Page Down changes the year; Enter picks', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-month-picker value="2026-11"></c2-month-picker>`)
  await picker(page).locator('.cell[tabindex="0"]').focus()
  await page.keyboard.press('ArrowDown')
  // Down from November (row 4) runs past December into the next year.
  await expect(page.getByRole('gridcell', { name: 'February 2027' })).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await expect(page.getByRole('gridcell', { name: 'January 2027' })).toBeFocused()
  await page.keyboard.press('End')
  await expect(page.getByRole('gridcell', { name: 'March 2027' })).toBeFocused()
  await page.keyboard.press('PageDown')
  await expect(page.getByRole('gridcell', { name: 'March 2028' })).toBeFocused()
  await page.keyboard.press('Enter')
  expect(await value(page)).toBe('2028-03')
})

test('the title opens a grid of years; a year opens its months, and granularity="year" picks a year', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-month-picker value="2026-05"></c2-month-picker>`)
  await page.getByRole('button', { name: '2026, choose a year' }).click()
  await expect(page.getByRole('grid', { name: '2016 – 2027' }).getByRole('gridcell')).toHaveCount(12)
  await expect(page.getByRole('gridcell', { name: '2026' })).toBeFocused()
  await page.getByRole('gridcell', { name: '2019' }).click()
  await expect(page.getByRole('grid', { name: '2019' })).toBeVisible()
  await expect(page.getByRole('gridcell', { name: 'May 2019' })).toBeFocused()
  expect(await value(page)).toBe('2026-05')

  await renderScenario(`<c2-month-picker granularity="year" value="2021"></c2-month-picker>`)
  await expect(page.getByRole('group', { name: 'Choose a year' })).toBeVisible()
  await page.getByRole('gridcell', { name: '2024' }).click()
  expect(await value(page)).toBe('2024')
  await accessible(page)
})

test('min and max disable the months outside them and stop the paging; names follow the language', async ({ page, renderScenario }) => {
  await renderScenario(`<div lang="fr"><c2-month-picker value="2026-05" min="2026-03" max="2026-09"></c2-month-picker></div>`)
  await expect(page.getByRole('group', { name: 'Choisir un mois' })).toBeVisible()
  await expect(page.getByRole('gridcell', { name: 'février 2026' })).toBeDisabled()
  await expect(page.getByRole('gridcell', { name: 'mars 2026' })).toBeEnabled()
  await expect(page.getByRole('gridcell', { name: 'octobre 2026' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Année précédente' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Année suivante' })).toBeDisabled()
})

test('a value set later brings its year into view, a change of granularity converts the value, and the keys skip nothing outside min', async ({
  page,
  renderScenario,
}) => {
  await renderScenario(`<c2-month-picker name="p" min="2026-03" value="2026-09"></c2-month-picker>`)
  await picker(page).evaluate((element: MonthPicker) => (element.value = '2031-05'))
  await expect(page.getByRole('gridcell', { name: 'May 2031' })).toHaveAttribute('aria-selected', 'true')

  await picker(page).evaluate((element: MonthPicker) => (element.value = '2026-03'))
  await page.getByRole('gridcell', { name: 'March 2026' }).focus()
  await page.keyboard.press('ArrowLeft')
  // February is before min: focus stays on March rather than jumping elsewhere.
  await expect(page.getByRole('gridcell', { name: 'March 2026' })).toBeFocused()

  await picker(page).evaluate((element: MonthPicker) => (element.granularity = 'year'))
  expect(await value(page)).toBe('2026')
  await expect(page.getByRole('gridcell', { name: '2026' })).toHaveAttribute('aria-selected', 'true')
})
