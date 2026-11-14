import type { Page } from '@playwright/test'
import { test, expect, props, watch, accessible } from '../../../../tests/component-fixture'

const ORDERS = [
  { id: 'ORD-1', customer: 'Ada Lovelace', total: 120 },
  { id: 'ORD-2', customer: 'Grace Hopper', total: 80 },
  { id: 'ORD-3', customer: 'Alan Turing', total: 310 },
  { id: 'ORD-4', customer: 'Radia Perlman', total: 45 },
]

const COLUMNS = `<c2-table-column field="id" header="Order" width="160px"></c2-table-column>
  <c2-table-column field="customer" header="Customer" width="200px"></c2-table-column>
  <c2-table-column field="total" header="Total" width="120px" align="end" format="number"></c2-table-column>`

const orders = (attributes = '', children = '') =>
  `<c2-table style="height:420px;width:520px" row-key="id" aria-label="Orders" rows='${JSON.stringify(ORDERS)}' ${attributes}>
  ${COLUMNS}${children}
</c2-table>`

const table = (page: Page) => page.locator('c2-table')
const toggles = (page: Page) => table(page).locator('[part="detail-toggle"]')
/** The open panels: a closed one filled from a slot stays in the page, hidden, for find-in-page. */
const panels = (page: Page) => table(page).locator('.row--detail:not([hidden]) [part="detail"]')

/** A table of `count` generated rows, 480px tall, with `values` assigned as properties. */
async function generated(page: Page, renderScenario: (html: string) => Promise<void>, count: number, values: Record<string, unknown> = {}) {
  await renderScenario(`<c2-table style="height:480px;width:520px" row-key="id" aria-label="Rows" virtual="always">
  <c2-table-column field="id" header="Id" width="160px"></c2-table-column>
  <c2-table-column field="name" header="Name" width="240px"></c2-table-column>
</c2-table>`)
  await table(page).evaluate(
    async (element: HTMLElement & { rows: unknown[]; updateComplete: Promise<boolean> }, { size, extra }) => {
      Object.assign(element, extra)
      element.rows = Array.from({ length: size }, (_, index) => ({ id: String(index), name: `Row ${index}` }))
      let done = await element.updateComplete
      while (!done) done = await element.updateComplete
    },
    { size: count, extra: values },
  )
}

/** What the viewport shows: the rendered body rows, the row under the top edge of the body and the scroll height. */
const layout = (page: Page) =>
  table(page).evaluate(async (element: HTMLElement & { updateComplete: Promise<boolean> }) => {
    let done = await element.updateComplete
    while (!done) done = await element.updateComplete
    const root = element.shadowRoot!
    const viewport = root.querySelector<HTMLElement>('.viewport')!
    const header = root.querySelector<HTMLElement>('.row--header')!.getBoundingClientRect()
    const rows = [...root.querySelectorAll<HTMLElement>('.row--body, .row--detail')]
    const box = viewport.getBoundingClientRect()
    const covering = rows.filter((row) => row.getBoundingClientRect().bottom > header.bottom + 0.5 && row.getBoundingClientRect().top < box.bottom - 0.5)
    const top = covering[0]
    const last = covering[covering.length - 1]
    return {
      rendered: root.querySelectorAll('.row--body').length,
      first: top?.classList.contains('row--detail') ? `detail:${top.dataset.detailKey}` : (top?.dataset.rowKey ?? ''),
      // No blank band: the rows on screen start at the header and reach the bottom of the viewport.
      gapTop: top ? Math.round(top.getBoundingClientRect().top - header.bottom) : 999,
      gapBottom: last ? Math.round(box.bottom - last.getBoundingClientRect().bottom) : 999,
      scrollHeight: viewport.scrollHeight,
      rowHeight: root.querySelector<HTMLElement>('.row--body')!.getBoundingClientRect().height,
      headerHeight: header.height,
    }
  })

const scrollTo = (page: Page, top: number) =>
  table(page).evaluate((element, value) => {
    element.shadowRoot!.querySelector<HTMLElement>('.viewport')!.scrollTop = value
  }, top)

test('detail-height gives each row a chevron that opens a panel of that height, filled from the row slot', async ({ page, renderScenario }) => {
  await renderScenario(orders('detail-height="120"', '<p slot="detail:ORD-2">Two items, shipped on Monday.</p>'))
  await expect(table(page).getByRole('grid')).toBeVisible()
  await expect(toggles(page)).toHaveCount(4)
  await expect(panels(page)).toHaveCount(0)
  await watch(table(page), 'detail-toggle')

  const toggle = table(page).getByRole('row', { name: /ORD-2/ }).getByRole('button', { name: 'Details' })
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(panels(page)).toHaveCount(1)
  await expect(page.getByText('Two items, shipped on Monday.')).toBeVisible()
  expect((await table(page).locator('.row--detail:not([hidden])').boundingBox())!.height).toBe(120)
  await expect(table(page)).toHaveJSProperty('expandedDetails', ['ORD-2'])
  expect(JSON.parse((await table(page).getAttribute('data-events'))!)).toMatchObject([{ key: 'ORD-2', expanded: true, row: { customer: 'Grace Hopper' } }])
  // The panel sits right under its row, and opening it selects nothing.
  const rowBox = (await table(page).getByRole('row', { name: /ORD-2/ }).first().boundingBox())!
  const panelBox = (await table(page).locator('.row--detail:not([hidden])').boundingBox())!
  expect(Math.round(panelBox.y - (rowBox.y + rowBox.height))).toBe(0)
  await expect(table(page)).toHaveJSProperty('value', [])

  await toggle.click()
  await expect(panels(page)).toHaveCount(0)
  await expect(table(page)).toHaveJSProperty('expandedDetails', [])
  await accessible(page)
})

test('renderDetail draws the panel only while it is open, and expanded-details opens rows from markup', async ({ page, renderScenario }) => {
  await renderScenario(orders('detail-height="96" expanded-details="ORD-1;ORD-3"'))
  await table(page).evaluate((element: HTMLElement & { renderDetail: unknown; calls: string[] }) => {
    element.calls = []
    element.renderDetail = ({ row, key }: { row: { customer: string }; key: string }) => {
      element.calls.push(key)
      return `Notes for ${row.customer}`
    }
  })
  await expect(panels(page)).toHaveText(['Notes for Ada Lovelace', 'Notes for Alan Turing'])
  expect(new Set(await table(page).evaluate((element: HTMLElement & { calls: string[] }) => element.calls))).toEqual(new Set(['ORD-1', 'ORD-3']))

  await table(page).evaluate((element: HTMLElement & { collapseDetail(key: string): void; expandDetail(key: string): void }) => {
    element.collapseDetail('ORD-1')
    element.expandDetail('ORD-4')
  })
  await expect(panels(page)).toHaveText(['Notes for Alan Turing', 'Notes for Radia Perlman'])
  await accessible(page)
})

test('Alt+ArrowDown opens the focused row panel and Alt+ArrowUp closes it', async ({ page, renderScenario }) => {
  await renderScenario(orders('detail-height="100"', '<p slot="detail:ORD-1">First order.</p>'))
  await watch(table(page), 'detail-toggle')
  await table(page).getByRole('gridcell', { name: 'Ada Lovelace' }).click()
  await page.keyboard.press('Alt+ArrowDown')
  await expect(page.getByText('First order.')).toBeVisible()
  // Opening again changes nothing and reports nothing.
  await page.keyboard.press('Alt+ArrowDown')
  await page.keyboard.press('Alt+ArrowUp')
  await expect(panels(page)).toHaveCount(0)
  expect(JSON.parse((await table(page).getAttribute('data-events'))!).map((detail: { expanded: boolean }) => detail.expanded)).toEqual([true, false])
  // Plain arrows still move between rows.
  await page.keyboard.press('ArrowDown')
  await expect(table(page).getByRole('gridcell', { name: 'Grace Hopper' })).toBeFocused()

  // After a click on a chevron the keys act on that row, whichever cell had the focus before.
  await table(page).getByRole('row', { name: /ORD-3/ }).getByRole('button', { name: 'Details' }).click()
  await expect(panels(page)).toHaveCount(1)
  await page.keyboard.press('Alt+ArrowUp')
  await expect(panels(page)).toHaveCount(0)
  expect(JSON.parse((await table(page).getAttribute('data-events'))!).map((detail: { key: string }) => detail.key)).toEqual([
    'ORD-1',
    'ORD-1',
    'ORD-3',
    'ORD-3',
  ])
})

test('keys pressed inside a panel stay with its content, and the panel is a tab stop', async ({ page, renderScenario }) => {
  await renderScenario(orders('detail-height="100" expanded-details="ORD-2"', '<div slot="detail:ORD-2"><button>Refund</button><button>Reship</button></div>'))
  await page.getByRole('button', { name: 'Refund' }).focus()
  for (const key of ['ArrowDown', 'ArrowUp', 'Home', 'Alt+ArrowUp']) await page.keyboard.press(key)
  await expect(page.getByRole('button', { name: 'Refund' })).toBeFocused()
  await expect(panels(page)).toHaveCount(1)
  await expect(panels(page)).toHaveAttribute('tabindex', '0')
  await expect(table(page).getByRole('row', { name: /ORD-2/ }).getByRole('button', { name: 'Details' })).toHaveAttribute(
    'aria-controls',
    (await panels(page).getAttribute('id'))!,
  )
})

test('a closed panel filled from a slot opens when find-in-page matches its text', async ({ page, renderScenario, browserName }) => {
  test.skip(browserName === 'webkit', 'WebKit has no hidden="until-found": closed panels are not drawn there')
  await renderScenario(orders('detail-height="100"', '<p slot="detail:ORD-3">Fragile, deliver to the side door.</p>'))
  await watch(table(page), 'detail-toggle')
  const closed = table(page).locator('.row--detail[data-detail-key="ORD-3"]')
  await expect(closed).toHaveAttribute('hidden', 'until-found')
  expect((await closed.evaluate((element) => element.getBoundingClientRect().height)) ?? 1).toBe(0)
  // What the browser does when a search matches inside the hidden panel.
  await closed.evaluate((element) => element.dispatchEvent(new Event('beforematch', { bubbles: true })))
  await expect(page.getByText('Fragile, deliver to the side door.')).toBeVisible()
  await expect(table(page)).toHaveJSProperty('expandedDetails', ['ORD-3'])
  expect(JSON.parse((await table(page).getAttribute('data-events'))!)).toMatchObject([{ key: 'ORD-3', expanded: true }])
})

test('the chevron is named in the table language, and detail-label overrides it', async ({ page, renderScenario }) => {
  await renderScenario(`<div lang="fr">${orders('detail-height="100"')}</div>`)
  await expect(table(page).getByRole('button', { name: 'Détails' })).toHaveCount(4)
  await props(table(page), { detailLabel: 'Lignes' })
  await expect(table(page).getByRole('button', { name: 'Lignes' })).toHaveCount(4)
})

test('without detail-height nothing is added, and it is ignored while the rows are grouped or a tree', async ({ page, renderScenario }) => {
  await renderScenario(orders('expanded-details="ORD-1"'))
  await expect(table(page).getByRole('row', { name: /ORD-1/ })).toBeVisible()
  await expect(toggles(page)).toHaveCount(0)
  await expect(panels(page)).toHaveCount(0)

  // Grouping is `c2-group-table`'s: there the panels give way to the group rows.
  await renderScenario(
    orders('detail-height="100" expanded-details="ORD-1" group-by="customer"')
      .replace('<c2-table ', '<c2-group-table ')
      .replace('</c2-table>', '</c2-group-table>'),
  )
  const grouped = page.locator('c2-group-table')
  await expect(grouped.getByRole('treegrid')).toBeVisible()
  await expect(grouped.locator('[part="detail-toggle"]')).toHaveCount(0)
  await expect(grouped.locator('.row--detail:not([hidden]) [part="detail"]')).toHaveCount(0)
})

test('c2-table is flat: group-by and children-field are not its attributes, and it has no group API', async ({ page, renderScenario }) => {
  await renderScenario(orders('group-by="customer" children-field="children"'))
  await expect(table(page).getByRole('grid')).toBeVisible()
  await expect(table(page).locator('.row--group')).toHaveCount(0)
  await expect(table(page).locator('.row--body')).toHaveCount(4)
  const api = await table(page).evaluate((element) => ({ getGroups: 'getGroups' in element, expandRow: 'expandRow' in element, groupBy: 'groupBy' in element }))
  expect(api).toEqual({ getGroups: false, expandRow: false, groupBy: false })
})

test('with 50,000 rows the window is the same with the feature off, on, and on with nothing open', async ({ page, renderScenario }) => {
  await generated(page, renderScenario, 50_000)
  await scrollTo(page, 400_000)
  // The scroll event that moves the window comes a frame later.
  await expect.poll(async () => (await layout(page)).first).not.toBe('')
  const off = await layout(page)
  await props(table(page), { detailHeight: 200 })
  const on = await layout(page)
  await props(table(page), { expandedDetails: [] })
  const empty = await layout(page)
  expect(off.rendered).toBeLessThan(40)
  expect({ rendered: on.rendered, first: on.first, scrollHeight: on.scrollHeight }).toEqual({
    rendered: off.rendered,
    first: off.first,
    scrollHeight: off.scrollHeight,
  })
  expect({ rendered: empty.rendered, first: empty.first, scrollHeight: empty.scrollHeight }).toEqual({
    rendered: off.rendered,
    first: off.first,
    scrollHeight: off.scrollHeight,
  })
})

test('open panels add their height to the scroll and the rows stay windowed around them', async ({ page, renderScenario }) => {
  await generated(page, renderScenario, 5_000, { detailHeight: 200, expandedDetails: ['3', '40', '4000'] })
  const start = await layout(page)
  const { rowHeight, headerHeight } = start
  expect(start.scrollHeight).toBe(Math.round(headerHeight + 5_000 * rowHeight + 3 * 200))
  expect(start.rendered).toBeLessThan(40)

  // Row n starts `n * rowHeight` down, plus 200 for each panel open above it.
  const cases: [number, string][] = [
    [0, '0'],
    [4 * rowHeight + 50, 'detail:3'],
    [4 * rowHeight + 200 + 2 * rowHeight, '6'],
    [41 * rowHeight + 200 + 150, 'detail:40'],
    [1_000 * rowHeight + 400, '1000'],
    [4_500 * rowHeight + 600, '4500'],
  ]
  for (const [top, first] of cases) {
    await scrollTo(page, top)
    await expect.poll(async () => (await layout(page)).first, { message: `scrollTop ${top}` }).toBe(first)
    const shown = await layout(page)
    expect(shown.gapTop, `rows reach the header at ${top}`).toBeLessThanOrEqual(0)
    expect(shown.gapBottom, `rows reach the bottom at ${top}`).toBeLessThanOrEqual(0)
    expect(shown.rendered, `window at ${top}`).toBeLessThan(40)
    expect(shown.scrollHeight).toBe(start.scrollHeight)
  }

  // The keyboard brings a row below the panels into view at its real offset.
  await scrollTo(page, 0)
  await table(page).evaluate((element: HTMLElement & { scrollToIndex(index: number): void }) => element.scrollToIndex(60))
  await expect(table(page).locator('.row--body[data-row-key="60"]')).toBeInViewport()
})
