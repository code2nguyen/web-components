import type { Page } from '@playwright/test'
import { test, expect, accessible } from '../../../../tests/component-fixture'

const PEOPLE = [
  { id: 'ada', name: 'Ada', team: 'Platform', capacity: 40, allocations: { '2026-11-16': 44, '2026-11-09': 40 } },
  { id: 'grace', name: 'Grace', team: 'Platform', capacity: 32, allocations: { '2026-11-09': 24, '2026-11-16': 32 } },
  { id: 'alan', name: 'Alan', team: 'Data', allocations: { '2026-11-09': 38 } },
]

const grid = (host = '', template = '', rows: unknown[] = PEOPLE) =>
  `<c2-allocation-grid style="height:280px;width:760px" row-key="id" aria-label="Staffing" capacity="40" rows='${JSON.stringify(rows)}' ${host}>
  <c2-table-column field="name" header="Person" width="140px"></c2-table-column>
  <c2-table-column field="allocations" locale="en-US" width="100px" align="end" format="number" ${template}></c2-table-column>
</c2-allocation-grid>`

const sheet = (page: Page) => page.locator('c2-allocation-grid')
const headers = (page: Page) => sheet(page).locator('[role="columnheader"]')
const row = (page: Page, index: number) => sheet(page).locator('.row--body').nth(index).locator('[role="gridcell"]')

test('a column per period in order, each cell under, at or over its row capacity, and a screen reader hears the load', async ({ page, renderScenario }) => {
  await renderScenario(grid('periods="2026-11-23"'))
  await expect(headers(page)).toHaveText([/Person/, /Nov 9/, /Nov 16/, /Nov 23/])
  const ada = row(page, 0)
  await expect(ada.nth(1)).toHaveAttribute('part', /cell-allocation cell-at/)
  await expect(ada.nth(2)).toHaveAttribute('part', /cell-over/)
  await expect(ada.nth(2).locator('[part="load"]')).toHaveText('over capacity')
  await expect(ada.nth(3)).not.toHaveAttribute('part', /cell-allocation(\s|$)/)
  // Grace's own capacity is 32; Alan has none, so the grid's 40 applies.
  await expect(row(page, 1).nth(1)).toHaveAttribute('part', /cell-under/)
  await expect(row(page, 1).nth(2)).toHaveAttribute('part', /cell-at/)
  await expect(row(page, 2).nth(1)).toHaveAttribute('part', /cell-under/)
  await accessible(page)
})

test('tolerance widens "at", row-totals adds a total against the capacity of every period, and summary totals each period', async ({
  page,
  renderScenario,
}) => {
  await renderScenario(grid('tolerance="0.1" row-totals', 'summary="sum"'))
  await expect(row(page, 0).nth(2)).toHaveAttribute('part', /cell-at/)
  await expect(headers(page).last()).toHaveText(/Total/)
  await expect(row(page, 0).last()).toHaveText(/84/)
  await expect(row(page, 0).last()).toHaveAttribute('part', /cell-at/)
  await expect(row(page, 2).last()).toHaveAttribute('part', /cell-under/)
  const summary = sheet(page).locator('[part~="summary-cell"]')
  await expect(summary.nth(1)).toHaveText(/102/)
  await expect(summary.last()).toHaveText(/178/)
})

test('cells are edited like any number cell, groups subtotal each period, and cellPart adds parts on any table', async ({ page, renderScenario }) => {
  await renderScenario(grid('editable', 'editor="number"'))
  await row(page, 2).nth(2).click()
  await page.keyboard.type('46')
  await page.keyboard.press('Enter')
  await expect(row(page, 2).nth(2)).toHaveAttribute('part', /cell-over/)
  const stored = await sheet(page).evaluate((element: HTMLElement & { rows: Array<{ allocations: Record<string, number> }> }) => element.rows[2].allocations)
  expect(stored).toEqual({ '2026-11-09': 38, '2026-11-16': 46 })

  await renderScenario(grid('group-by="team"', 'summary="sum"'))
  await expect(sheet(page).locator('[part~="group-row"]')).toHaveCount(2)

  await renderScenario(`<c2-table style="height:200px;width:400px" row-key="id" aria-label="Scores" rows='[{"id":"a","score":41},{"id":"b","score":88}]'>
  <c2-table-column field="score" header="Score" width="120px"></c2-table-column>
</c2-table>`)
  await page.locator('c2-table').evaluate((element: HTMLElement & { cellPart: unknown }) => {
    element.cellPart = ({ value }: { value: number }) => (value < 50 ? 'cell-failing' : undefined)
  })
  await expect(page.locator('c2-table [part~="cell-score"]').first()).toHaveAttribute('part', /cell-failing/)
  await expect(page.locator('c2-table [part~="cell-score"]').last()).not.toHaveAttribute('part', /cell-failing/)
})

test('cellPart leaves the window alone: 50,000 rows render the same number of rows with and without it', async ({ page, renderScenario }) => {
  const count = async (part: boolean) => {
    await renderScenario(`<c2-table style="height:480px;width:520px" row-key="id" aria-label="Rows">
  <c2-table-column field="id" header="Id" width="160px"></c2-table-column>
</c2-table>`)
    return page.locator('c2-table').evaluate(async (element: HTMLElement & { rows: unknown[]; cellPart?: unknown; updateComplete: Promise<boolean> }, part) => {
      if (part) element.cellPart = () => undefined
      element.rows = Array.from({ length: 50_000 }, (_, index) => ({ id: String(index) }))
      let done = await element.updateComplete
      while (!done) done = await element.updateComplete
      return element.shadowRoot!.querySelectorAll('.row--body').length
    }, part)
  }
  expect(await count(true)).toBe(await count(false))
})

test('the total follows the template currency and the language, and the summary follows a new set of periods of the same length', async ({
  page,
  renderScenario,
}) => {
  await renderScenario(`<div lang="en"><c2-allocation-grid style="height:280px;width:760px" row-key="id" aria-label="Staffing" capacity="40" row-totals rows='${JSON.stringify(PEOPLE)}'>
  <c2-table-column field="name" header="Person" width="140px"></c2-table-column>
  <c2-table-column field="allocations" locale="en-US" width="100px" align="end" format="currency" currency="EUR" format-options='{"maximumFractionDigits":0}' summary="sum"></c2-table-column>
</c2-allocation-grid></div>`)
  await expect(row(page, 0).last()).toHaveText(/€84/)
  await page.locator('div[lang]').evaluate((element) => element.setAttribute('lang', 'fr'))
  await expect(headers(page).last()).toHaveText(/Total/)
  await expect(row(page, 0).nth(1).locator('[part="load"]')).toHaveText('à capacité')

  await renderScenario(grid('periods="2026-11-23"', 'summary="sum"'))
  const summary = sheet(page).locator('[part~="summary-cell"]')
  await expect(summary.nth(3)).toHaveText(/^\s*0\s*$/)
  await sheet(page).evaluate((element: HTMLElement & { periods: string[]; rows: Array<{ allocations: Record<string, number> }> }) => {
    element.rows = element.rows.map((entry) => ({ ...entry, allocations: { ...entry.allocations, '2026-11-30': 10 } }))
    element.periods = []
  })
  await expect(headers(page).nth(3)).toHaveText(/Nov 30/)
  await expect(summary.nth(3)).toHaveText(/30/)
})
