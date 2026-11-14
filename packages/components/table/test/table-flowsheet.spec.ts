import type { Page } from '@playwright/test'
import { test, expect, accessible } from '../../../../tests/component-fixture'

const VITALS = [
  { id: 'hr', measure: 'Heart rate', low: 60, high: 100, critLow: 40, critHigh: 140, readings: { '2026-11-14T12:00': 132, '2026-11-14T08:00': 82 } },
  { id: 'k', measure: 'Potassium', low: 3.5, high: 5.1, critLow: 2.8, critHigh: 6.2, readings: { '2026-11-14T08:00': 3.1, '2026-11-14T16:00': 6.6 } },
  { id: 'temp', measure: 'Temperature', readings: { '2026-11-14T08:00': 37.1 } },
]

const RANGES = 'reference-range="low,high" critical-range="critLow,critHigh"'

const flowsheet = ({ host = '', column = '', ranges = RANGES, rows = VITALS }: { host?: string; column?: string; ranges?: string; rows?: unknown[] } = {}) =>
  `<c2-flowsheet style="height:260px;width:760px" row-key="id" aria-label="Vitals" rows='${JSON.stringify(rows)}' ${host}>
  <c2-table-column field="measure" header="Measure" width="140px" pinned="start"></c2-table-column>
  <c2-table-column field="readings" locale="en-US" width="110px" align="end" format="number" ${ranges} ${column}></c2-table-column>
</c2-flowsheet>`

const sheet = (page: Page) => page.locator('c2-flowsheet')
const headers = (page: Page) => sheet(page).locator('[role="columnheader"]')
const row = (page: Page, index: number) => sheet(page).locator('.row--body').nth(index).locator('[role="gridcell"]')

test('the readings column becomes a column per time across the rows, in time order, with the day over the first time of each day', async ({
  page,
  renderScenario,
}) => {
  await renderScenario(flowsheet())
  await expect(headers(page)).toHaveText([/Measure/, /Nov 14\s*8:00\sAM/, /^\s*12:00\sPM/, /^\s*4:00\sPM/])
  // The full date and time is the header's name; the two drawn lines are hidden from assistive technology.
  await expect(headers(page).nth(1).locator('.time-name')).toHaveText('Nov 14, 2026, 8:00 AM')
  await expect(row(page, 0)).toHaveText([/Heart rate/, /82/, /132/, /^\s*$/])
  await expect(row(page, 2)).toHaveText([/Temperature/, /37\.1/, /^\s*$/, /^\s*$/])

  await renderScenario(flowsheet({ host: 'time-order="desc" times="2026-11-15T00:00"' }))
  await expect(headers(page)).toHaveText([/Measure/, /Nov 15\s*12:00\sAM/, /Nov 14\s*4:00\sPM/, /^\s*12:00\sPM/, /^\s*8:00\sAM/])
  await accessible(page)
})

test('observations are sorted into the rows by measure and time, and addTime() adds an empty column', async ({ page, renderScenario }) => {
  const measures = VITALS.map(({ readings: _readings, ...measure }) => measure)
  const observations = [
    { measure: 'hr', time: '2026-11-14T08:00', value: 88 },
    { measure: 'k', time: '2026-11-14T12:00', value: 5.6 },
    { measure: 'unknown', time: '2026-11-14T20:00', value: 1 },
  ]
  await renderScenario(flowsheet({ rows: measures, host: `observations='${JSON.stringify(observations)}'` }))
  await expect(headers(page)).toHaveCount(3)
  await expect(row(page, 0)).toHaveText([/Heart rate/, /88/, /^\s*$/])
  await expect(row(page, 1).nth(2)).toHaveAttribute('part', /cell-flag-high/)

  await sheet(page).evaluate((element: HTMLElement & { addTime(time: string): Promise<boolean> }) => element.addTime('2026-11-14T16:00'))
  await expect(headers(page)).toHaveCount(4)
  await expect(headers(page).nth(3)).toHaveText(/4:00\sPM/)
})

test('a reading outside its row range is flagged H or L, past the critical range HH or LL, and screen readers hear the word', async ({
  page,
  renderScenario,
}) => {
  await renderScenario(flowsheet())
  const heart = row(page, 0)
  await expect(heart.nth(1)).not.toHaveAttribute('part', /cell-flag/)
  await expect(heart.nth(2)).toHaveAttribute('part', /cell-flag-high/)
  await expect(heart.nth(2).locator('[part~="flag"]')).toHaveAttribute('title', 'High, normal 60–100')
  const potassium = row(page, 1)
  await expect(potassium.nth(1)).toHaveAttribute('part', /cell-flag-low/)
  await expect(potassium.nth(3)).toHaveAttribute('part', /cell-flag-critical-high/)
  await expect(potassium.nth(3).locator('.flag-name')).toHaveText('Critically high')
  await expect(row(page, 2).nth(1)).not.toHaveAttribute('part', /cell-flag/)
  await accessible(page)
})

test('fixed limits work as numbers, a plain table flags too, and the French marks follow the language', async ({ page, renderScenario }) => {
  await renderScenario(`<div lang="fr">${flowsheet({ ranges: 'reference-range="60,100"' })}</div>`)
  await expect(row(page, 1).nth(1)).toHaveAttribute('part', /cell-flag-low/)
  await expect(row(page, 0).nth(2).locator('[part~="flag"]')).toContainText('H')
  await expect(row(page, 1).nth(1).locator('[part~="flag"]')).toContainText('B')

  await renderScenario(`<c2-table style="height:200px;width:420px" row-key="id" aria-label="Labs" rows='[{"id":"glu","test":"Glucose","value":131,"low":70,"high":99}]'>
  <c2-table-column field="test" header="Test" width="140px"></c2-table-column>
  <c2-table-column field="value" header="Result" width="120px" reference-range="low,high" critical-range=".5,400"></c2-table-column>
</c2-table>`)
  await expect(page.locator('c2-table [part~="cell-value"]')).toHaveAttribute('part', /cell-flag-high/)
})

test('times that are not ISO sort naturally, a date alone heads its own day, and a key with a dot still shows its value', async ({ page, renderScenario }) => {
  await renderScenario(
    flowsheet({ rows: [{ id: 'a', measure: 'Score', readings: { 'Visit 10': 3, 'Visit 2': 1, 'Visit 1': 2 } }], host: 'time-format="text"', ranges: '' }),
  )
  await expect(headers(page)).toHaveText([/Measure/, /Visit 1\s*$/, /Visit 2\s*$/, /Visit 10\s*$/])

  await renderScenario(
    flowsheet({
      rows: [{ id: 'a', measure: 'Glucose', readings: { '2026-11-14': 104, '2026-11-14T08:00:00.000Z': 99 } }],
      host: 'time-format="date"',
      ranges: 'reference-range=",100"',
    }),
  )
  await expect(headers(page).nth(1)).toHaveText(/Nov 14, 2026/)
  await expect(row(page, 0)).toHaveText([/Glucose/, /104\s*H/, /99/])
})

test('time columns sort and filter like any column, and grouping folds the measures', async ({ page, renderScenario }) => {
  await renderScenario(flowsheet({ host: `sortable filters='{"readings:2026-11-14T08:00":{"include":["82"]}}'` }))
  await expect(sheet(page).locator('.row--body')).toHaveCount(1)
  await sheet(page).evaluate((element: HTMLElement & { filters: unknown }) => (element.filters = {}))
  await headers(page).nth(1).click()
  await expect(row(page, 0).first()).toHaveText(/Potassium/)

  const grouped = VITALS.map((entry, index) => ({ ...entry, system: index < 2 ? 'Vitals' : 'Other' }))
  await renderScenario(flowsheet({ rows: grouped, host: 'group-by="system"' }))
  await expect(sheet(page).locator('[part~="group-row"]')).toHaveCount(2)
})

test('a plain table costs nothing for flags it does not use: 50,000 rows render the same window', async ({ page, renderScenario }) => {
  const count = async (extra: string) => {
    await renderScenario(`<c2-table style="height:480px;width:520px" row-key="id" aria-label="Rows">
  <c2-table-column field="id" header="Id" width="160px" ${extra}></c2-table-column>
</c2-table>`)
    return page.locator('c2-table').evaluate(async (element: HTMLElement & { rows: unknown[]; updateComplete: Promise<boolean> }) => {
      element.rows = Array.from({ length: 50_000 }, (_, index) => ({ id: String(index) }))
      let done = await element.updateComplete
      while (!done) done = await element.updateComplete
      return element.shadowRoot!.querySelectorAll('.row--body').length
    })
  }
  const plain = await count('')
  expect(await count('reference-range="0,10"')).toBe(plain)
})

test('with observations the rows stay the app’s own objects, an edit lands in them and wins, and a dotted readings field works', async ({
  page,
  renderScenario,
}) => {
  const measures = [{ id: 'hr', measure: 'Heart rate', chart: {} }]
  const observations = [{ measure: 'hr', time: '2026-11-14T08:00', value: 82 }]
  await renderScenario(`<c2-flowsheet style="height:200px;width:520px" row-key="id" aria-label="Edit" editable readings-field="chart.readings" rows='${JSON.stringify(measures)}' observations='${JSON.stringify(observations)}'>
  <c2-table-column field="measure" header="Measure" width="140px"></c2-table-column>
  <c2-table-column field="chart.readings" locale="en-US" width="110px" editor="number"></c2-table-column>
</c2-flowsheet>`)
  await expect(row(page, 0)).toHaveText([/Heart rate/, /82/])
  await row(page, 0).nth(1).click()
  await page.keyboard.type('90')
  await page.keyboard.press('Enter')
  await expect(row(page, 0).nth(1)).toHaveText(/90/)
  const stored = await sheet(page).evaluate(
    (element: HTMLElement & { rows: Array<{ chart: { readings?: Record<string, number> } }> }) => element.rows[0].chart.readings,
  )
  expect(stored).toEqual({ '2026-11-14T08:00': 90 })
})

test('a date alone is headed by its day, and only two-line headers grow the header row', async ({ page, renderScenario }) => {
  await renderScenario(flowsheet({ rows: [{ id: 'a', measure: 'Glucose', readings: { '2026-11-14': 104, '2026-11-15': 98 } }], ranges: '' }))
  await expect(headers(page)).toHaveText([/Measure/, /Nov 14, 2026/, /Nov 15, 2026/])
  const plain = await sheet(page).evaluate((element) => element.shadowRoot!.querySelector<HTMLElement>('.row--header')!.offsetHeight)

  await renderScenario(flowsheet({ ranges: '' }))
  const twoLines = await sheet(page).evaluate((element) => element.shadowRoot!.querySelector<HTMLElement>('.row--header')!.offsetHeight)
  expect(twoLines).toBeGreaterThan(plain)
})

test('now marks the column of the latest time not after it, header and cells, and moves when it changes', async ({ page, renderScenario }) => {
  await renderScenario(flowsheet({ host: 'now="2026-11-14T13:30"', ranges: '' }))
  await expect(headers(page).nth(2).locator('[part="time-now"]')).toHaveCount(1)
  await expect(headers(page).nth(2)).toContainText('now')
  await expect(row(page, 0).nth(2)).toHaveAttribute('part', /cell-now/)
  await expect(row(page, 0).nth(1)).not.toHaveAttribute('part', /cell-now/)
  await sheet(page).evaluate((element: HTMLElement & { now: string }) => (element.now = '2026-11-14T16:05'))
  await expect(row(page, 0).nth(3)).toHaveAttribute('part', /cell-now/)
  await expect(row(page, 0).nth(2)).not.toHaveAttribute('part', /cell-now/)
  await expect(headers(page).nth(3).locator('[part="time-now"]')).toHaveCount(1)
  // Before the first time, no column is current.
  await sheet(page).evaluate((element: HTMLElement & { now: string }) => (element.now = '2026-11-14T06:00'))
  await expect(sheet(page).locator('[part~="cell-now"]')).toHaveCount(0)
  await accessible(page)
})

test('a flagged reading in the current column keeps its flag under the tint, and a date alone as now is read like the keys', async ({
  page,
  renderScenario,
}) => {
  await renderScenario(flowsheet({ host: 'now="2026-11-14T13:30"' }))
  const heart = row(page, 0).nth(2)
  await expect(heart).toHaveAttribute('part', /cell-flag-high/)
  await expect(heart).toHaveAttribute('part', /cell-now/)
  const look = await heart.evaluate((cell) => {
    const style = getComputedStyle(cell)
    return { color: style.backgroundColor, image: style.backgroundImage }
  })
  expect(look.color).not.toBe('rgba(0, 0, 0, 0)')
  expect(look.image).toContain('linear-gradient')

  await renderScenario(
    flowsheet({
      rows: [{ id: 'a', measure: 'Weight', readings: { '2026-11-13': 70.2, '2026-11-14': 70.6 } }],
      host: 'time-format="date" now="2026-11-14"',
      ranges: '',
    }),
  )
  await expect(row(page, 0).nth(2)).toHaveAttribute('part', /cell-now/)
  await expect(headers(page).nth(2).locator('[part="time-now"]')).toContainText(', now')
})
