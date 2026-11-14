import type { Page } from '@playwright/test'
import { test, expect, accessible } from '../../../../tests/component-fixture'

const VITALS = [
  { id: 'hr', measure: 'Heart rate', low: 60, high: 100, critLow: 40, critHigh: 140, readings: { '2026-11-14T12:00': 132, '2026-11-14T08:00': 82 } },
  { id: 'k', measure: 'Potassium', low: 3.5, high: 5.1, critLow: 2.8, critHigh: 6.2, readings: { '2026-11-14T08:00': 3.1, '2026-11-14T16:00': 6.6 } },
  { id: 'temp', measure: 'Temperature', readings: { '2026-11-14T08:00': 37.1 } },
]

const flowsheet = (column = '', table = '', ranges = 'reference-range="low,high" critical-range="critLow,critHigh"') =>
  `<c2-table style="height:260px;width:720px" row-key="id" aria-label="Vitals" rows='${JSON.stringify(VITALS)}' ${table}>
  <c2-table-column field="measure" header="Measure" width="140px" pinned="start"></c2-table-column>
  <c2-table-column series="readings" series-format="time" locale="en-US" width="110px" align="end" format="number" ${ranges} ${column}></c2-table-column>
</c2-table>`

const table = (page: Page) => page.locator('c2-table')
const headers = (page: Page) => table(page).locator('[role="columnheader"]')
const row = (page: Page, index: number) => table(page).locator('.row--body').nth(index).locator('[role="gridcell"]')

test('a series column becomes one column per key across the rows, in time order, headed by the time', async ({ page, renderScenario }) => {
  await renderScenario(flowsheet())
  await expect(headers(page)).toHaveText([/Measure/, /8:00\sAM/, /12:00\sPM/, /4:00\sPM/])
  await expect(row(page, 0)).toHaveText([/Heart rate/, /82/, /132/, /^\s*$/])
  await expect(row(page, 2)).toHaveText([/Temperature/, /37\.1/, /^\s*$/, /^\s*$/])

  await renderScenario(flowsheet('series-order="desc" series-keys="2026-11-14T20:00"'))
  await expect(headers(page)).toHaveText([/Measure/, /8:00\sPM/, /4:00\sPM/, /12:00\sPM/, /8:00\sAM/])
})

test('a value outside its row range is flagged H or L, past the critical range HH or LL, and screen readers hear the word', async ({
  page,
  renderScenario,
}) => {
  await renderScenario(flowsheet())
  const heart = row(page, 0)
  await expect(heart.nth(1)).not.toHaveAttribute('part', /cell-flag/)
  await expect(heart.nth(2)).toHaveAttribute('part', /cell-flag-high/)
  await expect(heart.nth(2).locator('[part~="flag"]')).toHaveAttribute('title', 'High, normal 60–100')
  await expect(heart.nth(2)).toContainText('H')
  const potassium = row(page, 1)
  await expect(potassium.nth(1)).toHaveAttribute('part', /cell-flag-low/)
  await expect(potassium.nth(3)).toHaveAttribute('part', /cell-flag-critical-high/)
  await expect(potassium.nth(3).locator('[part~="flag"]')).toHaveAttribute('part', /flag-critical-high/)
  // The letter is drawn and hidden from assistive technology; the word is read.
  await expect(potassium.nth(3).locator('.flag-name')).toHaveText('Critically high')
  // No range on the row: nothing to flag.
  await expect(row(page, 2).nth(1)).not.toHaveAttribute('part', /cell-flag/)
  await accessible(page)
})

test('fixed limits work as numbers, a new reading time adds a column, and the French marks follow the language', async ({ page, renderScenario }) => {
  await renderScenario(`<div lang="fr">${flowsheet('', '', 'reference-range="60,100"')}</div>`)
  await expect(row(page, 1).nth(1)).toHaveAttribute('part', /cell-flag-low/)
  await expect(row(page, 0).nth(2).locator('[part~="flag"]')).toContainText('H')
  await expect(row(page, 1).nth(1).locator('[part~="flag"]')).toContainText('B')
  await table(page).evaluate((element: HTMLElement & { rows: Array<{ readings: Record<string, number> }> }) => {
    element.rows = element.rows.map((entry, index) => (index === 0 ? { ...entry, readings: { ...entry.readings, '2026-11-14T20:00': 90 } } : entry))
  })
  await expect(headers(page)).toHaveCount(5)
})

test('series columns sort like any column, and the flags cost nothing without a range: 50,000 rows render the same window', async ({
  page,
  renderScenario,
}) => {
  await renderScenario(flowsheet('sortable filterable'))
  await headers(page).nth(1).click()
  await expect(row(page, 0).first()).toHaveText(/Potassium/)

  const count = async (extra: string) => {
    await renderScenario(`<c2-table style="height:480px;width:520px" row-key="id" aria-label="Rows">
  <c2-table-column field="id" header="Id" width="160px" ${extra}></c2-table-column>
</c2-table>`)
    return table(page).evaluate(async (element: HTMLElement & { rows: unknown[]; updateComplete: Promise<boolean> }) => {
      element.rows = Array.from({ length: 50_000 }, (_, index) => ({ id: String(index) }))
      let done = await element.updateComplete
      while (!done) done = await element.updateComplete
      return element.shadowRoot!.querySelectorAll('.row--body').length
    })
  }
  const plain = await count('')
  expect(await count('reference-range="0,10"')).toBe(plain)
})

test('keys that are not times sort naturally, a date alone heads its own day, and a key with a dot still shows its values', async ({
  page,
  renderScenario,
}) => {
  const visits = [{ id: 'a', measure: 'Score', visits: { 'Visit 10': 3, 'Visit 2': 1, 'Visit 1': 2 } }]
  await renderScenario(`<c2-table style="height:200px;width:640px" row-key="id" aria-label="Visits" rows='${JSON.stringify(visits)}'>
  <c2-table-column field="measure" header="Measure" width="120px"></c2-table-column>
  <c2-table-column series="visits" series-format="text" width="100px"></c2-table-column>
</c2-table>`)
  await expect(headers(page)).toHaveText([/Measure/, /Visit 1\s*$/, /Visit 2\s*$/, /Visit 10\s*$/])

  const days = [{ id: 'a', measure: 'Glucose', results: { '2026-11-14': 104, '2026-11-14T08:00:00.000Z': 99 } }]
  await renderScenario(`<c2-table style="height:200px;width:640px" row-key="id" aria-label="Days" rows='${JSON.stringify(days)}'>
  <c2-table-column field="measure" header="Measure" width="120px"></c2-table-column>
  <c2-table-column series="results" series-format="date" locale="en-US" width="140px" reference-range=",100"></c2-table-column>
</c2-table>`)
  await expect(headers(page).nth(1)).toHaveText(/Nov 14, 2026/)
  await expect(row(page, 0)).toHaveText([/Glucose/, /104\s*H/, /99/])
})

test('a series column filters like any column, by the column of one reading', async ({ page, renderScenario }) => {
  await renderScenario(flowsheet('filterable', `filters='{"readings:2026-11-14T08:00":{"include":["82"]}}'`))
  await expect(table(page).locator('.row--body')).toHaveCount(1)
  await expect(row(page, 0).first()).toHaveText(/Heart rate/)
})
