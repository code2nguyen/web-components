import type { Locator, Page } from '@playwright/test'
import type { Flow, FlowEdge, FlowNode } from '../src/flow'
import { test, expect, accessible } from '../../../../tests/component-fixture'

// A database schema: tables are nodes, columns are rows, foreign keys are edges between rows.
const NODES: FlowNode[] = [
  {
    id: 'customers',
    label: 'customers',
    rows: [
      { id: 'id', label: 'id', meta: 'uuid' },
      { id: 'email', label: 'email', meta: 'text' },
    ],
  },
  {
    id: 'orders',
    label: 'orders',
    rows: [
      { id: 'id', label: 'id', meta: 'uuid' },
      { id: 'customer_id', label: 'customer_id', meta: 'uuid', details: { References: 'customers.id', 'On delete': 'cascade' } },
      { id: 'billing_id', label: 'billing_id', meta: 'uuid' },
      { id: 'parent_id', label: 'parent_id', meta: 'uuid' },
    ],
  },
]

const EDGES: FlowEdge[] = [
  { source: 'customers', sourcePort: 'id', target: 'orders', targetPort: 'customer_id', sourceMarker: 'one', targetMarker: 'many' },
  { source: 'customers', sourcePort: 'id', target: 'orders', targetPort: 'billing_id', sourceMarker: 'one', targetMarker: 'zero-many' },
]

interface Recorded {
  type: string
  detail: Record<string, unknown>
}

function flow({ nodes = NODES, edges = EDGES, attributes = 'edge-type="step"' }: { nodes?: FlowNode[]; edges?: FlowEdge[]; attributes?: string } = {}) {
  return `<c2-flow aria-label="Schema" nodes='${JSON.stringify(nodes)}' edges='${JSON.stringify(edges)}' ${attributes}></c2-flow>`
}

const host = (page: Page) => page.locator('c2-flow')
const node = (page: Page, id: string) => page.locator(`c2-flow .node[data-node-id="${id}"]`)
const row = (page: Page, id: string, port: string) => node(page, id).locator(`.row[data-flow-port="${port}"]`)

async function box(locator: Locator) {
  const rect = await locator.boundingBox()
  if (!rect) throw new Error('Expected a visible element')
  return rect
}

/** Per drawn edge line: its first and last point, in page pixels. */
const ends = (page: Page) =>
  host(page).evaluate((element) =>
    [...element.shadowRoot!.querySelectorAll<SVGPathElement>('path.edge:not(.edge--draft)')].map((path) => {
      const at = (l: number) => {
        const p = path.getPointAtLength(l).matrixTransform(path.getScreenCTM()!)
        return { x: p.x, y: p.y }
      }
      return { start: at(0), end: at(path.getTotalLength()) }
    }),
  )

const near = (a: number, b: number, tolerance = 1.5) => Math.abs(a - b) < tolerance

/** Renders the flow and waits until every node and its rows are measured, so the edges meet the rows. */
async function render(page: Page, renderScenario: (html: string) => Promise<void>, markup: string) {
  await renderScenario(markup)
  await expect
    .poll(() =>
      host(page).evaluate(async (element: Flow) => {
        await element.updateComplete
        const own = element as unknown as { sizes: Map<string, { width: number; height: number }>; portsDirty: boolean }
        return (
          !own.portsDirty &&
          [...element.shadowRoot!.querySelectorAll<HTMLElement>('.node')].every((el) => {
            const size = own.sizes.get(el.dataset.nodeId!)
            return size?.width === el.offsetWidth && size.height === el.offsetHeight
          })
        )
      }),
    )
    .toBe(true)
}

/** The page-pixel centre line of a row, and its node's two sides. */
async function rowLine(page: Page, id: string, port: string) {
  const [r, n] = [await box(row(page, id, port)), await box(node(page, id))]
  return { y: r.y + r.height / 2, left: n.x, right: n.x + n.width }
}

test('rows are drawn under the label with their meta and icon room, and read with the node', async ({ page, renderScenario }) => {
  const nodes: FlowNode[] = [{ ...NODES[0], rows: [{ id: 'id', label: 'id', meta: 'uuid', icon: '🔑' }, NODES[0].rows![1]] }, NODES[1]]
  await render(page, renderScenario, flow({ nodes }))
  await expect(node(page, 'orders').locator('.row')).toHaveCount(4)
  await expect(row(page, 'orders', 'customer_id').locator('.row-label')).toHaveText('customer_id')
  await expect(row(page, 'orders', 'customer_id').locator('.row-meta')).toHaveText('uuid')
  // A row without an icon keeps the room of one when another row of its node has one, so the labels line up.
  await expect(row(page, 'customers', 'email').locator('.row-icon')).toHaveCount(1)
  await expect(row(page, 'orders', 'id').locator('.row-icon')).toHaveCount(0)
  const [a, b] = [await box(row(page, 'customers', 'id').locator('.row-label')), await box(row(page, 'customers', 'email').locator('.row-label'))]
  expect(near(a.x, b.x)).toBe(true)
  const description = node(page, 'orders').locator('.visually-hidden')
  await expect(description).toContainText('After customers.id through customer_id, customers.id through billing_id.')
  await expect(description).toContainText('Rows: id uuid, customer_id uuid, billing_id uuid, parent_id uuid.')
  await expect(node(page, 'customers').locator('.visually-hidden')).toContainText('Before orders.customer_id through id, orders.billing_id through id.')
  await accessible(page)
})

test('a label on an edge between rows stays with that edge, and one folded row reads in the singular', async ({ page, renderScenario }) => {
  const edges: FlowEdge[] = [
    { ...EDGES[0], label: 'fk' },
    { source: 'customers', target: 'orders' },
  ]
  await render(page, renderScenario, flow({ edges, attributes: 'row-limit="3"' }))
  const description = node(page, 'orders').locator('.visually-hidden')
  await expect(description).toContainText('After customers.id through customer_id, fk; customers.')
  await expect(description).toContainText('1 more row, Shift+Enter shows it.')
})

test('an edge between rows leaves and arrives level with them, on the sides facing each other', async ({ page, renderScenario }) => {
  await render(page, renderScenario, flow())
  const lines = await ends(page)
  expect(lines).toHaveLength(2)
  const [id, customer, billing] = [
    await rowLine(page, 'customers', 'id'),
    await rowLine(page, 'orders', 'customer_id'),
    await rowLine(page, 'orders', 'billing_id'),
  ]
  // customers is left of orders in the LR layout: out of its right side, into the left side of orders.
  expect(near(lines[0].start.x, id.right) && near(lines[0].start.y, id.y)).toBe(true)
  expect(near(lines[0].end.x, customer.left) && near(lines[0].end.y, customer.y)).toBe(true)
  expect(near(lines[1].end.y, billing.y)).toBe(true)
  // One handle per row end, level with its row.
  const handles = node(page, 'orders').locator('.handle--port')
  await expect(handles).toHaveCount(2)
  const handle = await box(handles.first())
  expect(near(handle.y + handle.height / 2, customer.y)).toBe(true)
})

test('the sides follow the nodes: a target to the left is reached by the left side of the source row', async ({ page, renderScenario }) => {
  await render(page, renderScenario, flow())
  await host(page).evaluate(async (element: Flow) => {
    element.setLayout({ orders: { x: 0, y: 0 }, customers: { x: 600, y: 40 } })
    await element.updateComplete
  })
  const [line] = await ends(page)
  const [id, customer] = [await rowLine(page, 'customers', 'id'), await rowLine(page, 'orders', 'customer_id')]
  expect(near(line.start.x, id.left) && near(line.start.y, id.y)).toBe(true)
  expect(near(line.end.x, customer.right) && near(line.end.y, customer.y)).toBe(true)
})

test('an edge names its own row side, and a node can link two of its own rows', async ({ page, renderScenario }) => {
  const edges: FlowEdge[] = [
    { ...EDGES[0], targetSide: 'right' },
    { source: 'orders', sourcePort: 'id', target: 'orders', targetPort: 'parent_id' },
  ]
  await render(page, renderScenario, flow({ edges }))
  const [toRight, self] = await ends(page)
  const [customer, id, parent] = [await rowLine(page, 'orders', 'customer_id'), await rowLine(page, 'orders', 'id'), await rowLine(page, 'orders', 'parent_id')]
  expect(near(toRight.end.x, customer.right) && near(toRight.end.y, customer.y)).toBe(true)
  // A row linked to another row of its node loops round the right side.
  expect(near(self.start.x, id.right) && near(self.start.y, id.y)).toBe(true)
  expect(near(self.end.x, parent.right) && near(self.end.y, parent.y)).toBe(true)
})

test('an edge ends in its markers: crow’s feet in place of the arrow, none at the source by default', async ({ page, renderScenario }) => {
  const edges: FlowEdge[] = [...EDGES, { source: 'customers', target: 'orders' }]
  await render(page, renderScenario, flow({ edges }))
  const marks = page.locator('c2-flow .edge-marks')
  await expect(marks.locator('.marker')).toHaveCount(4)
  await expect(marks.locator('.arrow')).toHaveCount(1)
  await expect(marks.locator('.marker-ring')).toHaveCount(1)
  // The `many` end spreads over the end of the line, at the row it arrives at.
  const [line] = await ends(page)
  const many = await box(marks.locator('.marker').nth(0))
  expect(many.x + many.width).toBeLessThan(line.end.x)
  expect(many.x + many.width).toBeGreaterThan(line.end.x - 8)
  expect(near(many.y + many.height / 2, line.end.y)).toBe(true)
  await host(page).evaluate((element: Flow) => element.style.setProperty('--c2-flow__edge-marker--size', '24px'))
  await expect.poll(async () => (await box(marks.locator('.marker').nth(0))).height).toBeCloseTo(24, 0)
})

test('hovering a row highlights its edges and the row at their far end, and a row with details opens its card', async ({ page, renderScenario }) => {
  await render(page, renderScenario, flow({ attributes: 'edge-type="step" open-delay="0"' }))
  await row(page, 'orders', 'customer_id').hover()
  await expect(page.locator('c2-flow path.edge.is-highlighted')).toHaveCount(1)
  await expect(row(page, 'customers', 'id')).toHaveClass(/is-highlighted/)
  await expect(row(page, 'orders', 'customer_id')).toHaveClass(/is-highlighted/)
  await expect(row(page, 'orders', 'billing_id')).not.toHaveClass(/is-highlighted/)
  const card = page.locator('c2-flow .card')
  await expect(card.locator('.card-title')).toHaveText('orders.customer_id')
  await expect(card.locator('dd').first()).toHaveText('customers.id')
  // A row without details, or a row without edges, shows the node's card and highlights every edge of the node.
  await row(page, 'orders', 'parent_id').hover()
  await expect(card.locator('.card-title')).toHaveText('orders')
  await expect(page.locator('c2-flow path.edge.is-highlighted')).toHaveCount(2)
})

test('a custom body marks its own ports with data-flow-port', async ({ page, renderScenario }) => {
  const nodes: FlowNode[] = NODES.map(({ rows: _rows, ...rest }) => rest)
  await renderScenario(flow({ nodes }))
  await host(page).evaluate(async (element: Flow) => {
    element.renderNode = ({ node }) => {
      const body = document.createElement('div')
      for (const name of ['id', 'customer_id', 'billing_id']) {
        const line = document.createElement('div')
        line.dataset.flowPort = name
        line.className = 'custom-row'
        line.style.height = '30px'
        line.textContent = `${node.label}.${name}`
        body.append(line)
      }
      return body
    }
    await element.updateComplete
  })
  await expect
    .poll(async () => {
      const [line] = await ends(page)
      const target = await box(node(page, 'orders').locator('[data-flow-port="customer_id"]'))
      return near(line.end.y, target.y + target.height / 2)
    })
    .toBe(true)
})

test('a node shows the plain arrow over its label and rows, the hand only on a row grip, the canvas and a drag', async ({ page, renderScenario }) => {
  await render(page, renderScenario, flow({ attributes: 'editable edge-type="step"' }))
  const cursor = (locator: Locator) => locator.evaluate((element) => getComputedStyle(element).cursor)
  const label = node(page, 'orders').locator('.label')
  await expect.poll(() => cursor(label)).toBe('default')
  expect(await cursor(row(page, 'orders', 'customer_id'))).toBe('default')
  expect(await cursor(row(page, 'orders', 'customer_id').locator('.row-grip'))).toBe('grab')
  expect(await host(page).evaluate((element) => getComputedStyle(element.shadowRoot!.querySelector('.stage')!).cursor)).toBe('grab')
  // An application that wants the hand on the whole node says so.
  await host(page).evaluate((element) => element.style.setProperty('--c2-flow__node--cursor', 'grab'))
  expect(await cursor(label)).toBe('grab')
  // A locked node is only clicked.
  await host(page).evaluate(async (element: Flow) => {
    element.locked = true
    await element.updateComplete
  })
  expect(await cursor(node(page, 'orders'))).toBe('pointer')
})

test.describe('row limit', () => {
  // `orders` has four rows; with a limit of 2, `id` and `customer_id` show, `billing_id` too since an edge meets it.
  const markup = (attributes = 'row-limit="2" open-delay="0" storage-key="flow-test:rows"') => flow({ attributes: `edge-type="step" ${attributes}` })
  const more = (page: Page, id: string) => node(page, id).locator('.row-more')

  test('rows past the limit fold into a "+ N more" row; rows an edge meets stay', async ({ page, renderScenario }) => {
    await render(page, renderScenario, markup())
    await expect(node(page, 'orders').locator('.row:not(.row-more)')).toHaveCount(3)
    await expect(row(page, 'orders', 'parent_id')).toHaveCount(0)
    await expect(more(page, 'orders')).toHaveText('+ 1 more')
    // customers has two rows: within its limit, nothing folds.
    await expect(more(page, 'customers')).toHaveCount(0)
    await expect(node(page, 'orders').locator('.visually-hidden')).toContainText('1 more row, Shift+Enter shows it.')
    // Its card lists the folded rows.
    await more(page, 'orders').hover()
    const card = page.locator('c2-flow .card')
    await expect(card.locator('.card-title')).toHaveText('+ 1 more')
    await expect(card.locator('dt')).toHaveText(['parent_id'])
    await accessible(page)
  })

  test('a click on the row, Shift+Enter or the menu shows them all and folds them again', async ({ page, renderScenario }) => {
    await render(page, renderScenario, markup())
    const toggles = await host(page).evaluate((element: Flow) => {
      const seen: unknown[] = []
      element.addEventListener('rows-toggle', ({ detail }) => seen.push(detail))
      ;(element as unknown as { seen: unknown[] }).seen = seen
      return seen.length
    })
    expect(toggles).toBe(0)
    await more(page, 'orders').click()
    await expect(row(page, 'orders', 'parent_id')).toHaveCount(1)
    await expect(more(page, 'orders')).toHaveText('Show fewer')
    // The node grew, and the edges still meet their rows.
    const [line] = await ends(page)
    const customer = await rowLine(page, 'orders', 'customer_id')
    expect(near(line.end.y, customer.y)).toBe(true)
    // Saved with the layout.
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('flow-test:rows') ?? 'null')?.expanded)).toEqual(['orders'])
    await node(page, 'orders').focus()
    await page.keyboard.press('Shift+Enter')
    await expect(row(page, 'orders', 'parent_id')).toHaveCount(0)
    await node(page, 'orders').click({ button: 'right' })
    await page.locator('c2-menu-item[value="flow:toggle-rows"]').click()
    await expect(row(page, 'orders', 'parent_id')).toHaveCount(1)
    expect(await host(page).evaluate((element) => (element as unknown as { seen: unknown[] }).seen)).toEqual([
      { id: 'orders', expanded: true },
      { id: 'orders', expanded: false },
      { id: 'orders', expanded: true },
    ])
  })

  test('a node’s own rowLimit wins, toggleRows() opens it from script, and the open nodes are restored', async ({ page, renderScenario }) => {
    const nodes: FlowNode[] = [{ ...NODES[0], rowLimit: 1 }, NODES[1]]
    await renderScenario('<p>loading</p>')
    await page.evaluate(() => localStorage.setItem('flow-test:rows', JSON.stringify({ v: 1, expanded: ['orders'] })))
    await render(page, renderScenario, flow({ nodes, attributes: 'edge-type="step" row-limit="2" storage-key="flow-test:rows"' }))
    await expect(row(page, 'orders', 'parent_id')).toHaveCount(1)
    await expect(more(page, 'customers')).toHaveText('+ 1 more')
    await host(page).evaluate((element: Flow) => element.toggleRows('customers', true))
    await expect(row(page, 'customers', 'email')).toHaveCount(1)
  })
})

test.describe('reordering rows', () => {
  /** Records `row-move` and answers it as an application reordering `rows` would. */
  async function wireMoves(page: Page) {
    await host(page).evaluate((element: Flow) => {
      const moves: unknown[] = []
      ;(element as unknown as { moves: unknown[] }).moves = moves
      element.addEventListener('row-move', ({ detail }) => {
        moves.push({ ...detail })
        element.nodes = element.nodes.map((node) => {
          if (node.id !== detail.id || !node.rows) return node
          const rows = [...node.rows]
          const [moved] = rows.splice(detail.from, 1)
          rows.splice(detail.to, 0, moved)
          return { ...node, rows }
        })
      })
    })
  }
  const moves = (page: Page) => host(page).evaluate((element) => (element as unknown as { moves: unknown[] }).moves)
  const order = (page: Page, id: string) =>
    node(page, id)
      .locator('.row:not(.row-more)')
      .evaluateAll((rows) => rows.map((row) => (row as HTMLElement).dataset.flowPort))

  test('dragging a row’s grip moves it, live with its edges, and asks for the move on release', async ({ page, renderScenario }) => {
    await render(page, renderScenario, flow({ attributes: 'editable edge-type="step"' }))
    await wireMoves(page)
    await expect(row(page, 'orders', 'id').locator('.row-grip')).toHaveCount(1)
    await row(page, 'orders', 'customer_id').hover()
    const grip = await box(row(page, 'orders', 'customer_id').locator('.row-grip'))
    const last = await box(row(page, 'orders', 'parent_id'))
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2)
    await page.mouse.down()
    await page.mouse.move(grip.x + grip.width / 2, last.y + last.height - 4, { steps: 8 })
    // Drawn in the slot it would land in, and its edge follows it there.
    await expect(row(page, 'orders', 'customer_id')).toHaveClass(/is-moving/)
    expect(await order(page, 'orders')).toEqual(['id', 'billing_id', 'parent_id', 'customer_id'])
    await expect
      .poll(async () => {
        const [line] = await ends(page)
        return near(line.end.y, (await rowLine(page, 'orders', 'customer_id')).y)
      })
      .toBe(true)
    await page.mouse.up()
    expect(await moves(page)).toEqual([{ id: 'orders', row: 'customer_id', from: 1, to: 3 }])
    expect(await order(page, 'orders')).toEqual(['id', 'billing_id', 'parent_id', 'customer_id'])
    await expect(row(page, 'orders', 'customer_id')).not.toHaveClass(/is-moving/)
    // Dragging the row itself, rather than its grip, still moves the node.
    const before = await host(page).evaluate((element: Flow) => element.getLayout().orders)
    const body = await box(row(page, 'orders', 'billing_id').locator('.row-label'))
    await page.mouse.move(body.x + 4, body.y + body.height / 2)
    await page.mouse.down()
    await page.mouse.move(body.x + 64, body.y + 40, { steps: 6 })
    await page.mouse.up()
    expect(await host(page).evaluate((element: Flow) => element.getLayout().orders)).not.toEqual(before)
    expect(await moves(page)).toHaveLength(1)
  })

  test('Escape during a drag puts the row back and asks for nothing', async ({ page, renderScenario }) => {
    await render(page, renderScenario, flow({ attributes: 'editable edge-type="step"' }))
    await wireMoves(page)
    await node(page, 'orders').focus()
    await row(page, 'orders', 'id').hover()
    const grip = await box(row(page, 'orders', 'id').locator('.row-grip'))
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2)
    await page.mouse.down()
    await page.mouse.move(grip.x + grip.width / 2, grip.y + 80, { steps: 6 })
    expect((await order(page, 'orders'))[0]).not.toBe('id')
    await page.keyboard.press('Escape')
    expect(await order(page, 'orders')).toEqual(['id', 'customer_id', 'billing_id', 'parent_id'])
    await page.mouse.up()
    expect(await moves(page)).toEqual([])
  })

  test('R picks a row from the keyboard, Alt+arrows move it, Enter ends', async ({ page, renderScenario }) => {
    await render(page, renderScenario, flow({ attributes: 'editable edge-type="step"' }))
    await wireMoves(page)
    await node(page, 'orders').focus()
    await page.keyboard.press('r')
    await expect(row(page, 'orders', 'id')).toHaveClass(/is-picked/)
    await expect(page.locator('c2-flow [role="status"]')).toContainText('Reordering the rows of orders. id, 1 of 4.')
    await page.keyboard.press('ArrowDown')
    await expect(row(page, 'orders', 'customer_id')).toHaveClass(/is-picked/)
    await page.keyboard.press('Alt+ArrowDown')
    await page.keyboard.press('Alt+ArrowDown')
    expect(await order(page, 'orders')).toEqual(['id', 'billing_id', 'parent_id', 'customer_id'])
    await expect(page.locator('c2-flow [role="status"]')).toHaveText('customer_id moved to 4 of 4.')
    // At the end it goes no further.
    await page.keyboard.press('Alt+ArrowDown')
    await page.keyboard.press('Enter')
    await expect(node(page, 'orders').locator('.row.is-picked')).toHaveCount(0)
    expect(await moves(page)).toEqual([
      { id: 'orders', row: 'customer_id', from: 1, to: 2 },
      { id: 'orders', row: 'customer_id', from: 2, to: 3 },
    ])
  })

  test('clicking another node leaves keyboard reordering; indices count the node’s own rows', async ({ page, renderScenario }) => {
    // A malformed entry in `rows` is skipped when drawn but still counts in the indices of `row-move`.
    const nodes = [NODES[0], { ...NODES[1], rows: [null, ...NODES[1].rows!] }] as unknown as FlowNode[]
    await render(page, renderScenario, flow({ nodes, attributes: 'editable edge-type="step"' }))
    await wireMoves(page)
    await node(page, 'orders').focus()
    await page.keyboard.press('r')
    await expect(row(page, 'orders', 'id')).toHaveClass(/is-picked/)
    await page.keyboard.press('Alt+ArrowDown')
    expect(await moves(page)).toEqual([{ id: 'orders', row: 'id', from: 1, to: 2 }])
    await node(page, 'customers').locator('.label').click()
    await expect(node(page, 'orders').locator('.row.is-picked')).toHaveCount(0)
    await page.keyboard.press('Alt+ArrowDown')
    expect(await moves(page)).toHaveLength(1)
  })

  test('a row’s context menu moves it up and down; folded rows keep their place', async ({ page, renderScenario }) => {
    await render(page, renderScenario, flow({ attributes: 'editable edge-type="step" row-limit="2"' }))
    await wireMoves(page)
    // Shown: id, customer_id, billing_id (linked); folded: parent_id.
    await row(page, 'orders', 'billing_id').hover()
    await row(page, 'orders', 'billing_id').click({ button: 'right' })
    await expect(page.locator('c2-menu-item[value="flow:row-down"]')).toHaveAttribute('disabled', '')
    await page.locator('c2-menu-item[value="flow:row-up"]').click()
    expect(await moves(page)).toEqual([{ id: 'orders', row: 'billing_id', from: 2, to: 1 }])
    expect(await order(page, 'orders')).toEqual(['id', 'billing_id', 'customer_id'])
    // A read-only flow has no grip and no move rows.
    await host(page).evaluate(async (element: Flow) => {
      element.editable = false
      await element.updateComplete
    })
    await expect(node(page, 'orders').locator('.row-grip')).toHaveCount(0)
  })
})

test.describe('editable', () => {
  /** Records the editing events and answers `edge-add` as an application storing the ports would. */
  async function wire(page: Page) {
    await host(page).evaluate((element: Flow) => {
      const recorded: Recorded[] = []
      ;(element as unknown as { recorded: Recorded[] }).recorded = recorded
      for (const type of ['edge-add', 'node-add', 'edge-delete'] as const) {
        element.addEventListener(type, ({ detail }) => recorded.push({ type, detail: JSON.parse(JSON.stringify(detail)) }))
      }
      element.addEventListener('edge-add', ({ detail }) => (element.edges = [...element.edges, { ...detail }]))
    })
  }
  const recorded = (page: Page, type: string) =>
    host(page).evaluate((element, type) => ((element as unknown as { recorded: Recorded[] }).recorded ?? []).filter((r) => r.type === type), type)

  test('a node with rows has a pair of handles on each row, and shows the hovered row’s', async ({ page, renderScenario }) => {
    await render(page, renderScenario, flow({ attributes: 'editable' }))
    await expect(node(page, 'orders').locator('.connector')).toHaveCount(8)
    await row(page, 'orders', 'billing_id').hover()
    const shown = node(page, 'orders').locator('.connector--port.is-row-active')
    await expect(shown).toHaveCount(2)
    await expect(shown.first()).toHaveCSS('opacity', '1')
    await expect(node(page, 'orders').locator('.connector--port:not(.is-row-active)').first()).toHaveCSS('opacity', '0')
    const [dot, line] = [await box(shown.first()), await rowLine(page, 'orders', 'billing_id')]
    expect(near(dot.y + dot.height / 2, line.y)).toBe(true)
  })

  test('dragging a row’s handle onto a row of another node asks for an edge between the rows', async ({ page, renderScenario }) => {
    await render(page, renderScenario, flow({ edges: [], attributes: 'editable' }))
    await wire(page)
    await row(page, 'customers', 'id').hover()
    const handle = node(page, 'customers').locator('.connector--right.is-row-active')
    await expect(handle).toHaveCSS('opacity', '1')
    const start = await box(handle)
    const target = await box(row(page, 'orders', 'parent_id'))
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2)
    await page.mouse.down()
    await page.mouse.move(target.x + 30, target.y + target.height / 2, { steps: 8 })
    await expect(row(page, 'orders', 'parent_id')).toHaveClass(/is-connect-target/)
    await page.mouse.up()
    expect(await recorded(page, 'edge-add')).toEqual([
      // An end on a row has no side: it faces the other end wherever the nodes move.
      { type: 'edge-add', detail: { source: 'customers', target: 'orders', sourcePort: 'id', targetPort: 'parent_id' } },
    ])
    // The same two rows again are not a new edge; another row of the same node is.
    await row(page, 'customers', 'id').hover()
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2)
    await page.mouse.down()
    await page.mouse.move(target.x + 30, target.y + target.height / 2, { steps: 8 })
    await page.mouse.up()
    expect(await recorded(page, 'edge-add')).toHaveLength(1)
    const other = await box(row(page, 'orders', 'billing_id'))
    await row(page, 'customers', 'id').hover()
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2)
    await page.mouse.down()
    await page.mouse.move(other.x + 30, other.y + other.height / 2, { steps: 8 })
    await page.mouse.up()
    expect((await recorded(page, 'edge-add'))[1].detail).toMatchObject({ sourcePort: 'id', targetPort: 'billing_id' })
  })

  test('a connection from a row dropped on empty canvas asks for a node with the row', async ({ page, renderScenario }) => {
    await render(page, renderScenario, flow({ edges: [], attributes: 'editable' }))
    await wire(page)
    await row(page, 'orders', 'customer_id').hover()
    const start = await box(node(page, 'orders').locator('.connector--right.is-row-active'))
    const canvas = await box(host(page))
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2)
    await page.mouse.down()
    await page.mouse.move(canvas.x + canvas.width - 20, canvas.y + canvas.height - 20, { steps: 8 })
    await page.mouse.up()
    const [request] = await recorded(page, 'node-add')
    expect(request.detail).toMatchObject({ source: 'orders', sourcePort: 'customer_id', sourceSide: 'right', targetSide: 'left' })
  })

  test('deleting a selected edge between rows names its rows', async ({ page, renderScenario }) => {
    await render(page, renderScenario, flow({ attributes: 'editable' }))
    await wire(page)
    await host(page).evaluate((element: Flow) => element.style.setProperty('--c2-flow__edge-hit--width', '24px'))
    const [, second] = await ends(page)
    // Click the second edge where it runs into its row.
    await page.mouse.click(second.end.x - 10, second.end.y)
    await page.keyboard.press('Delete')
    expect(await recorded(page, 'edge-delete')).toEqual([
      { type: 'edge-delete', detail: { source: 'customers', target: 'orders', sourcePort: 'id', targetPort: 'billing_id' } },
    ])
  })
})
