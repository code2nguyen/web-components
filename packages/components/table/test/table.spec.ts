import type { Page } from '@playwright/test'
import { test, expect, props, watch, accessible } from '../../../../tests/component-fixture'

const PEOPLE = [
  { id: '1', name: 'Ada Lovelace', team: 'Analytics', score: 128000 },
  { id: '2', name: 'Grace Hopper', team: 'Compilers', score: 96500 },
  { id: '3', name: 'Alan Turing', team: 'Research', score: 87200 },
]

const rows = JSON.stringify(PEOPLE).replace(/'/g, '&#39;')

const table = (attributes = '', columns = '') => `<c2-table style="height:240px;width:520px" row-key="id" rows='${rows}' ${attributes}>
  ${
    columns ||
    `<c2-table-column field="name" header="Name" width="200px"></c2-table-column>
  <c2-table-column field="team" header="Team" width="200px"></c2-table-column>
  <c2-table-column field="score" header="Score" width="200px" align="end" format="number"></c2-table-column>`
  }
</c2-table>`

test('renders a grid of the rows and columns it is given', async ({ page, renderScenario }) => {
  await renderScenario(table())
  await expect(page.getByRole('grid')).toBeVisible()
  await expect(page.getByRole('columnheader')).toHaveCount(3)
  await expect(page.getByRole('row')).toHaveCount(4)
  await expect(page.getByRole('gridcell').filter({ hasText: '128,000' })).toBeVisible()
  await accessible(page)
})

test('a pinned column stays put, header and cells together, while the rest scrolls', async ({ page, renderScenario }) => {
  await renderScenario(
    table(
      '',
      `<c2-table-column field="name" header="Name" width="220px" pinned="start"></c2-table-column>
  <c2-table-column field="team" header="Team" width="320px"></c2-table-column>
  <c2-table-column field="score" header="Score" width="320px" align="end" format="number" pinned="end"></c2-table-column>`,
    ),
  )
  const offsets = () =>
    page.locator('c2-table').evaluate((element) => {
      const root = element.shadowRoot!
      const position = (selector: string) => getComputedStyle(root.querySelector(selector)!).position
      const left = (selector: string) => Math.round(root.querySelector(selector)!.getBoundingClientRect().left)
      return {
        headerPosition: position('.row--header .cell--pinned'),
        cellPosition: position('.row:not(.row--header) .cell--pinned'),
        headerLeft: left('.row--header .cell--pinned'),
        cellLeft: left('.row:not(.row--header) .cell--pinned'),
      }
    })

  const before = await offsets()
  expect(before.headerPosition).toBe('sticky')
  expect(before.cellPosition).toBe('sticky')

  await page.locator('c2-table').evaluate((element) => {
    const viewport = element.shadowRoot!.querySelector('[part="viewport"]')!
    viewport.scrollLeft = 200
  })

  const after = await offsets()
  // The pinned column does not move, and its header never parts company with its cells.
  expect(after.headerLeft).toBe(before.headerLeft)
  expect(after.cellLeft).toBe(before.cellLeft)
  expect(after.headerLeft).toBe(after.cellLeft)
})

test('sort="field:asc" orders the rows before any click', async ({ page, renderScenario }) => {
  await renderScenario(table('sortable sort="score:asc"'))
  await expect(page.getByRole('row').nth(1)).toContainText('Alan Turing')

  // asc, then desc, then back to the order the rows came in.
  await page.getByRole('columnheader', { name: 'Score' }).click()
  await expect(page.getByRole('row').nth(1)).toContainText('Ada Lovelace')
  await page.getByRole('columnheader', { name: 'Score' }).click()
  await expect(page.getByRole('row').nth(1)).toContainText('Ada Lovelace')
  await expect(page.locator('c2-table')).toHaveJSProperty('sortModel', [])
})

test('checkbox selection starts from value and adds to it', async ({ page, renderScenario }) => {
  await renderScenario(table('selection="multiple" checkbox-selection value="2"'))
  const host = page.locator('c2-table')
  await watch(host, 'selection-change')
  await expect(page.locator('[role="row"][aria-selected="true"]')).toHaveCount(1)

  // The checkbox adds to the selection; a plain row click replaces it.
  await page.getByRole('checkbox').nth(3).click()
  await expect(host).toHaveJSProperty('value', ['2', '3'])
  await expect(page.locator('[role="row"][aria-selected="true"]')).toHaveCount(2)

  await page.getByRole('row').nth(1).click()
  await expect(host).toHaveJSProperty('value', ['1'])
})

test('a table-level sortable makes every column sortable', async ({ page, renderScenario }) => {
  await renderScenario(table('sortable'))
  // Nothing is sorted until a header is clicked, and no column carries `sortable` of its own.
  await expect(page.getByRole('columnheader', { name: 'Score' })).toHaveAttribute('aria-sort', 'none')

  await page.getByRole('columnheader', { name: 'Score' }).click()
  await expect(page.getByRole('columnheader', { name: 'Score' })).toHaveAttribute('aria-sort', 'ascending')
  await expect(page.getByRole('row').nth(1)).toContainText('Alan Turing')

  await page.getByRole('columnheader', { name: 'Score' }).click()
  await expect(page.getByRole('columnheader', { name: 'Score' })).toHaveAttribute('aria-sort', 'descending')
  await expect(page.getByRole('row').nth(1)).toContainText('Ada Lovelace')
})

test('a single column can be sortable while the table is not', async ({ page, renderScenario }) => {
  await renderScenario(
    table(
      '',
      `<c2-table-column field="name" header="Name" width="200px"></c2-table-column>
  <c2-table-column field="score" header="Score" width="200px" align="end" format="number" sortable></c2-table-column>`,
    ),
  )
  // The attribute is presence-based: only the column that carries it sorts.
  await expect(page.getByRole('columnheader', { name: 'Name' })).not.toHaveAttribute('aria-sort', /.*/)
  await expect(page.getByRole('columnheader', { name: 'Score' })).toHaveAttribute('aria-sort', 'none')

  await page.getByRole('columnheader', { name: 'Score' }).click()
  await expect(page.getByRole('row').nth(1)).toContainText('Alan Turing')
})

test('the toolbar and footer slots appear only once something is in them', async ({ page, renderScenario }) => {
  await renderScenario(table())
  await expect(page.locator('c2-table').locator('[slot="toolbar"]')).toHaveCount(0)

  await renderScenario(
    table().replace('>\n  <c2-table-column', '>\n  <div slot="toolbar">Team scorecard</div>\n  <div slot="footer">3 people</div>\n  <c2-table-column'),
  )
  await expect(page.getByText('Team scorecard')).toBeVisible()
  await expect(page.getByText('3 people')).toBeVisible()
})

test('loading, empty and error replace the body', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-table style="height:240px;width:520px" loading rows='[]'>
    <c2-table-column field="name" header="Name"></c2-table-column>
  </c2-table>`)
  await expect(page.locator('c2-table').locator('[slot="loading"]')).toHaveCount(0)
  await expect(page.getByRole('grid')).toBeVisible()

  await renderScenario(`<c2-table style="height:240px;width:520px" rows='[]' empty-message="Nothing here yet">
    <c2-table-column field="name" header="Name"></c2-table-column>
  </c2-table>`)
  await expect(page.getByText('Nothing here yet')).toBeVisible()

  await renderScenario(`<c2-table style="height:240px;width:520px" rows='[]' error="The service did not answer">
    <c2-table-column field="name" header="Name"></c2-table-column>
  </c2-table>`)
  await expect(page.getByText('The service did not answer')).toBeVisible()
})

// --- Paging with a slotted c2-pagination ---------------------------------------------------------------------------
// The pager is never imported by the table: it announces itself when it connects and the table feeds it through the
// `@c2n/core` pager context. These assert the composition end to end, from the request contract to the rendered rows.

type PagedOptions = { total: number; pageSize: number; failAt?: number; manual?: boolean; pager?: boolean }

async function paged(page: Page, options: PagedOptions) {
  await page.evaluate((given) => window.tableScenario.usePagedSource(given), options)
}

const requests = (page: Page) => page.evaluate(() => window.tableScenario.requests())

test('a paged table asks its source for one page and renders it', async ({ page, renderScenario }) => {
  await renderScenario('')
  await paged(page, { total: 137, pageSize: 10 })
  expect(await requests(page)).toEqual([{ start: 0, count: 10, sort: [] }])
  await expect(page.locator('c2-table').locator('.row:not(.row--header):not(.row--state)')).toHaveCount(10)
  await accessible(page)
})

test('the slotted pager shows the table state without being configured', async ({ page, renderScenario }) => {
  await renderScenario('')
  await paged(page, { total: 137, pageSize: 10 })
  const pager = page.locator('c2-pagination')
  // Nothing in the markup sets these; they can only have come through the context.
  await expect(pager).toHaveJSProperty('totalItems', 137)
  await expect(pager).toHaveJSProperty('pageSize', 10)
  await expect(pager).toHaveJSProperty('page', 1)
  await expect(page.locator('c2-table')).toContainText('1–10 of 137')
})

test('moving the pager moves the table and asks for that page only', async ({ page, renderScenario }) => {
  await renderScenario('')
  await paged(page, { total: 137, pageSize: 10 })
  const table = page.locator('c2-table')
  await watch(table, 'page-change')
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(table).toHaveJSProperty('page', 2)
  expect((await requests(page)).at(-1)).toEqual({ start: 10, count: 10, sort: [] })
  await expect(table).toContainText('11–20 of 137')
  // The table speaks for its pager: one event, from the table, not two.
  await expect(table).toHaveAttribute(
    'data-events',
    JSON.stringify([{ page: 2, previousPage: 1, pageSize: 10, pageCount: 14, start: 10, count: 10, totalRows: 137 }]),
  )
})

test('setting page from script drives the pager', async ({ page, renderScenario }) => {
  await renderScenario('')
  await paged(page, { total: 137, pageSize: 10 })
  await props(page.locator('c2-table'), { page: 5 })
  await expect(page.locator('c2-pagination')).toHaveJSProperty('page', 5)
  expect((await requests(page)).at(-1)).toEqual({ start: 40, count: 10, sort: [] })
})

test('sorting a paged table starts again at page one', async ({ page, renderScenario }) => {
  await renderScenario('')
  await paged(page, { total: 137, pageSize: 10 })
  await props(page.locator('c2-table'), { page: 6 })
  await page.getByRole('columnheader', { name: 'Score' }).click()
  await expect(page.locator('c2-table')).toHaveJSProperty('page', 1)
  const last = (await requests(page)).at(-1)!
  expect(last.start).toBe(0)
  expect(last.sort).toEqual([{ field: 'score', direction: 'asc' }])
})

test('a page that no longer exists settles on the last real one', async ({ page, renderScenario }) => {
  await renderScenario('')
  await paged(page, { total: 137, pageSize: 10 })
  await props(page.locator('c2-table'), { page: 14 })
  await page.evaluate(() => window.tableScenario.setTotal(35))
  await page.locator('c2-table').evaluate((table) => (table as HTMLElement & { refresh(): void }).refresh())
  await expect(page.locator('c2-table')).toHaveJSProperty('page', 4)
})

test('a page still loading shows skeletons, not the empty state', async ({ page, renderScenario }) => {
  await renderScenario('')
  await paged(page, { total: 137, pageSize: 10, manual: true })
  await page.evaluate(() => window.tableScenario.release())
  await props(page.locator('c2-table'), { page: 3 })
  const table = page.locator('c2-table')
  await expect(table.locator('.skeleton').first()).toBeVisible()
  await expect(table).not.toContainText('No rows')
  await page.evaluate(() => window.tableScenario.release())
  await expect(table.locator('.row:not(.row--header):not(.row--state)')).toHaveCount(10)
})

test('a failed page shows the error, and asking for another clears it', async ({ page, renderScenario }) => {
  await renderScenario('')
  await paged(page, { total: 137, pageSize: 10, failAt: 10 })
  const table = page.locator('c2-table')
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(table).toContainText('The request failed')
  // `error` blocks every further fetch, so moving on has to clear it or the table is stuck for good.
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(table).toHaveJSProperty('error', '')
  await expect(table.locator('.row:not(.row--header):not(.row--state)')).toHaveCount(10)
})

const ROWS = '[{"id":"1","name":"Ada"},{"id":"2","name":"Grace"},{"id":"3","name":"Alan"},{"id":"4","name":"Radia"},{"id":"5","name":"Katherine"}]'

test('a table holding rows pages them in place, driven by the slotted pager', async ({ page, renderScenario }) => {
  await renderScenario(`
    <c2-table row-key="id" rows='${ROWS}' style="height: 220px; width: 460px">
      <c2-table-column field="name" header="Name"></c2-table-column>
      <c2-pagination slot="footer" variant="compact" page-size="2" hide-page-size></c2-pagination>
    </c2-table>`)
  const table = page.locator('c2-table')
  const rows = table.locator('.row:not(.row--header):not(.row--state)')
  // The pager's own `page-size` is what turned paging on; nothing else is configured.
  await expect(table).toHaveJSProperty('paginated', true)
  await expect(table).toHaveJSProperty('pageSize', 2)
  await expect(page.locator('c2-pagination')).toHaveJSProperty('totalItems', 5)
  await expect(rows).toHaveCount(2)
  await expect(table).toContainText('Ada')

  await page.getByRole('button', { name: 'Next' }).click()
  await expect(table).toContainText('Alan')
  await expect(table).not.toContainText('Ada')

  // The last page is short, and the pager knows where it ends.
  await props(table, { page: 3 })
  await expect(rows).toHaveCount(1)
  await expect(table).toContainText('Katherine')
  await expect(page.getByRole('button', { name: 'Next' })).toBeDisabled()
  await accessible(page)
})

test('sorting a client-paged table re-slices from the top', async ({ page, renderScenario }) => {
  await renderScenario(`
    <c2-table row-key="id" sortable rows='${ROWS}' style="height: 220px; width: 460px">
      <c2-table-column field="name" header="Name" sortable></c2-table-column>
      <c2-pagination slot="footer" variant="compact" page-size="2" hide-page-size></c2-pagination>
    </c2-table>`)
  const table = page.locator('c2-table')
  await props(table, { page: 3 })
  await page.getByRole('columnheader', { name: 'Name' }).click()
  await expect(table).toHaveJSProperty('page', 1)
  await expect(table).toContainText('Ada')
})

test('a resizable column edge reads as a divider, and drags the column', async ({ page, renderScenario }) => {
  await renderScenario(`
    <c2-table row-key="id" resizable rows='[{"id":"1","name":"Ada","team":"Analytics"}]' style="height: 160px; width: 420px">
      <c2-table-column field="name" header="Name" width="1fr"></c2-table-column>
      <c2-table-column field="team" header="Team" width="1fr"></c2-table-column>
    </c2-table>`)
  const table = page.locator('c2-table')
  const handle = () =>
    table.evaluate((element) => {
      const resizer = element.shadowRoot!.querySelector('.resizer')!
      const line = getComputedStyle(resizer, '::after')
      return { grab: Math.round(resizer.getBoundingClientRect().width), width: line.width, height: line.height, color: line.backgroundColor }
    })

  // At rest it is a hairline inset from the header's edges — the divider between two columns, not a slab of colour.
  // Widths are compared as numbers: a transition lands on sub-pixel values and the engines round differently.
  const rest = await handle()
  expect(rest.grab).toBe(9)
  expect(parseFloat(rest.width)).toBeLessThan(1.5)
  expect(parseFloat(rest.height)).toBeLessThan(30)
  expect(rest.color).toBe('rgb(228, 228, 231)')

  const box = await table.evaluate((element) => {
    const rect = element.shadowRoot!.querySelector('.resizer')!.getBoundingClientRect()
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
  })
  await page.mouse.move(box.x, box.y)
  await expect.poll(async () => parseFloat((await handle()).height)).toBeGreaterThan(34)
  const hovered = await handle()
  expect(parseFloat(hovered.width)).toBeGreaterThan(1.5)
  // The accent, whichever way an engine rounds it mid-transition — WebKit lands a channel or two off.
  const [red, , blue] = hovered.color.match(/\d+/g)!.map(Number)
  expect(blue).toBeGreaterThan(red + 100)

  await watch(table, 'column-resize')
  await page.mouse.down()
  await page.mouse.move(box.x + 60, box.y, { steps: 5 })
  await page.mouse.up()
  const events = JSON.parse((await table.getAttribute('data-events')) ?? '[]') as { field: string; width: number }[]
  expect(events).toHaveLength(1)
  expect(events[0].field).toBe('name')
  expect(events[0].width).toBeGreaterThan(60)
})
