import { test, expect, accessible, props, watch } from '../../../../tests/component-fixture'
import type { Locator, Page } from '@playwright/test'

const SALES = [
  { region: 'Europe', country: 'Germany', quarter: 'Q1', revenue: 400, orders: 10 },
  { region: 'Europe', country: 'Germany', quarter: 'Q2', revenue: 450, orders: 12 },
  { region: 'Europe', country: 'France', quarter: 'Q1', revenue: 300, orders: 9 },
  { region: 'Europe', country: 'France', quarter: 'Q2', revenue: 380, orders: 11 },
  { region: 'Europe', country: 'Spain', quarter: 'Q2', revenue: 200, orders: 5 },
  { region: 'Americas', country: 'USA', quarter: 'Q1', revenue: 1200, orders: 30 },
  { region: 'Americas', country: 'USA', quarter: 'Q2', revenue: 1300, orders: 33 },
  { region: 'Americas', country: 'Canada', quarter: 'Q2', revenue: 250, orders: 7 },
]
const json = (value: unknown) => JSON.stringify(value).replaceAll("'", '&#39;')
const table = (page: Page) => page.locator('c2-pivot-table')
const body = (locator: Locator) => locator.locator('tbody tr')
/** Each body row as [header, ...cells]. */
const grid = (locator: Locator) =>
  locator.locator('tbody tr').evaluateAll((rows) => rows.map((row) => [...row.children].map((cell) => (cell.textContent ?? '').replace(/[▾▸]/g, '').trim())))
const events = async (locator: Locator) => JSON.parse((await locator.getAttribute('data-events')) ?? '[]')

test('pivot() aggregates every cell, subtotal and total, groups blanks, and every aggregate works', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-pivot-table></c2-pivot-table>`)
  const out = await page.evaluate((data) => {
    type Node = { label: string; children: Node[] }
    type Result = { cell(r: string[], c: string[], v: number): number | null; records(r: string[], c: string[]): number[]; rows: Node; columns: Node }
    const { pivot } = (window as unknown as { pivotApi: { pivot: (data: unknown[], config: object) => Result } }).pivotApi
    const result = pivot([...data, { region: 'Europe', quarter: 'Q1', revenue: 'n/a' }, { quarter: 'Q3', revenue: 5 }], {
      rows: ['region', 'country'],
      columns: ['quarter'],
      values: [
        { field: 'revenue' },
        { field: 'orders', aggregate: 'avg' },
        { field: 'country', aggregate: 'distinct' },
        { field: 'revenue', aggregate: 'max' },
        { field: 'orders', aggregate: 'count' },
      ],
    })
    return {
      germanyQ1: result.cell(['Europe', 'Germany'], ['Q1'], 0),
      europe: result.cell(['Europe'], [], 0),
      europeQ2: result.cell(['Europe'], ['Q2'], 0),
      total: result.cell([], [], 0),
      avgOrders: result.cell(['Europe'], [], 1),
      distinctEurope: result.cell(['Europe'], [], 2),
      maxQ2: result.cell([], ['Q2'], 3),
      count: result.cell([], [], 4),
      blank: result.cell(['(blank)', '(blank)'], ['Q3'], 0),
      missing: result.cell(['Americas', 'Canada'], ['Q1'], 0),
      rows: result.rows.children.map((node) => [node.label, node.children.map((child) => child.label)]),
      columns: result.columns.children.map((node) => node.label),
      records: result.records(['Europe', 'France'], []).length,
    }
  }, SALES)
  expect(out).toEqual({
    germanyQ1: 400,
    europe: 1730,
    europeQ2: 1030,
    total: 4485,
    avgOrders: 47 / 5,
    distinctEurope: 3,
    maxQ2: 1300,
    count: 8,
    blank: 5,
    missing: null,
    rows: [
      ['Americas', ['Canada', 'USA']],
      ['Europe', ['France', 'Germany', 'Spain', '(blank)']],
      ['(blank)', ['(blank)']],
    ],
    columns: ['Q1', 'Q2', 'Q3'],
    records: 2,
  })
})

test('draws the treegrid: column headers, open groups with subtotals, grand totals, empty cells as a dash, and passes axe', async ({
  page,
  renderScenario,
}) => {
  await renderScenario(`<c2-pivot-table rows="region;country" columns="quarter" values='[{"field":"revenue"}]' data='${json(SALES)}'></c2-pivot-table>`)
  await expect(table(page).locator('thead th')).toHaveText(['region / country', 'Q1', 'Q2', 'Total'])
  expect(await grid(table(page))).toEqual([
    ['Americas', '', '', ''],
    ['Canada', '—', '250', '250'],
    ['USA', '1,200', '1,300', '2,500'],
    ['Americas total', '1,200', '1,550', '2,750'],
    ['Europe', '', '', ''],
    ['France', '300', '380', '680'],
    ['Germany', '400', '450', '850'],
    ['Spain', '—', '200', '200'],
    ['Europe total', '700', '1,030', '1,730'],
    ['Grand total', '1,900', '2,580', '4,480'],
  ])
  await expect(body(table(page)).first()).toHaveAttribute('aria-expanded', 'true')
  await expect(body(table(page)).nth(1)).toHaveAttribute('aria-level', '2')
  await expect(body(table(page)).nth(1)).toHaveAttribute('aria-posinset', '1')
  await expect(body(table(page)).nth(1)).toHaveAttribute('aria-setsize', '2')
  await expect(table(page)).toHaveHostAria('role', 'region')
  await accessible(page)
})

test('a click or the keyboard opens and closes a group; expand-depth sets the start; subtotals top and none', async ({ page, renderScenario }) => {
  await renderScenario(
    `<c2-pivot-table rows="region;country" columns="quarter" values='[{"field":"revenue"}]' expand-depth="0" data='${json(SALES)}'></c2-pivot-table>`,
  )
  expect((await grid(table(page))).map((row) => row[0])).toEqual(['Americas', 'Europe', 'Grand total'])
  expect((await grid(table(page)))[0]).toEqual(['Americas', '1,200', '1,550', '2,750'])
  await body(table(page)).nth(1).locator('th').click()
  expect((await grid(table(page))).map((row) => row[0])).toEqual(['Americas', 'Europe', 'France', 'Germany', 'Spain', 'Europe total', 'Grand total'])
  // Keyboard: the focused group header closes with ArrowLeft and opens with ArrowRight.
  await body(table(page)).nth(1).locator('th').focus()
  await page.keyboard.press('ArrowLeft')
  await expect(body(table(page))).toHaveCount(3)
  await page.keyboard.press('ArrowRight')
  await expect(body(table(page))).toHaveCount(7)
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowRight')
  await expect(table(page).locator('[data-cell="2:1"]')).toBeFocused()

  await props(table(page), { subtotals: 'top' })
  expect((await grid(table(page))).map((row) => row[0])).toEqual(['Americas', 'Europe', 'France', 'Germany', 'Spain', 'Grand total'])
  expect((await grid(table(page)))[1]).toEqual(['Europe', '700', '1,030', '1,730'])
  await props(table(page), { subtotals: 'none', totals: 'none' })
  expect((await grid(table(page))).map((row) => row[0])).toEqual(['Americas', 'Europe', 'France', 'Germany', 'Spain'])
  await expect(table(page).locator('thead th')).toHaveText(['region / country', 'Q1', 'Q2'])
})

test('a header sorts the rows by its values, down then up then by label; two values split each column', async ({ page, renderScenario }) => {
  await renderScenario(
    `<c2-pivot-table rows="country" columns="quarter" values='[{"field":"revenue","label":"Revenue"},{"field":"orders","aggregate":"count","label":"Orders"}]' data='${json(SALES)}'></c2-pivot-table>`,
  )
  await expect(table(page).locator('thead tr').first().locator('th')).toHaveText(['country', 'Q1', 'Q2', 'Total'])
  await expect(table(page).locator('thead tr').nth(1).locator('th')).toHaveText(['Revenue', 'Orders', 'Revenue', 'Orders', 'Revenue', 'Orders'])
  const labels = async () => (await grid(table(page))).map((row) => row[0])
  expect(await labels()).toEqual(['Canada', 'France', 'Germany', 'Spain', 'USA', 'Grand total'])
  const q2Revenue = table(page).locator('thead tr').nth(1).locator('th').nth(2)
  await q2Revenue.locator('button').click()
  expect(await labels()).toEqual(['USA', 'Germany', 'France', 'Canada', 'Spain', 'Grand total'])
  await expect(q2Revenue).toHaveAttribute('aria-sort', 'descending')
  await q2Revenue.locator('button').click()
  expect(await labels()).toEqual(['Spain', 'Canada', 'France', 'Germany', 'USA', 'Grand total'])
  await q2Revenue.locator('button').click()
  expect(await labels()).toEqual(['Canada', 'France', 'Germany', 'Spain', 'USA', 'Grand total'])
})

test('format, heatmap and cell-click with the records behind the cell; toCSV exports what is shown', async ({ page, renderScenario }) => {
  await renderScenario(
    `<c2-pivot-table rows="country" columns="quarter" heatmap totals="rows" values='[{"field":"revenue","format":{"style":"currency","currency":"EUR","maximumFractionDigits":0}}]' data='${json(SALES)}'></c2-pivot-table>`,
  )
  expect((await grid(table(page)))[4]).toEqual(['USA', '€1,200', '€1,300'])
  const heat = (row: number, column: number) =>
    table(page)
      .locator(`[data-cell="${row}:${column}"]`)
      .evaluate((cell) => (cell as HTMLElement).style.getPropertyValue('--_heat'))
  expect(await heat(4, 2)).toBe('100.0%')
  expect(await heat(3, 2)).toBe('0.0%')
  await expect(table(page).locator('[data-cell="4:2"]')).toHaveClass(/hot/)
  await watch(table(page), 'cell-click')
  await table(page).locator('[data-cell="1:2"]').click()
  const [detail] = await events(table(page))
  expect(detail).toMatchObject({ rowPath: ['France'], columnPath: ['Q2'], field: 'revenue', value: 380 })
  expect(detail.records).toEqual([SALES[3]])
  expect(await table(page).evaluate((element) => (element as HTMLElement & { toCSV(): string }).toCSV())).toBe(
    [
      'quarter,Q1,Q2'.replace('quarter', ''),
      'Canada,,€250',
      'France,€300,€380',
      'Germany,€400,€450',
      'Spain,,€200',
      'USA,"€1,200","€1,300"',
      'Grand total,"€1,900","€2,580"',
    ].join('\n'),
  )
})

test('configurable: a field moves by drag and drop or from its menu, an aggregate changes, and each change is announced', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-pivot-table configurable rows="region" values='[{"field":"revenue"}]' data='${json(SALES)}'></c2-pivot-table>`)
  await watch(table(page), 'pivot-change')
  const zone = (name: number) => table(page).locator('.zone').nth(name)
  await expect(zone(0).locator('.chip-label')).toHaveText(['country', 'quarter', 'orders'])
  // Drag "quarter" onto Columns.
  await zone(0).locator('[data-field="quarter"]').dragTo(zone(2).locator('.chips'))
  await expect(zone(2).locator('.chip-label')).toHaveText(['quarter'])
  await expect(table(page).locator('thead th')).toHaveText(['region', 'Q1', 'Q2', 'Total'])
  expect((await events(table(page))).at(-1)).toEqual({ rows: ['region'], columns: ['quarter'], values: [{ field: 'revenue' }] })
  await expect(table(page).locator('[role="status"]')).toHaveText('Rows: region. Columns: quarter. Values: Sum of revenue.')

  // From the menu: country to rows, then revenue's aggregate to Average.
  await zone(0).locator('[data-field="country"] .chip-menu').click()
  await zone(0).locator('[data-field="country"] c2-menu-item', { hasText: 'Move to rows' }).click()
  await expect(zone(1).locator('.chip-label')).toHaveText(['region', 'country'])
  await zone(3).locator('[data-field="revenue"] .chip-menu').click()
  await zone(3).locator('[data-field="revenue"] c2-menu-item', { hasText: 'Average' }).click()
  await expect(zone(3).locator('.chip-aggregate')).toHaveText('Average')
  expect((await events(table(page))).at(-1).values).toEqual([{ field: 'revenue', aggregate: 'avg' }])
  await accessible(page)
})

test('its text follows the language', async ({ page, renderScenario }) => {
  await renderScenario(
    `<div lang="fr"><c2-pivot-table rows="country" values='[{"field":"revenue"}]' data='${json(SALES)}'></c2-pivot-table><c2-pivot-table id="empty"></c2-pivot-table></div>`,
  )
  await expect(table(page).first().locator('thead th')).toHaveText(['country', 'Somme de revenue'])
  await expect(body(table(page).first()).last().locator('th')).toHaveText('Total général')
  await expect(page.locator('#empty')).toHaveHostAria('aria-label', 'Tableau croisé')
  await expect(page.locator('#empty .empty-state')).toHaveText('Aucune donnée')
})

test('regressions: Enter sorts from a header button, a value chip reorders, two measures on one field keep their own aggregate, CSV has no blank first line', async ({
  page,
  renderScenario,
}) => {
  await renderScenario(
    `<c2-pivot-table configurable rows="country" values='[{"field":"revenue","aggregate":"sum"},{"field":"revenue","aggregate":"avg"},{"field":"orders"}]' data='${json(SALES)}'></c2-pivot-table>`,
  )
  await watch(table(page), 'cell-click')
  const header = table(page).locator('thead th').nth(1)
  await header.locator('button').focus()
  await page.keyboard.press('Enter')
  await expect(header).toHaveAttribute('aria-sort', 'descending')
  expect(await events(table(page))).toEqual([])
  const zone = table(page).locator('.zone').nth(3)
  // The second revenue chip keeps its own aggregate.
  await expect(zone.locator('.chip-aggregate')).toHaveText(['Sum', 'Average', 'Sum'])
  await zone.locator('.chip').nth(1).locator('.chip-menu').click()
  await zone.locator('.chip').nth(1).locator('c2-menu-item', { hasText: 'Max' }).click()
  await expect(zone.locator('.chip-aggregate')).toHaveText(['Sum', 'Max', 'Sum'])
  // Drag orders onto the first revenue: it moves first.
  await zone.locator('[data-field="orders"]').dragTo(zone.locator('[data-field="revenue"]').first())
  await expect(zone.locator('.chip-label')).toHaveText(['orders', 'revenue', 'revenue'])
  const csv = await table(page).evaluate((element) => (element as HTMLElement & { toCSV(): string }).toCSV())
  expect(csv.split('\n')[0]).toBe(',Sum of orders,Sum of revenue,Max of revenue')
})

const LEDGER = [
  { section: 'Revenue', account: 'Product', actual: 900, budget: 800 },
  { section: 'Revenue', account: 'Services', actual: 300, budget: 400 },
  { section: 'Expenses', account: 'Payroll', actual: 500, budget: 450 },
  { section: 'Expenses', account: 'Rent', actual: 100, budget: 100 },
]
const STATEMENT_VALUES = [
  { field: 'actual', label: 'Actual' },
  { field: 'budget', label: 'Budget' },
  { field: 'variance', compute: 'difference', of: ['actual', 'budget'] },
  { field: 'change', compute: 'percent-difference', of: ['actual', 'budget'] },
]

test('pivot(): computed values read two values of the same cell, subtotals included; invertSigns subtracts a group in the totals', async ({
  page,
  renderScenario,
}) => {
  await renderScenario(`<c2-pivot-table></c2-pivot-table>`)
  const out = await page.evaluate((data) => {
    type Result = { cell(r: string[], c: string[], v: number): number | null }
    const { pivot } = (window as unknown as { pivotApi: { pivot: (data: unknown[], config: object) => Result } }).pivotApi
    const result = pivot([...data, { section: 'Other', account: 'Zero', actual: 5, budget: 0 }], {
      rows: ['section', 'account'],
      columns: [],
      invertSigns: { section: ['Expenses'] },
      values: [
        { field: 'actual' },
        { field: 'budget' },
        { field: 'variance', compute: 'difference', of: ['actual', 'budget'] },
        { field: 'change', compute: 'percent-difference', of: ['actual', 'budget'] },
        { field: 'ratio', compute: 'ratio', of: ['actual', 'budget'] },
        { field: 'broken', compute: 'difference', of: ['actual', 'missing'] },
        { field: 'actual', aggregate: 'count' },
      ],
    })
    const row = (path: string[]) => [0, 1, 2, 3, 4, 5, 6].map((index) => result.cell(path, [], index))
    return { payroll: row(['Expenses', 'Payroll']), revenue: row(['Revenue']), expenses: row(['Expenses']), zero: row(['Other', 'Zero']), total: row([]) }
  }, LEDGER)
  // Expenses count negative: an overspend is a negative variance, and the totals subtract them.
  expect(out.payroll).toEqual([-500, -450, -50, -50 / 450, 500 / 450, null, 1])
  expect(out.revenue).toEqual([1200, 1200, 0, 0, 1, null, 2])
  expect(out.expenses).toEqual([-600, -550, -50, -50 / 550, 600 / 550, null, 2])
  expect(out.zero).toEqual([5, 0, 5, null, null, null, 1])
  expect(out.total).toEqual([605, 650, -45, -45 / 650, 605 / 650, null, 5])
})

test('a financial statement: computed variance columns with labels, percent format and sign classes; the keyboard reaches them', async ({
  page,
  renderScenario,
}) => {
  await renderScenario(
    `<c2-pivot-table rows="section;account" invert-signs='{"section":["Expenses"]}' values='${json(STATEMENT_VALUES)}' data='${json(LEDGER)}'></c2-pivot-table>`,
  )
  await expect(table(page).locator('thead th')).toHaveText([
    'section / account',
    'Actual',
    'Budget',
    'Difference: actual vs budget',
    '% difference: actual vs budget',
  ])
  expect(await grid(table(page))).toEqual([
    ['Expenses', '', '', '', ''],
    ['Payroll', '-500', '-450', '-50', '-11.1%'],
    ['Rent', '-100', '-100', '0', '0%'],
    ['Expenses total', '-600', '-550', '-50', '-9.1%'],
    ['Revenue', '', '', '', ''],
    ['Product', '900', '800', '100', '12.5%'],
    ['Services', '300', '400', '-100', '-25%'],
    ['Revenue total', '1,200', '1,200', '0', '0%'],
    ['Grand total', '600', '650', '-50', '-7.7%'],
  ])
  await expect(table(page).locator('[data-cell="1:3"]')).toHaveClass(/negative/)
  await expect(table(page).locator('[data-cell="5:3"]')).toHaveClass(/positive/)
  await expect(table(page).locator('[data-cell="2:3"]')).not.toHaveClass(/negative|positive/)
  // Aggregated cells never get a sign class, even when negative.
  await expect(table(page).locator('[data-cell="1:1"]')).not.toHaveClass(/negative|positive/)
  // The colours are variables, inherited by default.
  await table(page).evaluate((element) => (element as HTMLElement).style.setProperty('--c2-pivot-table__computed__negative--color', 'rgb(185, 28, 28)'))
  await expect(table(page).locator('[data-cell="1:3"]')).toHaveCSS('color', 'rgb(185, 28, 28)')

  await watch(table(page), 'cell-click')
  await table(page).locator('[data-cell="1:0"]').click()
  await page.keyboard.press('End')
  await page.keyboard.press('ArrowLeft')
  await expect(table(page).locator('[data-cell="1:3"]')).toBeFocused()
  await page.keyboard.press('Enter')
  const [detail] = await events(table(page))
  expect(detail).toMatchObject({ rowPath: ['Expenses', 'Payroll'], field: 'variance', value: -50 })
  expect(detail.records).toEqual([LEDGER[2]])
  expect((await table(page).evaluate((element) => (element as HTMLElement & { config: object }).config)) as object).toMatchObject({
    invertSigns: { section: ['Expenses'] },
  })

  // Clearing invert-signs counts every row as stored.
  await props(table(page), { invertSigns: {} })
  expect((await grid(table(page))).at(-1)).toEqual(['Grand total', '1,800', '1,750', '50', '2.9%'])
  await accessible(page)
})

test('configurable: a computed value chip shows its computation and offers only Remove', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-pivot-table configurable rows="section" values='${json(STATEMENT_VALUES)}' data='${json(LEDGER)}'></c2-pivot-table>`)
  const zone = table(page).locator('.zone').nth(3)
  await expect(zone.locator('.chip-aggregate')).toHaveText(['Sum', 'Sum', 'Difference', '% difference'])
  await zone.locator('[data-field="variance"] .chip-menu').click()
  await expect(zone.locator('[data-field="variance"] c2-menu-item')).toHaveCount(1)
  await zone.locator('[data-field="variance"] c2-menu-item', { hasText: 'Remove' }).click()
  await expect(zone.locator('.chip-label')).toHaveText(['actual', 'budget', 'change'])
  // It is not a field of the data, so it does not come back to the unused fields.
  await expect(table(page).locator('.zone').first().locator('.chip-label')).toHaveText(['account'])
})
