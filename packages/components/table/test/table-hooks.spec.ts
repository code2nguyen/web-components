import { test, expect, props } from '../../../../tests/component-fixture'

const PEOPLE = [
  { id: '1', name: 'Ada Lovelace', team: 'Analytics', status: 'ok', score: 128000 },
  { id: '2', name: 'Grace Hopper', team: 'Compilers', status: 'failed', score: 96500 },
  { id: '3', name: 'Alan Turing', team: 'Research', status: 'ok', score: 87200 },
]

type TableHost = HTMLElement & {
  rows: unknown[]
  columns: unknown[]
  updateComplete: Promise<boolean>
  isVirtualized: boolean
  renderedRange: { start: number; end: number; keys: string[]; rows: { line: number; key: string; row: unknown }[] }
}

test('a part on what renderCell returns is reachable as c2-table::part()', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-table style="height:240px;width:520px" row-key="id"></c2-table>`)
  const host = page.locator('c2-table')
  await host.evaluate(async (element, rows) => {
    const table = element as TableHost
    table.columns = [
      { field: 'name', header: 'Name' },
      {
        field: 'status',
        header: 'Status',
        renderCell: ({ value }: { value: unknown }) => {
          const badge = document.createElement('span')
          badge.setAttribute('part', `badge badge-${String(value)}`)
          badge.textContent = String(value)
          return badge
        },
      },
    ]
    table.rows = rows
    await table.updateComplete
  }, PEOPLE)
  await page.addStyleTag({
    content: 'c2-table::part(badge){border:1px solid rgb(1, 2, 3)}c2-table::part(badge-failed){color:rgb(200, 0, 0)}',
  })
  const badges = host.locator('[part~="badge"]')
  await expect(badges).toHaveCount(3)
  await expect(badges.nth(0)).toHaveCSS('border-top-color', 'rgb(1, 2, 3)')
  await expect(badges.nth(1)).toHaveCSS('color', 'rgb(200, 0, 0)')
  await expect(badges.nth(0)).not.toHaveCSS('color', 'rgb(200, 0, 0)')
})

test('rowPart adds part names to a row from its data, so a stylesheet can tint it', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-table style="height:240px;width:520px" row-key="id" selection="single" value="1">
    <c2-table-column field="name" header="Name"></c2-table-column>
  </c2-table>`)
  const host = page.locator('c2-table')
  await host.evaluate(async (element, rows) => {
    const table = element as TableHost & { rowPart: (context: { row: { status: string; id: string } }) => unknown }
    table.rowPart = ({ row }) => (row.status === 'failed' ? 'row-failed' : row.id === '3' ? ['row-last', 'row-plain'] : undefined)
    table.rows = rows
    await table.updateComplete
  }, PEOPLE)
  await page.addStyleTag({ content: 'c2-table::part(row-failed){background:rgb(250, 10, 10)}c2-table::part(row-last){background:rgb(10, 10, 250)}' })
  const rows = host.locator('.row--body')
  await expect(rows.nth(0)).toHaveAttribute('part', 'row row-selected')
  await expect(rows.nth(1)).toHaveAttribute('part', 'row row-failed')
  await expect(rows.nth(1)).toHaveCSS('background-color', 'rgb(250, 10, 10)')
  await expect(rows.nth(2)).toHaveAttribute('part', 'row row-last row-plain')
  await expect(rows.nth(2)).toHaveCSS('background-color', 'rgb(10, 10, 250)')

  // The resolver is re-run when the data changes.
  await props(host, { rows: PEOPLE.map((row) => ({ ...row, status: 'failed' })) })
  await expect(rows.nth(0)).toHaveAttribute('part', 'row row-selected row-failed')
})

test('wrap lets body cells grow to their text and turns virtualization off', async ({ page, renderScenario }) => {
  const long = 'A very long description that cannot possibly fit on a single line of a narrow column, so it has to wrap.'
  const rows = Array.from({ length: 150 }, (_, index) => ({ id: String(index + 1), name: `Row ${index + 1}`, note: index === 0 ? long : 'short' }))
  await renderScenario(`<c2-table style="height:320px;width:420px" row-key="id" virtual="always">
    <c2-table-column field="name" header="Name" width="120px"></c2-table-column>
    <c2-table-column field="note" header="Note" width="200px"></c2-table-column>
  </c2-table>`)
  const host = page.locator('c2-table')
  await props(host, { rows })
  await expect(host).toHaveJSProperty('isVirtualized', true)
  const body = host.locator('.row--body')
  expect(await body.count()).toBeLessThan(150)
  const firstHeight = async () => (await body.first().boundingBox())!.height

  await props(host, { wrap: true })
  await expect(host).toHaveJSProperty('isVirtualized', false)
  await expect(body).toHaveCount(150)
  const content = body.first().locator('.cell-content').nth(1)
  await expect(content).toHaveCSS('white-space', 'normal')
  await expect(body.first().locator('.cell').nth(1)).toHaveCSS('align-items', 'flex-start')
  expect(await firstHeight()).toBeGreaterThan(60)
  // A one-line row keeps the themed minimum height.
  const plain = (await body.nth(1).boundingBox())!.height
  expect(plain).toBeGreaterThanOrEqual(36)
  expect(plain).toBeLessThanOrEqual(38)

  // Keyboard movement still scrolls a far row into view without the uniform-height arithmetic.
  await body.first().locator('.cell').first().click()
  await page.keyboard.press('Control+End')
  await expect(host.locator('.row--body[aria-rowindex="151"]')).toBeInViewport()

  await props(host, { wrap: false })
  await expect(host).toHaveJSProperty('isVirtualized', true)
  await expect(content).toHaveCSS('white-space', 'nowrap')
})

// A framework fills a `cell-slot` column for the rendered window only: `range-change` reports the lines whose slots
// exist (`detail.rows`), and a child for a line outside the window is simply left unassigned.
test('cell-slot children are needed only for the window range-change reports', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-table style="height:320px;width:420px" row-key="id"></c2-table>`)
  const host = page.locator('c2-table')
  await host.evaluate(async (element) => {
    const table = element as TableHost
    // What a framework's keyed list does: one child per reported row, identified by its line and key.
    const sync = (rendered: { line: number; key: string }[]) => {
      const wanted = new Map(rendered.map((entry) => [`${entry.line}:${entry.key}`, entry]))
      for (const child of [...table.querySelectorAll<HTMLElement>('[slot^="cell:"]')]) {
        if (!wanted.has(child.dataset.id!)) child.remove()
        else wanted.delete(child.dataset.id!)
      }
      for (const [id, { line, key }] of wanted) {
        const button = document.createElement('button')
        button.slot = `cell:${line}:action`
        button.dataset.id = id
        button.textContent = `Act ${key}`
        table.append(button)
      }
    }
    table.addEventListener('range-change', (event) => sync((event as CustomEvent<{ rows: { line: number; key: string }[] }>).detail.rows))
    table.columns = [
      { field: 'name', header: 'Name' },
      { field: 'action', header: 'Action', cellSlot: true },
    ]
    table.rows = Array.from({ length: 5000 }, (_, index) => ({ id: String(index + 1), name: `Row ${index + 1}` }))
    await table.updateComplete
  })
  await expect(host).toHaveJSProperty('isVirtualized', true)
  await expect(page.getByRole('button', { name: 'Act 1', exact: true })).toBeVisible()
  const counts = () =>
    host.evaluate((element) => {
      const children = [...element.querySelectorAll('[slot^="cell:"]')]
      return { total: children.length, unassigned: children.filter((child) => !child.assignedSlot).length }
    })
  const initial = await counts()
  expect(initial.total).toBeGreaterThan(0)
  expect(initial.total).toBeLessThan(60)
  expect(initial.unassigned).toBe(0)
  const range = await host.evaluate((element) => (element as TableHost).renderedRange)
  expect(range.rows.length).toBe(initial.total)
  expect(range.keys).toEqual(range.rows.map((entry) => entry.key))
  expect(range.rows[0]).toMatchObject({ line: 0, key: '1' })

  // Scroll the viewport itself, as a user would: three thousand rows down, whatever height the theme gives a row.
  await host.evaluate((element) => {
    const viewport = element.shadowRoot!.querySelector('.viewport')!
    viewport.scrollTop = 3000 * element.shadowRoot!.querySelector('.row--body')!.getBoundingClientRect().height
  })
  await expect(page.getByRole('button', { name: 'Act 3002', exact: true })).toBeInViewport()
  await expect(page.getByRole('button', { name: 'Act 1', exact: true })).toHaveCount(0)
  const scrolled = await counts()
  expect(scrolled.total).toBeLessThan(60)
  expect(scrolled.unassigned).toBe(0)

  // A stray child for a line outside the window is unused rather than an error, and joins its cell once in view.
  await host.evaluate((element) => {
    const stray = document.createElement('b')
    stray.slot = 'cell:9:action'
    stray.dataset.id = '9:10'
    stray.textContent = 'stray'
    element.append(stray)
  })
  await expect(page.getByText('stray')).toBeHidden()
  await host.evaluate((element) => {
    element.shadowRoot!.querySelector('.viewport')!.scrollTop = 0
  })
  await expect(page.getByText('stray')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Act 10', exact: true })).toHaveCount(0)
})

// A slot's line is the line `range-change` reports: the page offset is included, and group rows take lines of their
// own without being reported.
test('cell-slot lines match range-change with pagination and grouping', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-table style="height:320px;width:520px" row-key="id" page-size="2">
    <c2-table-column field="name" header="Name" width="200px"></c2-table-column>
    <c2-table-column field="note" header="Note" width="200px" cell-slot></c2-table-column>
    <b slot="cell:2:note">paged</b>
  </c2-table>`)
  const host = page.locator('c2-table')
  await props(host, { rows: PEOPLE })
  await props(host, { page: 2 })
  const slottedRowKey = () => page.getByText('paged').evaluate((node) => (node as HTMLElement).assignedSlot?.closest<HTMLElement>('.row')?.dataset.rowKey)
  await expect.poll(slottedRowKey).toBe('3')
  expect(await host.evaluate((element) => (element as TableHost).renderedRange)).toMatchObject({
    start: 2,
    end: 3,
    keys: ['3'],
    rows: [{ line: 2, key: '3' }],
  })

  await props(host, { pageSize: 0, page: 1, groupBy: ['team'] })
  await expect(host.locator('.row--group')).toHaveCount(3)
  const grouped = await host.evaluate((element) => (element as TableHost).renderedRange.rows.map(({ line, key }) => `${line}:${key}`))
  expect(grouped).toEqual(['1:1', '3:2', '5:3'])
  await host.evaluate((element) => {
    element.querySelector('[slot="cell:2:note"]')!.slot = 'cell:3:note'
  })
  await expect.poll(slottedRowKey).toBe('2')
})

// Hydration order: a server-rendered (or framework-rendered) action exists in the light DOM before the element is
// upgraded, and `rows` may have been written as a plain property before the class existed.
test('a slotted cell action works with mouse and keyboard whatever the upgrade order', async ({ page, renderScenario }) => {
  await renderScenario(`<div id="mount"></div>`)
  await page.evaluate((rows) => {
    const clicks: string[] = []
    ;(window as unknown as { clicks: string[] }).clicks = clicks
    // An inert document does not upgrade custom elements, so this is the markup a server sent before the module ran.
    const inert = document.implementation.createHTMLDocument('')
    const table = inert.createElement('c2-table') as TableHost
    table.setAttribute('row-key', 'id')
    table.style.cssText = 'display:block;height:240px;width:520px'
    table.innerHTML = '<button slot="cell:1:action" type="button">Acknowledge</button>'
    table.rows = rows
    table.columns = [
      { field: 'name', header: 'Name' },
      { field: 'action', header: 'Action', cellSlot: true },
    ]
    table.querySelector('button')!.addEventListener('click', () => clicks.push('early'))
    document.getElementById('mount')!.append(document.adoptNode(table))
  }, PEOPLE)
  const host = page.locator('c2-table')
  await expect(host).toHaveJSProperty('rows.1.name', 'Grace Hopper')
  const early = page.getByRole('button', { name: 'Acknowledge' })
  await expect(early).toBeVisible()
  await early.click()
  await expect(early).toBeFocused()
  // Enter and Space belong to the focused control, not to the grid's own navigation and selection.
  await page.keyboard.press('Enter')
  await page.keyboard.press(' ')
  expect(await page.evaluate(() => (window as unknown as { clicks: string[] }).clicks)).toEqual(['early', 'early', 'early'])

  // A child added after the rows rendered joins its cell straight away.
  await host.evaluate((element) => {
    const late = document.createElement('button')
    late.slot = 'cell:2:action'
    late.type = 'button'
    late.textContent = 'Open'
    late.addEventListener('click', () => (window as unknown as { clicks: string[] }).clicks.push('late'))
    element.append(late)
  })
  const late = page.getByRole('button', { name: 'Open' })
  await expect(late).toBeVisible()
  await late.focus()
  await page.keyboard.press('Enter')
  expect(await page.evaluate(() => (window as unknown as { clicks: string[] }).clicks)).toEqual(['early', 'early', 'early', 'late'])
})

test('an input rendered in a cell keeps its own arrow keys', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-table style="height:240px;width:520px" row-key="id">
    <c2-table-column field="name" header="Name" width="200px"></c2-table-column>
    <c2-table-column field="note" header="Note" width="200px" cell-slot></c2-table-column>
    <input slot="cell:0:note" aria-label="Note for Ada" value="abc" />
  </c2-table>`)
  await props(page.locator('c2-table'), { rows: PEOPLE })
  const input = page.getByRole('textbox', { name: 'Note for Ada' })
  await input.click()
  await page.keyboard.press('Home')
  await page.keyboard.press('ArrowRight')
  await expect(input).toBeFocused()
  expect(await input.evaluate((element) => (element as HTMLInputElement).selectionStart)).toBe(1)
})
