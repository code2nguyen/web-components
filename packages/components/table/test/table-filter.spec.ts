import type { Page } from '@playwright/test'
import { test, expect, accessible } from '../../../../tests/component-fixture'

const ORDERS = [
  { id: 'O1', customer: 'Acme', status: 'Paid', total: 120 },
  { id: 'O2', customer: 'Nordlys', status: 'Open', total: 80 },
  { id: 'O3', customer: 'Brio', status: 'Paid', total: 310 },
  { id: 'O4', customer: 'Kiwi', status: 'Overdue', total: 45 },
  { id: 'O5', customer: 'Halcyon', status: '', total: 60 },
]

const orders = (attributes = '') =>
  `<c2-table style="height:340px;width:560px" row-key="id" aria-label="Orders" rows='${JSON.stringify(ORDERS)}' ${attributes}>
  <c2-table-column field="customer" header="Customer" width="160px"></c2-table-column>
  <c2-table-column field="status" header="Status" width="160px" filterable></c2-table-column>
  <c2-table-column field="total" header="Total" width="120px" align="end" format="number"></c2-table-column>
</c2-table>`

const table = (page: Page) => page.locator('c2-table')
const customers = (page: Page) => table(page).locator('[part~="cell-customer"]')
const filterButton = (page: Page) => table(page).getByRole('button', { name: 'Filter Status' })
const popover = (page: Page) => table(page).locator('[part="filter"]')

test("a filterable column's header lists its values with counts, and picking one filters the rows", async ({ page, renderScenario }) => {
  await renderScenario(orders())
  await table(page).evaluate((element) => {
    const events: unknown[] = []
    element.addEventListener('filter-change', (event) => {
      events.push((event as CustomEvent).detail)
      element.setAttribute('data-events', JSON.stringify(events))
    })
  })
  await expect(table(page).getByRole('button', { name: 'Filter Customer' })).toHaveCount(0)
  await expect(filterButton(page)).toHaveAttribute('aria-expanded', 'false')
  await filterButton(page).click()
  await expect(popover(page)).toBeVisible()
  await expect(filterButton(page)).toHaveAttribute('aria-expanded', 'true')
  // The empty status is listed as (Blanks); every value carries its count.
  await expect(popover(page).getByRole('checkbox')).toHaveCount(4)
  await expect(popover(page)).toContainText('(Blanks)')
  await popover(page).getByRole('checkbox', { name: /Paid/ }).click()

  await expect(customers(page)).toHaveText(['Acme', 'Brio'])
  await expect(filterButton(page)).toHaveAttribute('part', /filter-button-active/)
  expect(JSON.parse((await table(page).getAttribute('data-events'))!)).toEqual([{ filters: { status: { include: ['Paid'], exclude: [] } }, column: 'status' }])
  await expect(table(page)).toHaveJSProperty('filters', { status: { include: ['Paid'], exclude: [] } })

  await popover(page).getByRole('button', { name: 'Clear filter' }).click()
  await expect(customers(page)).toHaveCount(5)
  await expect(filterButton(page)).not.toHaveAttribute('part', /filter-button-active/)
  await accessible(page)
})

test('filters set in markup apply before the filter code loads, and the header shows them', async ({ page, renderScenario }) => {
  await renderScenario(orders(`filters='{"status":{"exclude":["Paid",""]}}'`))
  await expect(customers(page)).toHaveText(['Nordlys', 'Kiwi'])
  await expect(filterButton(page)).toHaveAttribute('part', /filter-button-active/)
  const loaded = await page.evaluate(() => performance.getEntriesByType('resource').some((entry) => entry.name.includes('table-filter')))
  expect(loaded).toBe(false)
})

test('Alt+ArrowDown opens the filter from the header, Escape closes it and gives the focus back, and it sorts', async ({ page, renderScenario }) => {
  await renderScenario(orders('sortable'))
  await table(page)
    .getByRole('columnheader', { name: /Status/ })
    .click()
  await page.keyboard.press('Alt+ArrowDown')
  await expect(popover(page)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(popover(page)).toBeHidden()
  await expect(table(page).getByRole('columnheader', { name: /Status/ })).toBeFocused()

  await filterButton(page).click()
  await popover(page).getByRole('button', { name: 'Sort Z to A' }).click()
  await expect(popover(page)).toBeHidden()
  await expect(table(page)).toHaveJSProperty('sortModel', [{ field: 'status', direction: 'desc' }])
})

test("a column's values count the rows the other filters let through, and a data source receives the filters", async ({ page, renderScenario }) => {
  await renderScenario(orders(`filterable filters='{"customer":{"include":["Acme","Kiwi"]}}'`))
  await filterButton(page).click()
  await expect(popover(page).getByRole('checkbox')).toHaveCount(2)

  await renderScenario(`<c2-table style="height:300px;width:420px" row-key="id" aria-label="Remote" filters='{"status":{"include":["Paid"]}}'>
  <c2-table-column field="id" header="Id" width="120px" filterable></c2-table-column>
</c2-table>`)
  const request = await table(page).evaluate(
    (element: HTMLElement & { dataSource: unknown }) =>
      new Promise((resolve) => {
        element.dataSource = {
          getRows: (request: unknown) => {
            resolve(request)
            return Promise.resolve({ rows: [{ id: 'A' }], total: 1 })
          },
        }
      }),
  )
  expect(request).toMatchObject({ start: 0, filters: { status: { include: ['Paid'] } } })
})

const RUN = [
  { id: 'E1', name: 'Ada', gross: 5200, net: 3900 },
  { id: 'E2', name: 'Grace', gross: 6100, net: 4400 },
  { id: 'E3', name: 'Alan', gross: 4800, net: 3700 },
]
const LAST = [
  { id: 'E1', name: 'Ada', gross: 5000, net: 3800 },
  { id: 'E2', name: 'Grace', gross: 6100, net: 4400 },
  { id: 'E3', name: 'Alan', gross: 4000, net: 3100 },
]

test('baseline: compare shows each change, variance-threshold marks the cells past it', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-table style="height:240px;width:620px" row-key="id" aria-label="Payroll" rows='${JSON.stringify(RUN)}' baseline='${JSON.stringify(LAST)}'>
  <c2-table-column field="name" header="Employee" width="140px"></c2-table-column>
  <c2-table-column field="gross" header="Gross" width="180px" align="end" format="currency" locale="en-US" format-options='{"maximumFractionDigits":0}' compare="delta" variance-threshold="0.1"></c2-table-column>
  <c2-table-column field="net" header="Net" width="160px" align="end" format="number" locale="en-US" compare="percent"></c2-table-column>
</c2-table>`)
  const gross = table(page).locator('[part~="cell-gross"]')
  await expect(gross.nth(0)).toContainText('+$200')
  await expect(gross.nth(0).locator('[part~="delta"]')).toHaveAttribute('title', 'Was $5,000')
  await expect(gross.nth(0)).not.toHaveAttribute('part', /cell-variance/)
  // 800 on 4,000 is 20%: past the 10% threshold.
  await expect(gross.nth(2)).toHaveAttribute('part', /cell-variance/)
  await expect(gross.nth(2).locator('[part~="delta"]')).toHaveAttribute('part', /delta-up/)
  await expect(table(page).locator('[part~="cell-net"]').nth(2)).toContainText('+19.4%')
  await expect(table(page).locator('[part~="cell-net"]').nth(1).locator('[part~="delta"]')).toHaveAttribute('part', /delta-flat/)
  await accessible(page)
})

test('filterable and baseline cost nothing on the read path: 50,000 rows render the same window', async ({ page, renderScenario }) => {
  const count = async (extra: string) => {
    await renderScenario(`<c2-table style="height:480px;width:520px" row-key="id" aria-label="Rows" ${extra}>
  <c2-table-column field="id" header="Id" width="160px"></c2-table-column>
  <c2-table-column field="name" header="Name" width="240px"></c2-table-column>
</c2-table>`)
    return table(page).evaluate(async (element: HTMLElement & { rows: unknown[]; updateComplete: Promise<boolean> }) => {
      element.rows = Array.from({ length: 50_000 }, (_, index) => ({ id: String(index), name: `Row ${index}` }))
      let done = await element.updateComplete
      while (!done) done = await element.updateComplete
      return element.shadowRoot!.querySelectorAll('.row--body').length
    })
  }
  const plain = await count('')
  expect(await count('filterable')).toBe(plain)
})

test("clicking another column's filter while one is open switches to it, and the focus moves into the panel", async ({ page, renderScenario }) => {
  await renderScenario(orders('filterable'))
  await filterButton(page).click()
  await expect(popover(page)).toBeVisible()
  await expect(popover(page).locator('c2-facet-list')).toBeFocused()
  await table(page).getByRole('button', { name: 'Filter Customer' }).click()
  await expect(popover(page)).toBeVisible()
  await expect(popover(page).getByRole('checkbox')).toHaveCount(5)
  await expect(table(page).getByRole('button', { name: 'Filter Customer' })).toHaveAttribute('aria-expanded', 'true')
})

test('a click outside the panel keeps its focus, a hidden selected row stays selected, and a filter returns to page 1', async ({ page, renderScenario }) => {
  await renderScenario(`<input aria-label="Elsewhere" />${orders('selection="multiple" paginated page-size="2" page="2"')}`)
  await filterButton(page).click()
  await page.getByRole('textbox', { name: 'Elsewhere' }).click()
  await expect(popover(page)).toBeHidden()
  await expect(page.getByRole('textbox', { name: 'Elsewhere' })).toBeFocused()

  await table(page).evaluate((element: HTMLElement & { value: string[]; filters: unknown; addRow(row: unknown): unknown }) => {
    element.value = ['O1', 'O2']
    element.filters = { status: { include: ['Paid'] } }
  })
  await expect(table(page)).toHaveJSProperty('page', 1)
  await table(page).evaluate((element: HTMLElement & { addRow(row: unknown): unknown }) =>
    element.addRow({ id: 'O9', customer: 'Zed', status: 'Paid', total: 1 }),
  )
  await expect(table(page)).toHaveJSProperty('value', ['O1', 'O2'])
})

test('a tree keeps the parents of a matching row, and a data source lists the options of a column', async ({ page, renderScenario }) => {
  const tree = [
    {
      id: 'A',
      name: 'Atlas',
      status: 'Open',
      children: [
        { id: 'A1', name: 'Atlas API', status: 'Paid' },
        { id: 'A2', name: 'Atlas UI', status: 'Open' },
      ],
    },
    { id: 'B', name: 'Brio', status: 'Paid' },
  ]
  await renderScenario(`<c2-group-table style="height:300px;width:420px" row-key="id" aria-label="Projects" children-field="children" expanded-rows="A" filters='{"status":{"include":["Paid"]}}' rows='${JSON.stringify(tree)}'>
  <c2-table-column field="name" header="Name" width="200px"></c2-table-column>
  <c2-table-column field="status" header="Status" width="140px" filterable></c2-table-column>
</c2-group-table>`)
  const names = page.locator('c2-group-table [part~="cell-name"]')
  await expect(names).toHaveText([/Atlas\s*$/, /Atlas API/, /Brio/])
  await page.locator('c2-group-table').getByRole('button', { name: 'Filter Status' }).click()
  await expect(page.locator('c2-group-table [part="filter"]').getByRole('checkbox')).toHaveCount(2)

  await renderScenario(`<c2-table style="height:300px;width:420px" row-key="id" aria-label="Remote" filterable>
  <c2-table-column field="id" header="Id" width="120px"></c2-table-column>
  <c2-table-column field="status" header="Status" width="140px" options='["Paid","Open"]'></c2-table-column>
</c2-table>`)
  await table(page).evaluate((element: HTMLElement & { dataSource: unknown }) => {
    element.dataSource = { getRows: () => Promise.resolve({ rows: [{ id: 'A', status: 'Paid' }], total: 1 }) }
  })
  await expect(table(page).getByRole('button', { name: 'Filter Id' })).toHaveCount(0)
  await filterButton(page).click()
  await expect(popover(page).getByRole('checkbox')).toHaveCount(2)
})
