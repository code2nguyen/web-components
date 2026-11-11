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

test('granularity="quarter" shows four quarters with their months; the current quarter is marked and the form receives YYYY-Qn', async ({
  page,
  renderScenario,
}) => {
  await renderScenario(`<form><c2-month-picker name="period" granularity="quarter" value="2026-Q2" required></c2-month-picker></form>`)
  await expect(page.getByRole('group', { name: 'Choose a quarter' })).toBeVisible()
  await expect(page.getByRole('grid', { name: '2026' }).getByRole('gridcell')).toHaveCount(4)
  await expect(page.getByRole('gridcell', { name: 'Q2 2026, April – June 2026' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('gridcell', { name: /^Q4 2026/ })).toHaveAttribute('aria-current', 'date')
  await expect(page.getByRole('gridcell', { name: /^Q1 2026/ })).toContainText('Jan – Mar')
  await watch(picker(page), 'change')
  await page.getByRole('gridcell', { name: /^Q3 2026/ }).click()
  expect(JSON.parse((await picker(page).getAttribute('data-events'))!)).toEqual([{ value: '2026-Q3' }])
  expect(await page.locator('form').evaluate((form: HTMLFormElement) => Object.fromEntries(new FormData(form)))).toEqual({ period: '2026-Q3' })
  expect(await picker(page).evaluate((element: MonthPicker) => [element.from, element.to])).toEqual(['2026-07-01', '2026-09-30'])
  await accessible(page)
})

test('the keys move through the two-column quarter grid and on into the next year; the title opens the years', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-month-picker granularity="quarter" value="2026-Q2"></c2-month-picker>`)
  await picker(page).locator('.cell[tabindex="0"]').focus()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('gridcell', { name: /^Q4 2026/ })).toBeFocused()
  await page.keyboard.press('Home')
  await expect(page.getByRole('gridcell', { name: /^Q3 2026/ })).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('gridcell', { name: /^Q1 2027/ })).toBeFocused()
  await page.keyboard.press('PageUp')
  await expect(page.getByRole('gridcell', { name: /^Q1 2026/ })).toBeFocused()
  await page.keyboard.press('Space')
  expect(await value(page)).toBe('2026-Q1')

  await page.getByRole('button', { name: '2026, choose a year' }).click()
  await page.getByRole('gridcell', { name: '2019' }).click()
  await expect(page.getByRole('button', { name: '2019, choose a year' })).toBeVisible()
  await expect(page.getByRole('gridcell', { name: /^Q1 2019/ })).toBeFocused()
})

test('fiscal-start shifts quarters, half-years and years; from and to resolve the fiscal period', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-month-picker granularity="quarter" fiscal-start="7" value="2027-Q1"></c2-month-picker>`)
  // FY2027 runs from July 2026 to June 2027; mid-October 2026 is its second quarter.
  await expect(page.getByRole('grid', { name: 'FY2027' })).toBeVisible()
  await expect(page.getByRole('gridcell', { name: 'Q1 FY2027, July – September 2026' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('gridcell', { name: /^Q2 FY2027/ })).toHaveAttribute('aria-current', 'date')
  await expect(page.getByRole('gridcell', { name: /^Q4 FY2027/ })).toContainText('Apr – Jun')
  expect(await picker(page).evaluate((element: MonthPicker) => [element.from, element.to])).toEqual(['2026-07-01', '2026-09-30'])

  await picker(page).evaluate((element: MonthPicker) => {
    element.granularity = 'half-year'
    element.value = '2027-H2'
  })
  await expect(page.getByRole('gridcell')).toHaveCount(2)
  expect(await picker(page).evaluate((element: MonthPicker) => [element.from, element.to])).toEqual(['2027-01-01', '2027-06-30'])

  await picker(page).evaluate((element: MonthPicker) => (element.granularity = 'year'))
  expect(await value(page)).toBe('2027')
  await expect(page.getByRole('gridcell', { name: 'FY2027' })).toHaveAttribute('aria-selected', 'true')
  expect(await picker(page).evaluate((element: MonthPicker) => [element.from, element.to])).toEqual(['2026-07-01', '2027-06-30'])
})

test('a month becomes its quarter, a quarter its year, and a wider period is cleared when the granularity narrows', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-month-picker value="2026-05"></c2-month-picker>`)
  await picker(page).evaluate((element: MonthPicker) => (element.granularity = 'quarter'))
  expect(await value(page)).toBe('2026-Q2')
  await picker(page).evaluate((element: MonthPicker) => (element.granularity = 'half-year'))
  expect(await value(page)).toBe('2026-H1')
  await picker(page).evaluate((element: MonthPicker) => (element.granularity = 'quarter'))
  expect(await value(page)).toBe('')
})

test('the stepper shows the period and steps it through whole periods, across years, up to max', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-month-picker granularity="quarter" stepper value="2026-Q4" max="2027-Q1"></c2-month-picker>`)
  const stepper = picker(page).locator('.stepper')
  await expect(stepper).toContainText('Q4 2026')
  await expect(stepper).toContainText('Oct – Dec 2026')
  await watch(picker(page), 'change')
  await page.getByRole('button', { name: 'Next period' }).click()
  expect(await value(page)).toBe('2027-Q1')
  await expect(page.getByRole('grid', { name: '2027' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Next period' })).toBeDisabled()
  await page.getByRole('button', { name: 'Previous period' }).click()
  await page.getByRole('button', { name: 'Previous period' }).click()
  expect(await value(page)).toBe('2026-Q3')
  expect(JSON.parse((await picker(page).getAttribute('data-events'))!)).toEqual([{ value: '2027-Q1' }, { value: '2026-Q4' }, { value: '2026-Q3' }])
  await accessible(page)
})

test('stepUp and stepDown move the value without an event, count from the current period and keep to min', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-month-picker min="2026-09"></c2-month-picker>`)
  await watch(picker(page), 'change')
  // With no value the count starts from the current month, October 2026.
  await picker(page).evaluate((element: MonthPicker) => element.stepUp())
  expect(await value(page)).toBe('2026-11')
  await picker(page).evaluate((element: MonthPicker) => element.stepUp(2))
  expect(await value(page)).toBe('2027-01')
  await picker(page).evaluate((element: MonthPicker) => element.stepDown(5))
  // September 2026 is min: August is not taken.
  expect(await value(page)).toBe('2027-01')
  await picker(page).evaluate((element: MonthPicker) => element.stepDown(4))
  expect(await value(page)).toBe('2026-09')
  expect(await picker(page).getAttribute('data-events')).toBe('[]')
})

test('the quarter and fiscal-year names follow the language', async ({ page, renderScenario }) => {
  await renderScenario(`<div lang="fr"><c2-month-picker granularity="quarter" fiscal-start="4" value="2027-Q1" stepper></c2-month-picker></div>`)
  await expect(page.getByRole('group', { name: 'Choisir un trimestre' })).toBeVisible()
  await expect(page.getByRole('gridcell', { name: /^T1 exercice 2027/ })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('button', { name: 'Période suivante' })).toBeEnabled()
})
