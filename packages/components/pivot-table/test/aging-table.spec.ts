import { test, expect, accessible, props, watch } from '../../../../tests/component-fixture'
import type { Locator, Page } from '@playwright/test'

// Aged to 2026-11-15: days past due are 15 Nov minus the due date.
const ITEMS = [
  { id: 1, customer: 'Acme', region: 'Europe', dueDate: '2026-11-30', amount: 400 }, // not yet due
  { id: 2, customer: 'Acme', region: 'Europe', dueDate: '2026-11-15', amount: 100 }, // due today: current
  { id: 3, customer: 'Acme', region: 'Europe', dueDate: '2026-11-01', amount: 250 }, // 14 days
  { id: 4, customer: 'Bluebird', region: 'Americas', dueDate: '2026-09-20', amount: 300 }, // 56 days
  { id: 5, customer: 'Bluebird', region: 'Americas', dueDate: '2026-06-01', amount: 80 }, // 167 days
  { id: 6, customer: 'Northwind', region: 'Europe', dueDate: '2026-08-17', amount: 120 }, // 90 days
]
const json = (value: unknown) => JSON.stringify(value).replaceAll("'", '&#39;')
const table = (page: Page) => page.locator('c2-aging-table')
const body = (locator: Locator) => locator.locator('tbody tr')
const grid = (locator: Locator) =>
  locator.locator('tbody tr').evaluateAll((rows) => rows.map((row) => [...row.children].map((cell) => (cell.textContent ?? '').replace(/[▾▸]/g, '').trim())))
const events = async (locator: Locator) => JSON.parse((await locator.getAttribute('data-events')) ?? '[]')

test('buckets each item by days past due against as-of, shows every bucket with totals, tones overdue amounts, and passes axe', async ({
  page,
  renderScenario,
}) => {
  await renderScenario(`<c2-aging-table as-of="2026-11-15" data='${json(ITEMS)}'></c2-aging-table>`)
  await expect(table(page).locator('thead th')).toHaveText(['customer', 'Current', '1–30', '31–60', '61–90', 'Over 90', 'Total'])
  expect(await grid(table(page))).toEqual([
    ['Acme', '500', '250', '—', '—', '—', '750'],
    ['Bluebird', '—', '—', '300', '—', '80', '380'],
    ['Northwind', '—', '—', '—', '120', '—', '120'],
    ['Grand total', '500', '250', '300', '120', '80', '1,250'],
  ])
  await expect(table(page).locator('[part="as-of"]')).toHaveText('As of Nov 15, 2026')
  await expect(table(page)).toHaveHostAria('role', 'region')
  await expect(table(page)).toHaveHostAria('aria-label', 'Aging table')
  // Current is not overdue; amounts past due are, and the last bucket is the oldest. Empty cells and totals carry neither.
  await expect(table(page).locator('[data-cell="0:1"]')).not.toHaveClass(/overdue/)
  await expect(table(page).locator('[data-cell="0:2"]')).toHaveClass(/overdue/)
  await expect(table(page).locator('[data-cell="0:3"]')).not.toHaveClass(/overdue/)
  await expect(table(page).locator('[data-cell="1:5"]')).toHaveClass(/overdue oldest/)
  await expect(table(page).locator('[data-cell="1:6"]')).not.toHaveClass(/overdue/)
  expect(
    await table(page)
      .locator('[data-cell="1:5"]')
      .evaluate((cell) => getComputedStyle(cell).color),
  ).toBe('rgb(185, 28, 28)')
  await accessible(page)
})

test('as-of, buckets and date-field re-bucket the items; an item with no date shows under No date; columns is ignored', async ({ page, renderScenario }) => {
  await renderScenario(
    `<c2-aging-table as-of="2026-11-15" columns="region" data='${json([...ITEMS, { id: 7, customer: 'Acme', amount: 5 }])}'></c2-aging-table>`,
  )
  await expect(table(page).locator('thead th')).toHaveText(['customer', 'Current', '1–30', '31–60', '61–90', 'Over 90', 'No date', 'Total'])
  await props(table(page), { asOf: '2026-12-31' })
  expect((await grid(table(page)))[0]).toEqual(['Acme', '—', '—', '750', '—', '—', '5', '755'])
  await props(table(page), { buckets: [60, 120] })
  await expect(table(page).locator('thead th')).toHaveText(['customer', 'Current', '1–60', '61–120', 'Over 120', 'No date', 'Total'])
  expect((await grid(table(page)))[1]).toEqual(['Bluebird', '—', '—', '300', '80', '—', '380'])
  // Aged from another field, given as timestamps and Date objects.
  await page.evaluate(() => {
    const element = document.querySelector('c2-aging-table') as HTMLElement & Record<string, unknown>
    element.dateField = 'issued.on'
    element.data = [
      { customer: 'Acme', issued: { on: new Date(2026, 11, 31) }, amount: 10 },
      { customer: 'Acme', issued: { on: new Date(2026, 9, 1).getTime() }, amount: 20 },
    ]
  })
  expect(await grid(table(page))).toEqual([
    ['Acme', '10', '—', '20', '—', '30'],
    ['Grand total', '10', '—', '20', '—', '30'],
  ])
  const bucket = await page.evaluate(() => {
    const { agingBucket } = (window as unknown as { pivotApi: { agingBucket: (days: number, bounds: number[]) => string } }).pivotApi
    return [0, -3, 1, 30, 31, 90, 91].map((days) => agingBucket(days, [30, 60, 90]))
  })
  expect(bucket).toEqual(['0', '0', '1-30', '1-30', '31-60', '61-90', '91+'])
})

test('keyboard: arrows walk the cells, Enter gives the bucket key and the original records; a bucket header sorts; groups nest', async ({
  page,
  renderScenario,
}) => {
  await renderScenario(`<c2-aging-table as-of="2026-11-15" rows="region;customer" expand-depth="0" data='${json(ITEMS)}'></c2-aging-table>`)
  await expect(table(page).locator('thead th').first()).toHaveText('region / customer')
  expect((await grid(table(page))).map((row) => row[0])).toEqual(['Americas', 'Europe', 'Grand total'])
  await watch(table(page), 'cell-click')
  await body(table(page)).nth(1).locator('th').click()
  await page.keyboard.press('ArrowLeft')
  await expect(body(table(page))).toHaveCount(3)
  await page.keyboard.press('ArrowRight')
  expect((await grid(table(page))).map((row) => row[0])).toEqual(['Americas', 'Europe', 'Acme', 'Northwind', 'Europe total', 'Grand total'])
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect(table(page).locator('[data-cell="2:2"]')).toBeFocused()
  await page.keyboard.press('Enter')
  const [detail] = await events(table(page))
  expect(detail).toMatchObject({ rowPath: ['Europe', 'Acme'], columnPath: ['1-30'], field: 'amount', value: 250 })
  expect(detail.records).toEqual([ITEMS[2]])

  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowLeft')
  await expect(body(table(page))).toHaveCount(6)
  // Largest Current amount first: Europe, then Americas, which has none.
  await table(page).locator('thead th', { hasText: 'Current' }).locator('button').click()
  expect((await grid(table(page))).map((row) => row[0])).toEqual(['Europe', 'Acme', 'Northwind', 'Europe total', 'Americas', 'Grand total'])
  await expect(table(page).locator('thead th', { hasText: 'Current' })).toHaveAttribute('aria-sort', 'descending')
  expect(await table(page).evaluate((element) => (element as HTMLElement & { toCSV(): string }).toCSV().split('\n')[0])).toBe(
    ',Current,1–30,31–60,61–90,Over 90,Total',
  )
  await accessible(page)
})

test('the as-of slot replaces the line; its text and bucket names follow the language', async ({ page, renderScenario }) => {
  await renderScenario(
    `<div lang="fr"><c2-aging-table as-of="2026-11-15" data='${json(ITEMS)}'></c2-aging-table></div><c2-aging-table id="slotted" as-of="2026-11-15"><span slot="as-of">Open items</span></c2-aging-table>`,
  )
  const french = table(page).first()
  await expect(french.locator('thead th')).toHaveText(['customer', 'Non échu', '1 à 30 j', '31 à 60 j', '61 à 90 j', 'Plus de 90 j', 'Total'])
  await expect(french.locator('[part="as-of"]')).toHaveText('Au 15 nov. 2026')
  await expect(french).toHaveHostAria('aria-label', 'Balance âgée')
  expect(
    await page
      .locator('#slotted')
      .evaluate((host) => (host.shadowRoot!.querySelector('slot[name="as-of"]') as HTMLSlotElement).assignedNodes().map((node) => node.textContent)),
  ).toEqual(['Open items'])
  await expect(page.locator('#slotted .empty-state')).toHaveText('No data')
})

test('pivot(): members show under every group even when no record has them, in label order', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-pivot-table></c2-pivot-table>`)
  const out = await page.evaluate(() => {
    type Node = { label: string; children: Node[] }
    type Result = { cell(r: string[], c: string[], v: number): number | null; columns: Node; rows: Node }
    const { pivot } = (window as unknown as { pivotApi: { pivot: (data: unknown[], config: object) => Result } }).pivotApi
    const result = pivot(
      [
        { team: 'A', quarter: 'Q2', size: 1 },
        { team: 'B', quarter: 'Q4', size: 2 },
      ],
      {
        rows: ['team'],
        columns: ['year', 'quarter'],
        values: [{ field: 'size' }],
        members: { quarter: ['Q1', 'Q2', 'Q3', 'Q4', 'Q1'], team: ['C'], year: ['2025'] },
      },
    )
    const tree = (node: Node): unknown => (node.children.length ? [node.label, node.children.map(tree)] : node.label)
    return { columns: tree(result.columns), rows: tree(result.rows), empty: result.cell(['C'], [], 0), q3: result.cell([], ['(blank)', 'Q3'], 0) }
  })
  // A repeated member shows once; members of a level above the last are ignored.
  expect(out).toEqual({ columns: ['', [['(blank)', ['Q1', 'Q2', 'Q3', 'Q4']]]], rows: ['', ['A', 'B', 'C']], empty: null, q3: null })
})

test('configurable: the buckets stay on the columns; an impossible date is no date', async ({ page, renderScenario }) => {
  await renderScenario(
    `<c2-aging-table configurable as-of="2026-11-15" data='${json([...ITEMS, { id: 8, customer: 'Acme', dueDate: '2026-02-30', amount: 7 }])}'></c2-aging-table>`,
  )
  await watch(table(page), 'pivot-change')
  const zone = (index: number) => table(page).locator('.zone').nth(index)
  await expect(zone(2).locator('.chip-label')).toHaveText(['Age'])
  // The bucket chip offers no command, and no chip offers the columns.
  await expect(zone(2).locator('c2-menu-item')).toHaveCount(0)
  await expect(zone(1).locator('[data-field="customer"] c2-menu-item')).toHaveText([/^Move to values/, /^Remove/])
  await zone(0).locator('[data-field="region"]').dragTo(zone(2).locator('.chips'))
  await expect(zone(2).locator('.chip-label')).toHaveText(['Age'])
  expect(await events(table(page))).toEqual([])
  await zone(0).locator('[data-field="region"]').dragTo(zone(1).locator('.chips'))
  await expect(zone(1).locator('.chip-label')).toHaveText(['customer', 'region'])
  expect((await events(table(page))).at(-1)).toMatchObject({ rows: ['customer', 'region'], columns: ['agingBucket'] })
  await expect(table(page).locator('thead th').nth(-2)).toHaveText('No date')
  await accessible(page)
})
