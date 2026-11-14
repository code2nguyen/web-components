import type { Page } from '@playwright/test'
import { test, expect, accessible } from '../../../../tests/component-fixture'

const LEGEND = JSON.stringify([
  { value: 'pass', label: 'Passed', color: 'rgb(22, 163, 74)', glyph: '✓' },
  { value: 'fail', label: 'Failed', color: 'rgb(220, 38, 38)', glyph: '✕' },
  { value: 'na', label: 'Not applicable' },
])

const DEVICES = [
  { id: 'd1', device: 'MacBook-014', disk: 'pass', firewall: 'pass', patches: 'fail' },
  { id: 'd2', device: 'MacBook-027', disk: 'fail', firewall: 'pass', patches: 'fail' },
  { id: 'd3', device: 'Surface-003', disk: 'pass', firewall: 'na', patches: 'pass' },
]

const matrix = (attributes = '') =>
  `<c2-table style="height:300px;width:720px" row-key="id" aria-label="Device compliance" rows='${JSON.stringify(DEVICES)}' ${attributes}>
  <c2-table-column field="device" header="Device" width="160px" summary-label="Passing"></c2-table-column>
  <c2-table-column field="disk" header="Disk encryption" width="150px" format="status" options='${LEGEND}' summary="tally"></c2-table-column>
  <c2-table-column field="firewall" header="Firewall" width="150px" format="status" options='${LEGEND}' summary="tally"></c2-table-column>
  <c2-table-column field="patches" header="Patches" width="150px" format="status" options='${LEGEND}' editor="select"></c2-table-column>
  <c2-table-column column-id="failing" header="Failing" width="90px" align="end" count-value="fail" summary="sum"></c2-table-column>
</c2-table>`

const table = (page: Page) => page.locator('c2-table')

test('a status column draws each value as a mark and a label from its legend', async ({ page, renderScenario }) => {
  await renderScenario(matrix())
  const failed = table(page).locator('.row--body').nth(1).locator('[part~="status-fail"]').first()
  await expect(failed).toHaveText('✕Failed')
  await expect(failed).toHaveAttribute('title', 'Disk encryption: Failed')
  await expect(failed.locator('[part="status-mark"]')).toHaveCSS('background-color', 'rgb(220, 38, 38)')
  await expect(failed.locator('[part="status-mark"]')).toHaveAttribute('aria-hidden', 'true')
  // A value whose legend entry has no colour takes the default mark, a dot.
  const na = table(page).locator('.row--body [part~="status-na"]')
  await expect(na).toHaveText('Not applicable')
  await expect(na.locator('[part="status-mark"]')).toHaveCSS('background-color', 'rgb(161, 161, 170)')
  // The cell is still named by its label.
  await expect(table(page).getByRole('gridcell', { name: 'Not applicable', exact: true })).toBeVisible()
  await accessible(page)
})

test('summary="tally" counts each status in legend order, and count-value counts a row', async ({ page, renderScenario }) => {
  await renderScenario(matrix())
  const summary = table(page).locator('[part~="summary-cell"]')
  await expect(summary.nth(1)).toHaveText(/✓Passed\s*2\s*✕Failed\s*1/)
  await expect(summary.nth(2)).toHaveText(/✓Passed\s*2\s*Not applicable\s*1/)
  const failing = table(page).locator('[part~="cell-failing"]')
  await expect(failing).toHaveText(['1', '2', '0'])
  await expect(summary.nth(4)).toHaveText('3')
})

test('an editable status column takes a new value from its legend, and the counts follow', async ({ page, renderScenario }) => {
  await renderScenario(matrix('editable'))
  await table(page).locator('.row--body').nth(0).locator('[part~="cell-patches"]').click()
  await page.keyboard.press('Enter')
  await table(page).locator('select.editor').selectOption('Passed')
  await page.keyboard.press('Enter')
  await expect(table(page).locator('[part~="cell-failing"]')).toHaveText(['0', '2', '0'])
})

const ENTRIES = [
  { id: 't1', date: '2026-11-03', memo: 'Client payment', credit: 1200 },
  { id: 't2', date: '2026-11-01', memo: 'Rent', debit: 800 },
  { id: 't3', date: '2026-11-05', memo: 'Card authorisation', pending: 45 },
  { id: 't4', date: '2026-11-04', memo: 'Software', debit: 60 },
]

const ledger = (attributes = 'sort="date:asc"') =>
  `<c2-table style="height:300px;width:620px" row-key="id" aria-label="Statement" rows='${JSON.stringify(ENTRIES)}' ${attributes}>
  <c2-table-column field="date" header="Date" width="120px" summary-label="Closing balance"></c2-table-column>
  <c2-table-column field="memo" header="Description" width="180px"></c2-table-column>
  <c2-table-column field="debit" header="Debit" width="90px" align="end" format="number"></c2-table-column>
  <c2-table-column field="credit" header="Credit" width="90px" align="end" format="number"></c2-table-column>
  <c2-table-column column-id="balance" header="Balance" width="110px" align="end" format="number" running="credit,-debit" opening="1000" summary="last"></c2-table-column>
</c2-table>`

test('a running column totals the rows in their sorted order from an opening value', async ({ page, renderScenario }) => {
  await renderScenario(ledger())
  // 1000 − 800 (Nov 1) + 1200 (Nov 3) − 60 (Nov 4); the pending card authorisation moves nothing and shows nothing.
  await expect(table(page).locator('[part~="cell-balance"]')).toHaveText(['200', '1,400', '1,340', ''])
  await expect(table(page).locator('[part~="summary-cell-balance"]')).toHaveText('1,340')

  // A new snapshot recomputes the totals once.
  await table(page).evaluate((element: HTMLElement & { rows: Record<string, unknown>[] }) => {
    element.rows = element.rows.map((row) => (row.id === 't2' ? { ...row, debit: 900 } : row))
  })
  await expect(table(page).locator('[part~="cell-balance"]')).toHaveText(['100', '1,300', '1,240', ''])
  await accessible(page)
})

test('running totals are computed when the rows change, not while the table scrolls', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-table style="height:300px;width:420px" row-key="id" aria-label="Rows">
  <c2-table-column field="id" header="Id" width="120px"></c2-table-column>
  <c2-table-column column-id="balance" header="Balance" width="120px" align="end" running="amount"></c2-table-column>
</c2-table>`)
  const reads = await table(page).evaluate(async (element: HTMLElement & { rows: unknown[]; updateComplete: Promise<boolean> }) => {
    const counter = { reads: 0 }
    ;(window as unknown as { counter: typeof counter }).counter = counter
    element.rows = Array.from({ length: 50_000 }, (_, index) => ({
      id: String(index),
      get amount() {
        counter.reads++
        return 1
      },
    }))
    let done = await element.updateComplete
    while (!done) done = await element.updateComplete
    return counter.reads
  })
  expect(reads).toBe(50_000)
  await table(page).evaluate(async (element: HTMLElement & { updateComplete: Promise<boolean> }) => {
    const viewport = element.shadowRoot!.querySelector<HTMLElement>('.viewport')!
    for (const top of [4000, 120000, 800000]) {
      viewport.scrollTop = top
      await new Promise(requestAnimationFrame)
      await element.updateComplete
    }
  })
  expect(await page.evaluate(() => (window as unknown as { counter: { reads: number } }).counter.reads)).toBe(50_000)
  await expect(table(page).locator('.row--body').first()).toBeVisible()
})

test('date parts in format-options replace the default date style instead of falling back to the raw value', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-table style="height:200px;width:320px" aria-label="Dates" rows='[{"day":"2026-11-03T12:00:00"}]'>
  <c2-table-column field="day" header="Day" width="160px" format="date" locale="en-US" format-options='{"month":"short","day":"numeric"}'></c2-table-column>
</c2-table>`)
  await expect(table(page).getByRole('gridcell', { name: 'Nov 3', exact: true })).toBeVisible()
})

test('count-value counts hidden status columns too, and a legend matches numbers given as text', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-table style="height:200px;width:520px" aria-label="Skills" rows='[{"name":"Ada","lit":4,"css":"4"},{"name":"Alan","lit":1,"css":4}]'>
  <c2-table-column field="name" header="Name" width="120px"></c2-table-column>
  <c2-table-column field="lit" header="Lit" width="140px" format="status" options='[{"value":"4","label":"Expert","color":"rgb(30, 58, 138)"},{"value":1,"label":"Learning"}]'></c2-table-column>
  <c2-table-column field="css" header="CSS" width="140px" format="status" hidden options='[{"value":"4","label":"Expert"}]'></c2-table-column>
  <c2-table-column column-id="experts" header="Experts" width="80px" count-value="4"></c2-table-column>
</c2-table>`)
  await expect(table(page).locator('[part~="cell-lit"]')).toHaveText(['Expert', 'Learning'])
  await expect(table(page).locator('.row--body').first().locator('[part="status-mark"]')).toHaveCSS('background-color', 'rgb(30, 58, 138)')
  await expect(table(page).locator('[part~="cell-experts"]')).toHaveText(['2', '1'])
})

test('a tree parent shows the tally of its leaves, and a running total counts the leaves only', async ({ page, renderScenario }) => {
  const tree = [
    {
      id: 'eu',
      name: 'Europe',
      debit: 500,
      children: [
        { id: 'fr', name: 'France', state: 'pass', debit: 200 },
        { id: 'de', name: 'Germany', state: 'fail', debit: 300 },
      ],
    },
    { id: 'us', name: 'United States', state: 'pass', debit: 100 },
  ]
  await renderScenario(`<c2-group-table style="height:240px;width:560px" row-key="id" aria-label="Regions" children-field="children" tree-expanded rows='${JSON.stringify(tree)}'>
  <c2-table-column field="name" header="Region" width="180px"></c2-table-column>
  <c2-table-column field="state" header="State" width="160px" format="status" rollup="tally" options='[{"value":"pass","label":"Passing","glyph":"✓"},{"value":"fail","label":"Failing","glyph":"✕"}]'></c2-table-column>
  <c2-table-column column-id="balance" header="Balance" width="120px" align="end" running="-debit" opening="1000" summary="last"></c2-table-column>
</c2-group-table>`)
  await expect(page.locator('c2-group-table').locator('.row--body').first().locator('[part~="cell-state"]')).toHaveText(/✓Passing\s*1\s*✕Failing\s*1/)
  await expect(page.locator('c2-group-table').locator('[part~="cell-balance"]')).toHaveText(['', '800', '500', '400'])
  await expect(page.locator('c2-group-table').locator('[part~="summary-cell-balance"]')).toHaveText('400')
})

test('weekday and timeZoneName add to the default date style; year, month and day replace it', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-table style="height:200px;width:640px" aria-label="Dates" rows='[{"day":"2026-11-03T12:00:00Z"}]'>
  <c2-table-column field="day" header="Weekday" width="200px" format="date" locale="en-US" format-options='{"weekday":"short","timeZone":"UTC"}'></c2-table-column>
  <c2-table-column column-id="zone" field="day" header="Zone" width="260px" format="datetime" locale="en-US" format-options='{"timeZoneName":"short","timeZone":"UTC"}'></c2-table-column>
</c2-table>`)
  await expect(table(page).locator('[part~="cell-day"]')).toHaveText('Tue, Nov 3, 2026')
  await expect(table(page).locator('[part~="cell-zone"]')).toHaveText(/Nov 3, 2026, 12:00\sPM UTC/)
})

test('summary-target marks a total that misses its target, and says what it should be', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-table style="height:220px;width:420px" row-key="id" aria-label="Split" rows='[{"id":"a","dept":"Sales","share":0.6},{"id":"b","dept":"Support","share":0.3}]'>
  <c2-table-column field="dept" header="Department" width="200px" summary-label="Total"></c2-table-column>
  <c2-table-column field="share" header="Share" width="120px" align="end" format="percent" locale="en-US" summary="sum" summary-target="1"></c2-table-column>
</c2-table>`)
  const total = table(page).locator('[part~="summary-cell-share"]')
  await expect(total).toHaveAttribute('part', /\bsummary-cell-off-target\b/)
  await expect(total).toHaveAttribute('title', 'should be 100%')
  await expect(total).toHaveCSS('color', 'rgb(211, 21, 16)')
  // Said once, as the cell's description: its name stays the figure.
  await expect(table(page).getByRole('gridcell', { name: '90%', exact: true })).toHaveAccessibleDescription('should be 100%')

  await table(page).evaluate((element: HTMLElement & { rows: Record<string, unknown>[] }) => {
    element.rows = element.rows.map((row) => (row.id === 'b' ? { ...row, share: 0.4 } : row))
  })
  await expect(total).not.toHaveAttribute('part', /off-target/)
  await expect(total).not.toHaveAttribute('title', /.+/)
})
