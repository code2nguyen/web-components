import type { Page } from '@playwright/test'
import { test, expect, props, accessible } from '../../../../tests/component-fixture'

const ORDERS = [
  { id: 'o1', customer: 'Acme GmbH', region: 'EMEA', status: 'Paid', amount: 12400, qty: 16 },
  { id: 'o2', customer: 'Nordlys AS', region: 'EMEA', status: 'Paid', amount: 10080, qty: 14 },
  { id: 'o3', customer: 'Brio SpA', region: 'EMEA', status: 'Paid', amount: 9000, qty: 10 },
  { id: 'o4', customer: 'Kaspar & Co', region: 'EMEA', status: 'Pending', amount: 9450, qty: 12 },
  { id: 'o5', customer: 'Ljus AB', region: 'EMEA', status: 'Pending', amount: 7280, qty: 9 },
  { id: 'o6', customer: 'Halcyon Inc', region: 'Americas', status: 'Paid', amount: 14200, qty: 18 },
  { id: 'o7', customer: 'Pampa SA', region: 'Americas', status: 'Failed', amount: 4100, qty: 5 },
  { id: 'o8', customer: 'Maple Ltd', region: 'Americas', status: 'Paid', amount: 11600, qty: 13 },
  { id: 'o9', customer: 'Tundra Co', region: 'Americas', status: 'Pending', amount: 7000, qty: 8 },
  { id: 'o10', customer: 'Kiwi Ltd', region: 'APAC', status: 'Paid', amount: 8340, qty: 11 },
  { id: 'o11', customer: 'Sakura KK', region: 'APAC', status: 'Paid', amount: 7600, qty: 10 },
  { id: 'o12', customer: 'Lotus Pte', region: 'APAC', status: 'Pending', amount: 5400, qty: 8 },
]

const ordersJson = JSON.stringify(ORDERS)
  .replace(/'/g, '&#39;')
  .replace(/&(?!#39;)/g, '&amp;')

const COLUMNS = `<c2-table-column field="customer" header="Customer" width="220px"></c2-table-column>
  <c2-table-column field="region" header="Region" hidden></c2-table-column>
  <c2-table-column field="status" header="Status" width="120px"></c2-table-column>
  <c2-table-column field="amount" header="Amount" width="160px" align="end" format="currency" summary="sum"></c2-table-column>
  <c2-table-column field="qty" header="Qty" width="100px" align="end" summary="sum"></c2-table-column>`

const orders = (attributes = '', columns = COLUMNS, style = 'height:520px;width:640px') =>
  `<c2-table style="${style}" row-key="id" rows='${ordersJson}' ${attributes}>
  ${columns}
</c2-table>`

const table = (page: Page) => page.locator('c2-table')

/** Every rendered body line, top to bottom: `group <key> <texts…>` or `row <texts…>`. Stuck copies are left out. */
const lines = (page: Page) =>
  table(page).evaluate((element) =>
    [...element.shadowRoot!.querySelectorAll<HTMLElement>('.row--body, .row--group:not(.row--group-echo)')].map((row) => {
      const texts = [...row.querySelectorAll<HTMLElement>('[role="gridcell"]')].map((cell) => cell.textContent!.trim())
      const line = row.classList.contains('row--group') ? `group ${row.dataset.groupKey} | ${texts.join(' | ')}` : `row ${texts.join(' | ')}`
      return line.replace(/\s+/g, ' ')
    }),
  )

const groupRow = (page: Page, key: string) => table(page).locator(`[part~="group-row"]:not([part~="group-row-echo"])[data-group-key="${key}"]`)
const echoKeys = (page: Page) =>
  table(page).evaluate((element) => [...element.shadowRoot!.querySelectorAll<HTMLElement>('[part~="group-row-echo"]')].map((row) => row.dataset.groupKey))

test('group-by puts each group on a row of the grid, its aggregates under their own columns', async ({ page, renderScenario }) => {
  await renderScenario(orders('group-by="region"'))
  await expect(table(page).getByRole('treegrid')).toBeVisible()
  // Groups follow the value order, rows keep their order inside a group.
  expect((await lines(page)).filter((line) => line.startsWith('group'))).toEqual([
    'group region=Americas | Americas 4 | | $36,900.00 | 44',
    'group region=APAC | APAC 3 | | $21,340.00 | 29',
    'group region=EMEA | EMEA 5 | | $48,210.00 | 61',
  ])
  expect((await lines(page)).slice(0, 3)).toEqual([
    'group region=Americas | Americas 4 | | $36,900.00 | 44',
    'row Halcyon Inc | Paid | $14,200.00 | 18',
    'row Pampa SA | Failed | $4,100.00 | 5',
  ])

  const tracks = await table(page).evaluate((element) => {
    const root = element.shadowRoot!
    const edges = (selector: string) => [...root.querySelectorAll<HTMLElement>(selector)].map((cell) => Math.round(cell.getBoundingClientRect().right))
    return { header: edges('[role="columnheader"]'), group: edges('[data-group-key="region=EMEA"] [role="gridcell"]') }
  })
  expect(tracks.group).toEqual(tracks.header)

  const emea = groupRow(page, 'region=EMEA')
  await expect(emea).toHaveAttribute('aria-level', '1')
  await expect(emea).toHaveAttribute('aria-expanded', 'true')
  await expect(table(page).getByRole('row', { name: /Acme GmbH/ })).toHaveAttribute('aria-level', '2')
  // Header + 3 groups + 12 rows + summary row.
  await expect(table(page).getByRole('treegrid')).toHaveAttribute('aria-rowcount', '17')
  await expect(table(page).locator('[part="summary-row"]')).toHaveAttribute('aria-rowindex', '17')
  await accessible(page)
})

test('nested levels key a group by its path and indent its rows under the label', async ({ page, renderScenario }) => {
  await renderScenario(orders('group-by="region,status"'))
  await expect(groupRow(page, 'region=EMEA/status=Paid')).toHaveAttribute('aria-level', '2')
  await expect(table(page).getByRole('row', { name: /Acme GmbH/ })).toHaveAttribute('aria-level', '3')
  expect((await lines(page)).slice(14, 18)).toEqual([
    'group region=EMEA | EMEA 5 | | $48,210.00 | 61',
    'group region=EMEA/status=Paid | Paid 3 | | $31,480.00 | 40',
    'row Acme GmbH | Paid | $12,400.00 | 16',
    'row Nordlys AS | Paid | $10,080.00 | 14',
  ])
  const left = (selector: string) =>
    table(page)
      .locator(selector)
      .first()
      .evaluate((element) => Math.round(element.getBoundingClientRect().left))
  const outer = await left('[data-group-key="region=EMEA"] [part="group-label"]')
  const inner = await left('[data-group-key="region=EMEA/status=Paid"] [part="group-label"]')
  const row = await table(page)
    .getByRole('row', { name: /Acme GmbH/ })
    .locator('[part~="cell-content"]')
    .first()
    .evaluate((element) => Math.round(element.getBoundingClientRect().left))
  // 24px per level lines each level up with the label of the level above it.
  expect(inner - outer).toBe(24)
  expect(row).toBe(inner)
})

test('clicking a group closes it and reports it; expanded-groups is the state, in and out', async ({ page, renderScenario }) => {
  await renderScenario(`<div id="outer">${orders('group-by="region"')}</div>`)
  const events = await page.evaluate(() => {
    const log: unknown[] = []
    ;(window as unknown as { log: unknown[] }).log = log
    document.querySelector('c2-table')!.addEventListener('group-toggle', (event) => {
      const { key, expanded, group } = (event as CustomEvent).detail
      log.push({ key, expanded, rows: group.rows.length, amount: group.summary.amount })
    })
    document.querySelector('#outer')!.addEventListener('group-toggle', () => log.push('bubbled'))
    return log
  })
  expect(events).toEqual([])
  await groupRow(page, 'region=EMEA').click()
  await expect(groupRow(page, 'region=EMEA')).toHaveAttribute('aria-expanded', 'false')
  await expect(table(page).getByRole('row', { name: /Acme GmbH/ })).toHaveCount(0)
  expect(await page.evaluate(() => (window as unknown as { log: unknown[] }).log)).toEqual([{ key: 'region=EMEA', expanded: false, rows: 5, amount: 48210 }])
  expect(await table(page).evaluate((element) => (element as HTMLElement & { expandedGroups: string[] }).expandedGroups)).toEqual([
    'region=Americas',
    'region=APAC',
  ])

  await table(page).evaluate((element) => element.setAttribute('expanded-groups', 'region=EMEA'))
  await expect(groupRow(page, 'region=Americas')).toHaveAttribute('aria-expanded', 'false')
  await expect(table(page).getByRole('row', { name: /Acme GmbH/ })).toHaveCount(1)
  expect((await lines(page)).length).toBe(3 + 5)
})

test('groups-collapsed starts every group closed, and expandAll / collapseAll open and close them', async ({ page, renderScenario }) => {
  await renderScenario(orders('group-by="region,status" groups-collapsed'))
  expect(await lines(page)).toEqual([
    'group region=Americas | Americas 4 | | $36,900.00 | 44',
    'group region=APAC | APAC 3 | | $21,340.00 | 29',
    'group region=EMEA | EMEA 5 | | $48,210.00 | 61',
  ])
  await table(page).evaluate((element) => (element as HTMLElement & { expandAll(): void }).expandAll())
  await expect.poll(async () => (await lines(page)).length).toBe(3 + 7 + 12)
  await table(page).evaluate((element) => (element as HTMLElement & { collapseAll(): void }).collapseAll())
  await expect.poll(async () => (await lines(page)).length).toBe(3)
  const groups = await table(page).evaluate((element) =>
    (element as HTMLElement & { getGroups(): { key: string; level: number; rows: unknown[] }[] })
      .getGroups()
      .map(({ key, level, rows }) => `${level} ${key} ${rows.length}`),
  )
  expect(groups.slice(0, 4)).toEqual([
    '0 region=Americas 4',
    '1 region=Americas/status=Failed 1',
    '1 region=Americas/status=Paid 2',
    '1 region=Americas/status=Pending 1',
  ])
})

test('a group checkbox selects its rows and shows a partial selection; the selection holds row keys only', async ({ page, renderScenario }) => {
  await renderScenario(orders('group-by="region" selection="multiple" checkbox-selection'))
  const changes = await page.evaluate(() => {
    const log: string[][] = []
    ;(window as unknown as { log: string[][] }).log = log
    document.querySelector('c2-table')!.addEventListener('selection-change', (event) => log.push((event as CustomEvent).detail.value))
    return log
  })
  expect(changes).toEqual([])
  const groupBox = groupRow(page, 'region=APAC').locator('c2-checkbox')
  await groupBox.click()
  await expect(groupRow(page, 'region=APAC')).toHaveAttribute('aria-expanded', 'true')
  expect(await page.evaluate(() => (window as unknown as { log: string[][] }).log)).toEqual([['o10', 'o11', 'o12']])

  await table(page)
    .getByRole('row', { name: /Sakura KK/ })
    .locator('c2-checkbox')
    .click()
  await expect(groupBox).toHaveJSProperty('indeterminate', true)
  await expect(table(page).locator('[part~="selection-header-cell"] c2-checkbox')).toHaveJSProperty('indeterminate', true)
  // Select all covers rows in closed groups as well.
  await groupRow(page, 'region=EMEA').click()
  await table(page).locator('[part~="selection-header-cell"] c2-checkbox').click()
  await expect.poll(async () => (await table(page).evaluate((element) => (element as HTMLElement & { value: string[] }).value)).length).toBe(12)
  await expect(groupRow(page, 'region=EMEA').locator('c2-checkbox')).toHaveJSProperty('checked', true)
})

test('the keyboard opens, closes and climbs the group tree from the group cell', async ({ page, renderScenario }) => {
  await renderScenario(orders('group-by="region,status"'))
  const active = () =>
    table(page).evaluate(
      (element) =>
        element.shadowRoot!.activeElement?.closest<HTMLElement>('[role="row"]')?.dataset.groupKey ?? element.shadowRoot!.activeElement?.textContent?.trim(),
    )
  await table(page).getByRole('columnheader').first().focus()
  await page.keyboard.press('ArrowDown')
  expect(await active()).toBe('region=Americas')
  await page.keyboard.press('ArrowLeft')
  await expect(groupRow(page, 'region=Americas')).toHaveAttribute('aria-expanded', 'false')
  await page.keyboard.press('ArrowRight')
  await expect(groupRow(page, 'region=Americas')).toHaveAttribute('aria-expanded', 'true')
  await page.keyboard.press('ArrowDown')
  expect(await active()).toBe('region=Americas/status=Failed')
  await page.keyboard.press('Enter')
  await expect(groupRow(page, 'region=Americas/status=Failed')).toHaveAttribute('aria-expanded', 'false')
  // On a closed sub-group, ← moves to its parent.
  await page.keyboard.press('ArrowLeft')
  expect(await active()).toBe('region=Americas')
  // Off the tree cell, ←/→ move between cells as on any row.
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  expect(await table(page).evaluate((element) => element.shadowRoot!.activeElement?.textContent?.trim())).toBe('$36,900.00')
  await page.keyboard.press('ArrowLeft')
  await expect(groupRow(page, 'region=Americas')).toHaveAttribute('aria-expanded', 'true')
})

const MANY = Array.from({ length: 3000 }, (_, index) => ({
  id: String(index),
  team: `Team ${String(Math.floor(index / 300)).padStart(2, '0')}`,
  squad: `Squad ${Math.floor(index / 30) % 10}`,
  score: index,
}))

test('a virtualized grouped table keeps the groups of the rows at the top under the header', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-table style="height:400px;width:520px" row-key="id" group-by="team,squad" rows='${JSON.stringify(MANY)}'>
    <c2-table-column field="id" header="ID" width="120px"></c2-table-column>
    <c2-table-column field="score" header="Score" width="200px" summary="sum"></c2-table-column>
  </c2-table>`)
  expect(await table(page).evaluate((element) => (element as HTMLElement & { isVirtualized: boolean }).isVirtualized)).toBe(true)
  expect(await echoKeys(page)).toEqual([])
  const scroll = (top: number) => table(page).evaluate((element, value) => (element.shadowRoot!.querySelector('[part="viewport"]')!.scrollTop = value), top)
  // Team 00 is line 0 and each squad takes 31 lines after it (Squad 3 is line 94), so lines 100 and 101 are in Squad 3.
  const rowHeight = await table(page)
    .locator('.row--body')
    .first()
    .evaluate((element) => element.getBoundingClientRect().height)
  await scroll(100 * rowHeight)
  await expect.poll(() => echoKeys(page)).toEqual(['team=Team 00', 'team=Team 00/squad=Squad 3'])
  const stuck = await table(page).evaluate((element) => {
    const root = element.shadowRoot!
    const header = root.querySelector('.row--header')!.getBoundingClientRect()
    return [...root.querySelectorAll('[part~="group-row-echo"]')].map((row) => Math.round(row.getBoundingClientRect().top - header.bottom))
  })
  expect(stuck).toEqual([0, Math.round(rowHeight)])
  await expect(table(page).locator('[part~="group-row-echo"]').first()).toHaveAttribute('aria-hidden', 'true')
  // Deep into the list, in a later team.
  await scroll(2000 * rowHeight)
  await expect.poll(async () => (await echoKeys(page)).length).toBe(2)
  const [team, squad] = await echoKeys(page)
  expect(squad!.startsWith(`${team}/`)).toBe(true)
  // Clicking the stuck copy closes the real group.
  await table(page).locator('[part~="group-row-echo"]').first().click()
  await expect
    .poll(() => table(page).evaluate((element, key) => (element as HTMLElement & { expandedGroups: string[] }).expandedGroups.includes(key!), team))
    .toBe(false)
})

test('pages count display lines, and a page that starts inside a group repeats its headers', async ({ page, renderScenario }) => {
  await renderScenario(orders('group-by="region,status" page-size="5"'))
  await expect.poll(async () => (await lines(page)).length).toBe(5)
  expect(await echoKeys(page)).toEqual([])
  // 22 lines: Americas, Failed, Pampa, Paid, Halcyon | Maple, Pending, Tundra, APAC, Paid | Kiwi…
  expect(await table(page).evaluate((element) => (element as HTMLElement & { pageCount: number }).pageCount)).toBe(5)
  await props(table(page), { page: 2 })
  await expect.poll(async () => (await lines(page))[0]).toBe('row Maple Ltd | Paid | $11,600.00 | 13')
  expect(await echoKeys(page)).toEqual(['region=Americas', 'region=Americas/status=Paid'])
  expect((await lines(page)).length).toBe(5)
  await expect(table(page).locator('[part~="group-row-echo"]').first()).toHaveAttribute('aria-hidden', 'true')
  // The repeated headers sit in lines kept for them, above the page's first line rather than over it.
  const offsets = await table(page).evaluate((element) => {
    const root = element.shadowRoot!
    const echoes = [...root.querySelectorAll('[part~="group-row-echo"]')]
    const first = root.querySelector('.row--group:not(.row--group-echo), .row--body')!.getBoundingClientRect()
    return { echoBottom: Math.round(echoes[echoes.length - 1].getBoundingClientRect().bottom), firstTop: Math.round(first.top) }
  })
  expect(Math.abs(offsets.firstTop - offsets.echoBottom)).toBeLessThanOrEqual(1)
  await props(table(page), { page: 3 })
  await expect.poll(async () => (await lines(page))[0]).toBe('row Kiwi Ltd | Paid | $8,340.00 | 11')
  expect(await echoKeys(page)).toEqual(['region=APAC', 'region=APAC/status=Paid'])
})

test('group-display="band" draws one band per group that stays in view on a sideways scroll', async ({ page, renderScenario }) => {
  await renderScenario(
    orders(
      'group-by="region" group-display="band"',
      `<c2-table-column field="customer" header="Customer" width="220px" pinned="start"></c2-table-column>
  <c2-table-column field="status" header="Status" width="400px"></c2-table-column>
  <c2-table-column field="amount" header="Amount" width="400px" format="currency" summary="sum"></c2-table-column>`,
      'height:520px;width:480px',
    ),
  )
  const band = groupRow(page, 'region=EMEA')
  await expect(band).toHaveAttribute('part', /group-band/)
  await expect(band.getByRole('gridcell')).toHaveCount(1)
  await expect(band.getByRole('gridcell')).toHaveAttribute('aria-colspan', '3')
  await expect(band.getByRole('gridcell')).toHaveText(/EMEA\s*5/)
  const labelLeft = () => band.locator('[part="group-label"]').evaluate((element) => Math.round(element.getBoundingClientRect().left))
  const before = await labelLeft()
  await table(page).evaluate((element) => (element.shadowRoot!.querySelector('[part="viewport"]')!.scrollLeft = 300))
  expect(await labelLeft()).toBe(before)
  await band.click()
  await expect(band).toHaveAttribute('aria-expanded', 'false')
  await accessible(page)
})

test('renderGroup, a group:<key> slot and empty-group-label name the groups', async ({ page, renderScenario }) => {
  const rows = JSON.stringify([...ORDERS.slice(0, 3), { id: 'o13', customer: 'Nobody', region: '', status: 'Paid', amount: 1, qty: 1 }]).replace(/&/g, '&amp;')
  await renderScenario(`<c2-table style="height:400px;width:640px" row-key="id" group-by="region" empty-group-label="Unassigned" rows='${rows}'>
    ${COLUMNS}
    <strong slot="group:region=EMEA">Europe</strong>
  </c2-table>`)
  await expect(groupRow(page, 'region=')).toContainText('Unassigned')
  await expect(page.locator('strong[slot="group:region=EMEA"]')).toBeVisible()
  await table(page).evaluate((element) => {
    ;(element as HTMLElement & { renderGroup: unknown }).renderGroup = ({ value, summary }: { value: unknown; summary: Record<string, number> }) =>
      `${value || '—'} · ${summary.qty} units`
  })
  await expect(groupRow(page, 'region=')).toContainText('— · 1 units')
})

test('the group order follows the sort of its field, or its own sort', async ({ page, renderScenario }) => {
  await renderScenario(orders('group-by="region" sort="region:desc"'))
  const groups = async () => (await lines(page)).filter((line) => line.startsWith('group')).map((line) => line.split(' | ')[0])
  expect(await groups()).toEqual(['group region=EMEA', 'group region=APAC', 'group region=Americas'])
  await props(table(page), { sortModel: [{ field: 'amount', direction: 'desc' }] })
  await expect.poll(groups).toEqual(['group region=Americas', 'group region=APAC', 'group region=EMEA'])
  // Rows are sorted inside each group.
  expect((await lines(page)).slice(1, 3)).toEqual(['row Halcyon Inc | Paid | $14,200.00 | 18', 'row Maple Ltd | Paid | $11,600.00 | 13'])
  await props(table(page), { groupBy: [{ field: 'region', sort: 'desc' }] })
  await expect.poll(groups).toEqual(['group region=EMEA', 'group region=APAC', 'group region=Americas'])
})

test('group-by is ignored with a dataSource, with one warning', async ({ page, renderScenario }) => {
  const warnings: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'warning') warnings.push(message.text())
  })
  await renderScenario(orders('group-by="region"'))
  await table(page).evaluate((element, source) => {
    const target = element as HTMLElement & { rows: unknown[]; dataSource: unknown }
    target.rows = []
    target.dataSource = {
      getRows: async ({ start, count }: { start: number; count: number }) => ({ rows: source.slice(start, start + count), total: source.length }),
    }
  }, ORDERS)
  await expect(table(page).getByRole('grid')).toBeVisible()
  await expect(table(page).locator('[part~="group-row"]')).toHaveCount(0)
  await expect(table(page).getByRole('row', { name: /Acme GmbH/ })).toHaveCount(1)
  expect(warnings.filter((text) => text.includes('group-by is ignored'))).toHaveLength(1)
})
