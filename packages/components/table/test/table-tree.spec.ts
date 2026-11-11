import type { Page } from '@playwright/test'
import { test, expect, props, accessible } from '../../../../tests/component-fixture'

const ACCOUNTS = [
  {
    id: 'assets',
    name: 'Assets',
    amount: 1,
    children: [
      { id: 'cash', name: 'Cash', amount: 1200 },
      { id: 'receivables', name: 'Receivables', amount: 800 },
      {
        id: 'inventory',
        name: 'Inventory',
        children: [
          { id: 'raw', name: 'Raw materials', amount: 300 },
          { id: 'finished', name: 'Finished goods', amount: 500 },
        ],
      },
    ],
  },
  { id: 'liabilities', name: 'Liabilities', children: [{ id: 'payables', name: 'Payables', amount: 400 }] },
  { id: 'equity', name: 'Equity', amount: 1000 },
  { id: 'revenue', name: 'Revenue', amount: 0, children: true },
]

const json = JSON.stringify(ACCOUNTS)

const COLUMNS = `<c2-table-column field="name" header="Account" width="260px" summary-label="Total"></c2-table-column>
  <c2-table-column field="amount" header="Amount" width="160px" align="end" format="number" rollup="sum" summary="sum"></c2-table-column>`

const accounts = (attributes = '') =>
  `<c2-table style="height:420px;width:480px" row-key="id" children-field="children" rows='${json}' ${attributes}>
  ${COLUMNS}
</c2-table>`

const table = (page: Page) => page.locator('c2-table')
const row = (page: Page, name: string) => table(page).getByRole('row', { name: new RegExp(`\\b${name}\\b`) })

/** Every rendered body row, top to bottom, as `level name | amount`. */
const lines = (page: Page) =>
  table(page).evaluate((element) =>
    [...element.shadowRoot!.querySelectorAll<HTMLElement>('.row--body')].map(
      (entry) => `${entry.getAttribute('aria-level')} ${[...entry.querySelectorAll('[role="gridcell"]')].map((cell) => cell.textContent!.trim()).join(' | ')}`,
    ),
  )

test('children-field turns the rows into a treegrid: closed parents with chevrons, rolled-up values, leaves in the totals', async ({
  page,
  renderScenario,
}) => {
  await renderScenario(accounts())
  await expect(table(page).getByRole('treegrid')).toBeVisible()
  // A parent shows the sum of the leaves under it, not its own amount (Assets holds 1).
  expect(await lines(page)).toEqual(['1 Assets | 2,800', '1 Liabilities | 400', '1 Equity | 1,000', '1 Revenue | 0'])
  await expect(row(page, 'Assets')).toHaveAttribute('aria-expanded', 'false')
  await expect(row(page, 'Revenue')).toHaveAttribute('aria-expanded', 'false')
  await expect(row(page, 'Equity')).not.toHaveAttribute('aria-expanded')
  await expect(table(page).locator('[part="row-toggle"]')).toHaveCount(4)
  // The summary row adds the leaves only — every amount counted once.
  await expect(table(page).locator('[part="summary-row"]')).toHaveText(/Total\s*4,200/)
  await expect(table(page).getByRole('treegrid')).toHaveAttribute('aria-rowcount', '6')
  await accessible(page)
})

test('the chevron opens a row and reports it; expanded-rows is the state, in and out', async ({ page, renderScenario }) => {
  await renderScenario(`<div id="outer">${accounts()}</div>`)
  await page.evaluate(() => {
    const log: unknown[] = []
    ;(window as unknown as { log: unknown[] }).log = log
    document.querySelector('c2-table')!.addEventListener('row-toggle', (event) => {
      const { key, expanded, row } = (event as CustomEvent).detail
      log.push({ key, expanded, name: row.name })
    })
    document.querySelector('#outer')!.addEventListener('row-toggle', () => log.push('bubbled'))
  })
  await row(page, 'Assets').locator('[part~="row-toggle"]').click()
  await expect(row(page, 'Assets')).toHaveAttribute('aria-expanded', 'true')
  expect(await lines(page)).toEqual([
    '1 Assets | 2,800',
    '2 Cash | 1,200',
    '2 Receivables | 800',
    '2 Inventory | 800',
    '1 Liabilities | 400',
    '1 Equity | 1,000',
    '1 Revenue | 0',
  ])
  expect(await page.evaluate(() => (window as unknown as { log: unknown[] }).log)).toEqual([{ key: 'assets', expanded: true, name: 'Assets' }])
  // The chevron is not a row click: nothing got selected or activated.
  expect(await table(page).evaluate((element) => (element as HTMLElement & { expandedRows: string[] }).expandedRows)).toEqual(['assets'])

  // Each level indents by the group indent, the leaf keeping the chevron's room so labels line up.
  const left = (name: string) =>
    row(page, name)
      .locator('[part~="cell-content"]')
      .first()
      .evaluate((element) => Math.round(element.getBoundingClientRect().left))
  expect((await left('Cash')) - (await left('Assets'))).toBe(24)
  expect(await left('Equity')).toBe(await left('Assets'))

  await table(page).evaluate((element) => element.setAttribute('expanded-rows', 'assets;inventory'))
  await expect(row(page, 'Finished goods')).toHaveAttribute('aria-level', '3')
  await accessible(page)
})

test('tree-expanded opens every row; expandAll and collapseAll; sorting orders each level by its rolled-up values', async ({ page, renderScenario }) => {
  await renderScenario(accounts('tree-expanded sortable'))
  expect((await lines(page)).length).toBe(10)
  await table(page).evaluate((element) => (element as HTMLElement & { collapseAll(): void }).collapseAll())
  expect((await lines(page)).length).toBe(4)
  await table(page).evaluate((element) => (element as HTMLElement & { expandAll(): void }).expandAll())
  // Revenue's children are not loaded, so expandAll leaves it closed rather than starting a load.
  await expect(row(page, 'Revenue')).toHaveAttribute('aria-expanded', 'false')

  await props(table(page), { sortModel: [{ field: 'amount', direction: 'desc' }] })
  expect(await lines(page)).toEqual([
    '1 Assets | 2,800',
    '2 Cash | 1,200',
    // A tie keeps the authored order.
    '2 Receivables | 800',
    '2 Inventory | 800',
    '3 Finished goods | 500',
    '3 Raw materials | 300',
    '1 Equity | 1,000',
    '1 Liabilities | 400',
    '2 Payables | 400',
    '1 Revenue | 0',
  ])
})

test('the keyboard opens, closes and climbs the tree on its column', async ({ page, renderScenario }) => {
  await renderScenario(accounts())
  await row(page, 'Assets').getByRole('gridcell').first().click()
  await page.keyboard.press('ArrowRight')
  await expect(row(page, 'Assets')).toHaveAttribute('aria-expanded', 'true')
  await page.keyboard.press('ArrowDown')
  await expect(row(page, 'Cash').getByRole('gridcell').first()).toBeFocused()
  // ← on a leaf climbs to its parent; ← again closes it.
  await page.keyboard.press('ArrowLeft')
  await expect(row(page, 'Assets').getByRole('gridcell').first()).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await expect(row(page, 'Assets')).toHaveAttribute('aria-expanded', 'false')
  // → on an open row, and on a leaf, moves to the next cell.
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowRight')
  await expect(row(page, 'Equity').getByRole('gridcell').nth(1)).toBeFocused()
})

test('selecting a parent selects the rows under it, and a parent follows its children', async ({ page, renderScenario }) => {
  await renderScenario(accounts('selection="multiple" checkbox-selection tree-expanded'))
  const checkbox = (name: string) => row(page, name).locator('c2-checkbox')
  const value = () => table(page).evaluate((element) => [...(element as HTMLElement & { value: string[] }).value].sort())

  await checkbox('Inventory').click()
  expect(await value()).toEqual(['finished', 'inventory', 'raw'])
  await expect(checkbox('Assets')).toHaveJSProperty('indeterminate', true)

  await checkbox('Cash').click()
  await checkbox('Receivables').click()
  // Every child of Assets is selected, so Assets is too.
  expect(await value()).toEqual(['assets', 'cash', 'finished', 'inventory', 'raw', 'receivables'])
  await expect(checkbox('Assets')).toHaveJSProperty('checked', true)
  await expect(checkbox('Assets')).toHaveJSProperty('indeterminate', false)

  // Clearing one leaf clears its ancestors, and only them.
  await checkbox('Raw materials').click()
  expect(await value()).toEqual(['cash', 'finished', 'receivables'])
  await expect(checkbox('Inventory')).toHaveJSProperty('indeterminate', true)

  await checkbox('Assets').click()
  expect(await value()).toEqual(['assets', 'cash', 'finished', 'inventory', 'raw', 'receivables'])
})

test('a row whose children field is true loads them from loadChildren on first open; a rejection closes it and reports', async ({ page, renderScenario }) => {
  await renderScenario(accounts('selection="multiple" checkbox-selection'))
  await page.evaluate(() => {
    const state = window as unknown as { calls: unknown[]; settle: (rows?: unknown[]) => void; errors: unknown[] }
    state.calls = []
    state.errors = []
    const element = document.querySelector('c2-table') as HTMLElement & { loadChildren: unknown }
    element.addEventListener('children-error', (event) => state.errors.push((event as CustomEvent).detail.key))
    element.loadChildren = ({ key, level }: { key: string; level: number }) =>
      new Promise((resolve, reject) => {
        state.calls.push({ key, level })
        state.settle = (rows) => (rows ? resolve(rows) : reject(new Error('offline')))
      })
  })
  const revenue = row(page, 'Revenue')
  await revenue.locator('c2-checkbox').click()

  await revenue.locator('[part~="row-toggle"]').click()
  await expect(revenue).toHaveAttribute('aria-busy', 'true')
  await expect(revenue.locator('c2-spinner')).toHaveCount(1)
  await page.evaluate(() => (window as unknown as { settle: () => void }).settle())
  await expect(revenue).toHaveAttribute('aria-expanded', 'false')
  await expect(revenue).not.toHaveAttribute('aria-busy')
  expect(await page.evaluate(() => (window as unknown as { errors: unknown[] }).errors)).toEqual(['revenue'])

  // The next open asks again.
  await revenue.locator('[part~="row-toggle"]').click()
  await page.evaluate(() =>
    (window as unknown as { settle: (rows: unknown[]) => void }).settle([
      { id: 'sales', name: 'Sales', amount: 900 },
      { id: 'services', name: 'Services', amount: 600 },
    ]),
  )
  await expect(row(page, 'Sales')).toHaveAttribute('aria-level', '2')
  expect(await page.evaluate(() => (window as unknown as { calls: unknown[] }).calls)).toEqual([
    { key: 'revenue', level: 0 },
    { key: 'revenue', level: 0 },
  ])
  // The parent was selected, so its new children are too, and the rollup and totals take them in.
  await expect(row(page, 'Sales').locator('c2-checkbox')).toHaveJSProperty('checked', true)
  await expect(revenue).toContainText('1,500')
  await expect(table(page).locator('[part="summary-row"]')).toHaveText(/Total\s*5,700/)
})

test('without children-field a nested array is just a value, and the grid stays a grid', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-table style="height:300px" row-key="id" rows='${json}'>${COLUMNS}</c2-table>`)
  await expect(table(page).getByRole('grid')).toBeVisible()
  await expect(table(page).locator('[part="row-toggle"]')).toHaveCount(0)
  expect(await table(page).evaluate((element) => element.shadowRoot!.querySelectorAll('.row--body:not([aria-level])').length)).toBe(4)
})

test('a shift-click range selects the rows in it with the rows under them, and settles their parents', async ({ page, renderScenario }) => {
  await renderScenario(accounts('selection="multiple" tree-expanded'))
  const value = () => table(page).evaluate((element) => [...(element as HTMLElement & { value: string[] }).value].sort())
  await row(page, 'Receivables').getByRole('gridcell').first().click()
  await row(page, 'Inventory')
    .getByRole('gridcell')
    .first()
    .click({ modifiers: ['Shift'] })
  expect(await value()).toEqual(['finished', 'inventory', 'raw', 'receivables'])
  await row(page, 'Cash')
    .getByRole('gridcell')
    .first()
    .click({ modifiers: ['Shift'] })
  // The anchor is Receivables: Cash..Receivables plus nothing else, so Assets is not complete yet.
  expect(await value()).toEqual(['cash', 'receivables'])
  // From Cash to Finished goods covers every child of Assets, so Assets is settled as selected once, at the end.
  await row(page, 'Cash').getByRole('gridcell').first().click()
  await row(page, 'Finished goods')
    .getByRole('gridcell')
    .first()
    .click({ modifiers: ['Shift'] })
  expect(await value()).toEqual(['assets', 'cash', 'finished', 'inventory', 'raw', 'receivables'])
})

test('expandedRows takes numeric keys from script, and auto columns leave the children field out', async ({ page, renderScenario }) => {
  const rows = JSON.stringify([
    { id: 1, name: 'One', children: [{ id: 11, name: 'One-one' }] },
    { id: 2, name: 'Two' },
  ])
  await renderScenario(`<c2-table style="height:300px" row-key="id" children-field="children" rows='${rows}'></c2-table>`)
  await expect(table(page).getByRole('columnheader')).toHaveText(['Id', 'Name'])
  await props(table(page), { expandedRows: [1] })
  await expect(row(page, 'One-one')).toHaveAttribute('aria-level', '2')
})

test('children that arrive under a selected parent are selected too, and selection-change says so', async ({ page, renderScenario }) => {
  await renderScenario(accounts('selection="multiple" checkbox-selection'))
  await page.evaluate(() => {
    const state = window as unknown as { changes: string[][] }
    state.changes = []
    const element = document.querySelector('c2-table') as HTMLElement & { loadChildren: unknown }
    element.addEventListener('selection-change', (event) => state.changes.push([...(event as CustomEvent).detail.value].sort()))
    element.loadChildren = () => Promise.resolve([{ id: 'sales', name: 'Sales', amount: 900 }])
  })
  await row(page, 'Revenue').locator('c2-checkbox').click()
  await row(page, 'Revenue').locator('[part~="row-toggle"]').click()
  await expect(row(page, 'Sales').locator('c2-checkbox')).toHaveJSProperty('checked', true)
  expect(await page.evaluate(() => (window as unknown as { changes: string[][] }).changes)).toEqual([['revenue'], ['revenue', 'sales']])
})
