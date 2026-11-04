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
