import { test, expect, accessible, watch } from '../../../../tests/component-fixture'
import type { Page } from '@playwright/test'
import type { InputMatrix } from '../src/input-matrix'

const matrix = (page: Page) => page.locator('c2-input-matrix')
const value = (page: Page) => matrix(page).evaluate((element: InputMatrix) => element.value)
const SIZES = `rows='[{"value":"s","label":"Small"},{"value":"m","label":"Medium"},{"value":"l","label":"Large","disabled":true}]'`
const COLOURS = `columns='[{"value":"red","label":"Red"},{"value":"blue","label":"Blue","max":50}]'`

test('each cell is an input named by its row and column; typing updates value, the totals and the form', async ({ page, renderScenario }) => {
  await renderScenario(
    `<form><c2-input-matrix name="qty" label="Quantities" totals="both" ${SIZES} ${COLOURS} value='{"l":{"red":1}}'></c2-input-matrix></form>`,
  )
  await expect(page.getByRole('group', { name: 'Quantities' })).toBeVisible()
  await watch(matrix(page), 'change')
  await page.getByRole('textbox', { name: 'Small Red' }).fill('4')
  await page.getByRole('textbox', { name: 'Small Blue' }).fill('2.5')
  await page.getByRole('textbox', { name: 'Small Blue' }).press('Enter')
  expect(await value(page)).toEqual({ l: { red: 1 }, s: { red: 4, blue: 2.5 } })
  expect(JSON.parse((await matrix(page).getAttribute('data-events'))!).at(-1)).toEqual({ value: { l: { red: 1 }, s: { red: 4, blue: 2.5 } } })
  const totals = matrix(page).locator('[part="total"]')
  // Small, Medium and Large row totals, then the column totals and the grand total.
  await expect(totals).toHaveText(['6.5', '', '1', '5', '2.5', '7.5'])
  await expect(page.getByRole('textbox', { name: 'Large Red' })).toBeDisabled()
  const form = await page.locator('form').evaluate((element: HTMLFormElement) => [...new FormData(element)])
  expect(form).toEqual([
    ['qty[s][red]', '4'],
    ['qty[s][blue]', '2.5'],
    ['qty[l][red]', '1'],
  ])
  await page.getByRole('textbox', { name: 'Small Red' }).fill('')
  expect(await value(page)).toEqual({ l: { red: 1 }, s: { blue: 2.5 } })
  await accessible(page)
})

test('Enter and the arrows travel like a sheet, skipping disabled cells', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-input-matrix ${SIZES} ${COLOURS}></c2-input-matrix>`)
  await page.getByRole('textbox', { name: 'Small Red' }).click()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('textbox', { name: 'Medium Red' })).toBeFocused()
  // Large is disabled: nowhere further down.
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('textbox', { name: 'Medium Red' })).toBeFocused()
  await page.keyboard.type('12')
  await page.keyboard.press('ArrowLeft')
  await expect(page.getByRole('textbox', { name: 'Medium Red' })).toBeFocused()
  await page.keyboard.press('End')
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('textbox', { name: 'Medium Blue' })).toBeFocused()
  await page.keyboard.press('Shift+Enter')
  await expect(page.getByRole('textbox', { name: 'Small Blue' })).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await expect(page.getByRole('textbox', { name: 'Small Red' })).toBeFocused()
  expect(await value(page)).toEqual({ m: { red: 12 } })
})

test('pasting cells from a sheet fills the matrix from the cell pasted into, in one change', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-input-matrix ${SIZES} ${COLOURS}></c2-input-matrix>`)
  await watch(matrix(page), 'change')
  await page.getByRole('textbox', { name: 'Small Red' }).evaluate((input) => {
    const data = new DataTransfer()
    data.setData('text/plain', '4\t6\n1\toops\n9\t9\n')
    // Firefox drops `clipboardData` given to the ClipboardEvent constructor: a real paste carries it, so define it here.
    const paste = new Event('paste', { bubbles: true, cancelable: true, composed: true })
    Object.defineProperty(paste, 'clipboardData', { value: data })
    input.dispatchEvent(paste)
  })
  // "oops" is not a number and Large is disabled: both are left alone.
  expect(await value(page)).toEqual({ s: { red: 4, blue: 6 }, m: { red: 1 } })
  expect(JSON.parse((await matrix(page).getAttribute('data-events'))!)).toHaveLength(1)
})

test('text that is not a number, or one past max, makes the matrix invalid; required asks for one value', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-input-matrix required ${SIZES} ${COLOURS}></c2-input-matrix>`)
  const validity = () => matrix(page).evaluate((element: InputMatrix) => [element.checkValidity(), element.validationMessage])
  expect(await validity()).toEqual([false, 'Please enter at least one value.'])
  await page.getByRole('textbox', { name: 'Small Red' }).fill('abc')
  await page.getByRole('textbox', { name: 'Small Red' }).blur()
  // The text stays as typed so it can be fixed.
  await expect(page.getByRole('textbox', { name: 'Small Red' })).toHaveValue('abc')
  await expect(page.getByRole('textbox', { name: 'Small Red' })).toHaveAttribute('aria-invalid', 'true')
  expect(await validity()).toEqual([false, 'Enter a valid value for Small, Red.'])
  await page.getByRole('textbox', { name: 'Small Red' }).fill('3')
  await page.getByRole('textbox', { name: 'Medium Blue' }).fill('80')
  expect(await validity()).toEqual([false, 'Medium, Blue must be 50 or less.'])
  await page.getByRole('textbox', { name: 'Medium Blue' }).fill('50')
  expect(await validity()).toEqual([true, ''])
})

test('duration, date, time, text and select cells; numbers and durations read in the page language', async ({ page, renderScenario }) => {
  await renderScenario(`<div lang="fr"><c2-input-matrix totals="rows"
    rows='[{"value":"urgent","label":"Urgent"},{"value":"normal","label":"Normal"}]'
    columns='[{"value":"reply","label":"Reply","type":"duration"},{"value":"solve","label":"Solve","type":"duration"},{"value":"from","label":"From","type":"date"},{"value":"at","label":"At","type":"time"},{"value":"owner","label":"Owner","type":"select","options":["Tier 1",{"value":"t2","label":"Tier 2"}]},{"value":"note","label":"Note","type":"text"},{"value":"weight","label":"Weight"}]'></c2-input-matrix></div>`)
  await page.getByRole('textbox', { name: 'Urgent Reply' }).fill('1h 30m')
  await page.getByRole('textbox', { name: 'Urgent Solve' }).fill('4:00')
  await page.getByRole('textbox', { name: 'Normal Reply' }).fill('45')
  await page.getByRole('textbox', { name: 'Normal Weight' }).fill('1,5')
  await page.locator('c2-input-matrix input[type="date"]').first().fill('2026-11-14')
  await page.locator('c2-input-matrix input[type="time"]').first().fill('09:30')
  await page.getByRole('combobox', { name: 'Urgent Owner' }).selectOption('Tier 2')
  await page.getByRole('textbox', { name: 'Urgent Note' }).fill('Page on call')
  await page.getByRole('textbox', { name: 'Urgent Note' }).blur()
  expect(await value(page)).toEqual({
    urgent: { reply: 90, solve: 240, from: '2026-11-14', at: '09:30', owner: 't2', note: 'Page on call' },
    normal: { reply: 45, weight: 1.5 },
  })
  // Left, a duration shows as hours and minutes; a number in French.
  await expect(page.getByRole('textbox', { name: 'Urgent Reply' })).toHaveValue('1 h 30')
  await expect(page.getByRole('textbox', { name: 'Normal Weight' })).toHaveValue('1,5')
  // Mixed columns are summed as numbers.
  await expect(matrix(page).locator('[part="total"]')).toHaveText(['330', '46,5'])
  await expect(page.getByRole('columnheader', { name: 'Total' })).toBeVisible()
  await accessible(page)
})

test('a new value or a form reset replaces typed text; a French duration reads back; pasted dates are checked', async ({ page, renderScenario }) => {
  await renderScenario(`<form><div lang="fr"><c2-input-matrix name="m" ${SIZES}
    columns='[{"value":"red","label":"Red"},{"value":"d","label":"Delay","type":"duration"},{"value":"on","label":"On","type":"date"}]'></c2-input-matrix></div></form>`)
  await page.getByRole('textbox', { name: 'Small Red' }).fill('abc')
  await page.getByRole('textbox', { name: 'Small Red' }).blur()
  await page.locator('form').evaluate((form: HTMLFormElement) => form.reset())
  await expect(page.getByRole('textbox', { name: 'Small Red' })).toHaveValue('')
  expect(await matrix(page).evaluate((element: InputMatrix) => element.checkValidity())).toBe(true)
  await page.getByRole('textbox', { name: 'Small Red' }).fill('abc')
  await matrix(page).evaluate((element: InputMatrix) => (element.value = { s: { red: 4, d: 90 } }))
  await expect(page.getByRole('textbox', { name: 'Small Red' })).toHaveValue('4')
  // Written in French, read back from the same text.
  await expect(page.getByRole('textbox', { name: 'Small Delay' })).toHaveValue('1 h 30')
  await page.getByRole('textbox', { name: 'Small Delay' }).fill('1 h 45')
  expect(await value(page)).toEqual({ s: { red: 4, d: 105 } })
  await page.getByRole('textbox', { name: 'Medium Red' }).evaluate((input) => {
    const data = new DataTransfer()
    data.setData('text/plain', '7\t30\t12/31/2026\n')
    // Firefox drops `clipboardData` given to the ClipboardEvent constructor: a real paste carries it, so define it here.
    const paste = new Event('paste', { bubbles: true, cancelable: true, composed: true })
    Object.defineProperty(paste, 'clipboardData', { value: data })
    input.dispatchEvent(paste)
  })
  // A date not written as a date input writes it is left out.
  expect(await value(page)).toEqual({ s: { red: 4, d: 105 }, m: { red: 7, d: 30 } })
})
