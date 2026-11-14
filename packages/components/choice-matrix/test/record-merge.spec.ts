import { test, expect, accessible, watch } from '../../../../tests/component-fixture'
import type { Page } from '@playwright/test'
import type { RecordMerge } from '../src/record-merge'
import type { ChoiceMatrix } from '../src/choice-matrix'

const RECORDS = JSON.stringify([
  { id: 'a', label: 'Ada Lovelace (CRM)', values: { name: 'Ada Lovelace', email: 'ada@example.com', phone: '', tags: ['vip'] } },
  { id: 'b', label: 'A. Lovelace (web form)', values: { name: 'A. Lovelace', email: 'ada@analytical.org', phone: '+44 20 7946 0000', tags: [] } },
])
const FIELDS = JSON.stringify([
  { key: 'name', label: 'Name' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
])
const merge = (page: Page) => page.locator('c2-record-merge')

test('records are columns whose cells show their values; every field starts on the primary record', async ({ page, renderScenario }) => {
  await renderScenario(`<form><c2-record-merge name="merge" preview records='${RECORDS}' fields='${FIELDS}'></c2-record-merge></form>`)
  await expect(page.getByRole('group', { name: 'Merge records' })).toBeVisible()
  await expect(page.getByRole('radio', { name: 'Email Ada Lovelace (CRM) ada@example.com' })).toBeChecked()
  await expect(page.getByRole('radio', { name: 'Phone Ada Lovelace (CRM) Empty' })).toBeChecked()
  await watch(merge(page), 'change')
  // The value is a target too: the cell is one label.
  await merge(page).getByText('+44 20 7946 0000').click()
  expect(await merge(page).evaluate((element: RecordMerge) => element.merged)).toEqual({
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    phone: '+44 20 7946 0000',
    tags: ['vip'],
  })
  expect(JSON.parse((await merge(page).getAttribute('data-events'))!).at(-1)).toEqual({ value: { name: 'a', email: 'a', phone: 'b' } })
  await expect(merge(page).locator('[part="result"]')).toHaveText(['Ada Lovelace', 'ada@example.com', '+44 20 7946 0000'])
  const form = await page.locator('form').evaluate((element: HTMLFormElement) => [...new FormData(element)])
  expect(form).toEqual([
    ['merge[name]', 'a'],
    ['merge[email]', 'a'],
    ['merge[phone]', 'b'],
  ])
  await accessible(page)
})

test('"Use all" takes every field from one record; primary and a missing fields list', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-record-merge primary="b" records='${RECORDS}'></c2-record-merge>`)
  // Without fields, every key is a row; every field starts on the primary.
  await expect(merge(page).getByRole('rowheader')).toHaveText(['name', 'email', 'phone', 'tags'])
  expect(await merge(page).evaluate((element: RecordMerge) => element.value)).toEqual({ name: 'b', email: 'b', phone: 'b', tags: 'b' })
  await page.getByRole('button', { name: 'Use all from Ada Lovelace (CRM)' }).click()
  expect(await merge(page).evaluate((element: RecordMerge) => element.merged)).toEqual({
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    phone: '',
    tags: ['vip'],
  })
  // Changing the primary moves only the fields that were on it by default: here none are left.
  await merge(page).evaluate((element: RecordMerge) => (element.primary = 'a'))
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'Use all from A. Lovelace (web form)' })).toBeFocused()
})

test('a choice matrix shows cells from cells or renderCell, and a radio matrix gets a "Use all" per column', async ({ page, renderScenario }) => {
  await renderScenario(`<div lang="fr"><c2-choice-matrix type="radio" use-all toggles="both"
    rows='[{"value":"aspirin","label":"Aspirin"},{"value":"statin","label":"Atorvastatin"}]'
    columns='[{"value":"keep","label":"Keep"},{"value":"stop","label":"Stop"},{"value":"change","label":"Change"}]'
    cells='{"aspirin":{"keep":"81 mg daily"},"statin":{"change":"20 → 40 mg"}}'></c2-choice-matrix></div>`)
  const matrix = page.locator('c2-choice-matrix')
  await page.getByRole('button', { name: 'Tout prendre de Keep' }).click()
  expect(await matrix.evaluate((element: ChoiceMatrix) => element.value)).toEqual({ aspirin: 'keep', statin: 'keep' })
  await page.getByRole('radio', { name: 'Atorvastatin Change 20 → 40 mg' }).check()
  // `toggles` stays a checkbox feature: a radio matrix has no tri-state toggles.
  await expect(page.getByRole('checkbox')).toHaveCount(0)
  await matrix.evaluate((element: ChoiceMatrix) => {
    element.renderCell = ({ row, column, checked }) => (row.value === 'aspirin' && column.value === 'stop' ? (checked ? 'stopping' : 'stop it') : undefined)
  })
  await expect(page.getByRole('radio', { name: 'Aspirin Stop stop it' })).toBeVisible()
  await expect(page.getByRole('radio', { name: 'Aspirin Keep', exact: true })).toBeVisible()
  await accessible(page)
})

test('a form reset and a change of primary keep every field on a record, and lists read in the page language', async ({ page, renderScenario }) => {
  await renderScenario(
    `<form><div lang="fr"><c2-record-merge name="m" records='${RECORDS}' fields='[{"key":"name","label":"Nom"},{"key":"tags","label":"Tags"}]'></c2-record-merge></div></form>`,
  )
  await expect(page.getByRole('group', { name: 'Fusionner les fiches' })).toBeVisible()
  await merge(page).evaluate((element: RecordMerge) => {
    element.records = [...element.records.slice(0, 1), { ...element.records[1], values: { ...element.records[1].values, tags: ['a', 'b'] } }]
  })
  await expect(page.getByRole('radio', { name: 'Tags A. Lovelace (web form) a et b' })).toBeVisible()
  // The user picks the name from b; the tags stay on the primary by default.
  await page.getByRole('radio', { name: /^Nom A\. Lovelace/ }).check()
  await merge(page).evaluate((element: RecordMerge) => (element.primary = 'b'))
  expect(await merge(page).evaluate((element: RecordMerge) => element.value)).toEqual({ name: 'b', tags: 'b' })
  await merge(page).evaluate((element: RecordMerge) => (element.primary = 'a'))
  expect(await merge(page).evaluate((element: RecordMerge) => element.value)).toEqual({ name: 'b', tags: 'a' })
  await page.locator('form').evaluate((form: HTMLFormElement) => form.reset())
  // Reset returns to the default captured before the records came: every field back on the primary.
  expect(await merge(page).evaluate((element: RecordMerge) => element.value)).toEqual({ name: 'a', tags: 'a' })
})
