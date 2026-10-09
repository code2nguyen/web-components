import type { Locator, Page } from '@playwright/test'
import type { Flow, FlowEdge, FlowNode, FlowSide } from '../src/flow'
import { test, expect, accessible } from '../../../../tests/component-fixture'

const NODES: FlowNode[] = [
  { id: 'idea', label: 'Idea' },
  { id: 'draft', label: 'Draft' },
  { id: 'review', label: 'Review' },
]

const EDGES: FlowEdge[] = [
  { source: 'idea', target: 'draft' },
  { source: 'draft', target: 'review' },
]

interface Recorded {
  type: string
  detail: Record<string, unknown>
}

function flow({ nodes = NODES, edges = EDGES, attributes = 'editable' }: { nodes?: FlowNode[]; edges?: FlowEdge[]; attributes?: string } = {}) {
  return `<c2-flow aria-label="Notes" nodes='${JSON.stringify(nodes)}' edges='${JSON.stringify(edges)}' ${attributes}></c2-flow>`
}

const host = (page: Page) => page.locator('c2-flow')
const node = (page: Page, id: string) => page.locator(`c2-flow .node[data-node-id="${id}"]`)
const connector = (page: Page, id: string, side: FlowSide) => node(page, id).locator(`.connector--${side}`)
const recorded = (page: Page, type: string) =>
  host(page).evaluate((element, type) => ((element as unknown as { recorded: Recorded[] }).recorded ?? []).filter((r) => r.type === type), type)

/** Records `edge-add` and `node-add` and answers them as an application storing the sides would. */
async function wire(page: Page) {
  await host(page).evaluate((element: Flow) => {
    const recorded: Recorded[] = []
    ;(element as unknown as { recorded: Recorded[] }).recorded = recorded
    element.addEventListener('edge-add', ({ detail }) => {
      recorded.push({ type: 'edge-add', detail: { ...detail } })
      element.edges = [...element.edges, { ...detail }]
    })
    element.addEventListener('node-add', ({ detail }) => {
      recorded.push({ type: 'node-add', detail: JSON.parse(JSON.stringify(detail)) })
      element.nodes = [...element.nodes, { id: 'new', label: 'New', position: detail.position }]
    })
  })
}

async function box(locator: Locator) {
  const rect = await locator.boundingBox()
  if (!rect) throw new Error('Expected a visible element')
  return rect
}

/** The middle of one side of a box. */
function sideOf(rect: { x: number; y: number; width: number; height: number }, side: FlowSide) {
  if (side === 'top') return { x: rect.x + rect.width / 2, y: rect.y }
  if (side === 'bottom') return { x: rect.x + rect.width / 2, y: rect.y + rect.height }
  if (side === 'left') return { x: rect.x, y: rect.y + rect.height / 2 }
  return { x: rect.x + rect.width, y: rect.y + rect.height / 2 }
}

/** Per drawn edge line: its first and last point and the direction it leaves and arrives in, in page pixels. */
const ends = (page: Page, selector = 'path.edge:not(.edge--draft)') =>
  host(page).evaluate((element, selector) => {
    return [...element.shadowRoot!.querySelectorAll<SVGPathElement>(selector)].map((path) => {
      const length = path.getTotalLength()
      const at = (l: number) => {
        const p = path.getPointAtLength(l).matrixTransform(path.getScreenCTM()!)
        return { x: p.x, y: p.y }
      }
      return { d: path.getAttribute('d'), start: at(0), afterStart: at(Math.min(2, length)), end: at(length), beforeEnd: at(Math.max(0, length - 2)) }
    })
  }, selector)

const near = (a: { x: number; y: number }, b: { x: number; y: number }, tolerance = 1.5) => {
  expect(Math.abs(a.x - b.x), `x ${a.x} vs ${b.x}`).toBeLessThan(tolerance)
  expect(Math.abs(a.y - b.y), `y ${a.y} vs ${b.y}`).toBeLessThan(tolerance)
}

/** The unit vector a side points out of its node along. */
const NORMAL: Record<FlowSide, { x: number; y: number }> = { top: { x: 0, y: -1 }, right: { x: 1, y: 0 }, bottom: { x: 0, y: 1 }, left: { x: -1, y: 0 } }

/** Checks that a line starts on `sa` of `a`, leaving perpendicular to it, and ends on `sb` of `b`, arriving perpendicular to it. */
async function expectRoute(page: Page, line: Awaited<ReturnType<typeof ends>>[number], a: string, sa: FlowSide, b: string, sb: FlowSide) {
  const [ra, rb] = [await box(node(page, a)), await box(node(page, b))]
  near(line.start, sideOf(ra, sa))
  near(line.end, sideOf(rb, sb))
  const out = { x: line.afterStart.x - line.start.x, y: line.afterStart.y - line.start.y }
  const into = { x: line.end.x - line.beforeEnd.x, y: line.end.y - line.beforeEnd.y }
  // Straight out of the source side, straight into the target side.
  expect(out.x * NORMAL[sa].x + out.y * NORMAL[sa].y).toBeGreaterThan(Math.hypot(out.x, out.y) * 0.9)
  expect(-(into.x * NORMAL[sb].x + into.y * NORMAL[sb].y)).toBeGreaterThan(Math.hypot(into.x, into.y) * 0.9)
}

/** Presses on side `side`'s handle of node `from` and drags to `to`; releases unless told not to. */
async function connect(page: Page, from: string, side: FlowSide, to: { x: number; y: number }, release = true) {
  await node(page, from).hover()
  const handle = connector(page, from, side)
  await expect(handle).toHaveCSS('opacity', '1')
  const start = await box(handle)
  const [x, y] = [start.x + start.width / 2, start.y + start.height / 2]
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move((x + to.x) / 2, (y + to.y) / 2, { steps: 4 })
  await page.mouse.move(to.x, to.y, { steps: 4 })
  if (release) await page.mouse.up()
}

/** Renders the flow and waits until every node is measured, so the edges are drawn at the nodes' real sizes. */
async function render(page: Page, renderScenario: (html: string) => Promise<void>, markup: string) {
  await renderScenario(markup)
  await expect
    .poll(() =>
      host(page).evaluate(async (element: Flow) => {
        await element.updateComplete
        const sizes = (element as unknown as { sizes: Map<string, { width: number; height: number }> }).sizes
        return [...element.shadowRoot!.querySelectorAll<HTMLElement>('.node')].every((el) => {
          const size = sizes.get(el.dataset.nodeId!)
          return size?.width === el.offsetWidth && size.height === el.offsetHeight
        })
      }),
    )
    .toBe(true)
}

/** The zoom of the view: canvas pixels to page pixels. */
const zoom = (page: Page) =>
  page.locator('c2-flow .viewport').evaluate((element) => Number(/scale\(([\d.]+)\)/.exec((element as HTMLElement).style.transform)?.[1]))

test.describe('side handles', () => {
  test('an editable node has a handle in the middle of each side; a read-only flow has none', async ({ page, renderScenario }) => {
    await render(page, renderScenario, flow())
    await expect(node(page, 'draft').locator('.connector')).toHaveCount(4)
    await accessible(page)
    await node(page, 'draft').hover()
    const rect = await box(node(page, 'draft'))
    for (const side of ['top', 'right', 'bottom', 'left'] as const) {
      const handle = connector(page, 'draft', side)
      await expect(handle).toHaveCSS('opacity', '1')
      await expect(handle).toHaveAttribute('data-side', side)
      const dot = await box(handle)
      near({ x: dot.x + dot.width / 2, y: dot.y + dot.height / 2 }, sideOf(rect, side), 2)
    }

    await render(page, renderScenario, flow({ attributes: '' }))
    await expect(page.locator('c2-flow .connector')).toHaveCount(0)
  })

  test('dragging from the bottom handle to the top of a node fires edge-add with those sides, and the edge is drawn between them', async ({
    page,
    renderScenario,
  }) => {
    await render(page, renderScenario, flow())
    await wire(page)
    const target = await box(node(page, 'review'))
    await connect(page, 'idea', 'bottom', { x: target.x + target.width / 2, y: target.y + 2 }, false)
    // The preview leaves from the chosen side and arrives at the side it would connect to, whose handle shows.
    const [draft] = await ends(page, 'path.edge--draft')
    await expectRoute(page, draft, 'idea', 'bottom', 'review', 'top')
    await expect(connector(page, 'review', 'top')).toHaveCSS('opacity', '1')
    await expect(connector(page, 'review', 'left')).toHaveCSS('opacity', '0')
    await page.mouse.up()

    expect((await recorded(page, 'edge-add')).map((r) => r.detail)).toEqual([{ source: 'idea', target: 'review', sourceSide: 'bottom', targetSide: 'top' }])
    const lines = await ends(page)
    expect(lines).toHaveLength(3)
    await expectRoute(page, lines[2], 'idea', 'bottom', 'review', 'top')
    // The dots sit on the sides the edges use.
    await expect(node(page, 'idea').locator('.handle--bottom.handle--out')).toHaveCount(1)
    await expect(node(page, 'review').locator('.handle--top.handle--in')).toHaveCount(1)
    await expect(node(page, 'review').locator('.handle--left.handle--in')).toHaveCount(1)
  })

  test('dropped on a node, the connection arrives by the side nearest the pointer', async ({ page, renderScenario }) => {
    await render(page, renderScenario, flow())
    await wire(page)
    const target = await box(node(page, 'review'))
    const scale = await zoom(page)
    // Inside the node, 16 canvas pixels from its left side: nearer it than the top or bottom, and clear of its handle.
    await connect(page, 'idea', 'top', { x: target.x + 16 * scale, y: target.y + target.height / 2 })
    expect((await recorded(page, 'edge-add')).map((r) => r.detail)).toEqual([{ source: 'idea', target: 'review', sourceSide: 'top', targetSide: 'left' }])

    // Near the right side of another node (Draft → Review exists already, Review → Draft does not).
    const draft = await box(node(page, 'draft'))
    await connect(page, 'review', 'bottom', { x: draft.x + draft.width - 16 * scale, y: draft.y + draft.height / 2 })
    expect((await recorded(page, 'edge-add')).map((r) => r.detail.targetSide)).toEqual(['left', 'right'])
  })

  test('a connection dropped on empty canvas asks for a node whose facing side is on the drop point', async ({ page, renderScenario }) => {
    await render(page, renderScenario, flow())
    await wire(page)
    const stage = await box(page.locator('c2-flow .stage'))
    const source = await box(node(page, 'draft'))
    const drop = { x: source.x + source.width / 2, y: stage.y + stage.height - 60 }
    await connect(page, 'draft', 'bottom', drop)
    const [add] = await recorded(page, 'node-add')
    expect(add.detail).toMatchObject({ source: 'draft', sourceSide: 'bottom', targetSide: 'top' })
    const added = await box(node(page, 'new'))
    near(sideOf(added, 'top'), drop, 3)
  })

  test('the keyboard connects the outgoing side to the incoming side', async ({ page, renderScenario }) => {
    await render(page, renderScenario, flow({ edges: [] }))
    await wire(page)
    await node(page, 'idea').focus()
    await page.keyboard.press('c')
    await page.keyboard.press('Enter')
    expect((await recorded(page, 'edge-add')).map((r) => r.detail)).toEqual([{ source: 'idea', target: 'draft', sourceSide: 'right', targetSide: 'left' }])

    await render(page, renderScenario, flow({ edges: [], attributes: 'editable direction="TB"' }))
    await wire(page)
    await node(page, 'idea').focus()
    await page.keyboard.press('c')
    await page.keyboard.press('Enter')
    expect((await recorded(page, 'edge-add')).map((r) => r.detail)).toEqual([{ source: 'idea', target: 'draft', sourceSide: 'bottom', targetSide: 'top' }])
  })
})

/** Three nodes at fixed spots: `b` below `a`, `c` to the left of `a` (behind it in `LR`). */
const PLACED: FlowNode[] = [
  { id: 'a', label: 'A', position: { x: 300, y: 0 } },
  { id: 'b', label: 'B', position: { x: 300, y: 200 } },
  { id: 'c', label: 'C', position: { x: 0, y: 0 } },
]

const SIDED: { edge: FlowEdge; sa: FlowSide; sb: FlowSide }[] = [
  { edge: { source: 'a', target: 'b', sourceSide: 'bottom', targetSide: 'top', label: 'down' }, sa: 'bottom', sb: 'top' },
  // The same side at both ends.
  { edge: { source: 'b', target: 'a', sourceSide: 'right', targetSide: 'right' }, sa: 'right', sb: 'right' },
  // Out of the outgoing side into a target behind the source.
  { edge: { source: 'a', target: 'c', sourceSide: 'right', targetSide: 'right' }, sa: 'right', sb: 'right' },
  // Only one side set: the other keeps its default (`left`, the incoming side in `LR`).
  { edge: { source: 'c', target: 'b', sourceSide: 'bottom' }, sa: 'bottom', sb: 'left' },
  { edge: { source: 'b', target: 'c', sourceSide: 'left', targetSide: 'bottom' }, sa: 'left', sb: 'bottom' },
]

for (const type of ['bezier', 'step'] as const) {
  test(`${type}: an edge with sides leaves and arrives by them, with its arrowhead, label, hit area and the fitted view to match`, async ({
    page,
    renderScenario,
  }) => {
    await render(page, renderScenario, flow({ nodes: PLACED, edges: SIDED.map(({ edge }) => edge), attributes: `editable edge-type="${type}"` }))
    const lines = await ends(page)
    expect(lines).toHaveLength(SIDED.length)
    for (const [index, { edge, sa, sb }] of SIDED.entries()) await expectRoute(page, lines[index], edge.source, sa, edge.target, sb)

    const stage = await box(page.locator('c2-flow .stage'))
    const parts = await host(page).evaluate((element) => {
      const root = element.shadowRoot!
      const rect = (el: Element) => {
        const r = el.getBoundingClientRect()
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }
      }
      return {
        lines: [...root.querySelectorAll('path.edge')].map(rect),
        hits: [...root.querySelectorAll('path.edge-hit')].map((path) => path.getAttribute('d')),
        arrows: [...root.querySelectorAll('.arrow')].map(rect),
        label: rect(root.querySelector('.edge-label')!),
      }
    })
    // Every route is in the fitted view, loops round the outside included.
    for (const line of parts.lines) {
      expect(line.left).toBeGreaterThanOrEqual(stage.x)
      expect(line.right).toBeLessThanOrEqual(stage.x + stage.width)
      expect(line.top).toBeGreaterThanOrEqual(stage.y)
      expect(line.bottom).toBeLessThanOrEqual(stage.y + stage.height)
    }
    expect(parts.hits).toEqual(lines.map((line) => line.d))
    // Each arrowhead sits just outside its target side, centred on it.
    for (const [index, { edge, sb }] of SIDED.entries()) {
      const target = await box(node(page, edge.target))
      const arrow = parts.arrows[index]
      const centre = { x: (arrow.left + arrow.right) / 2, y: (arrow.top + arrow.bottom) / 2 }
      const mid = sideOf(target, sb)
      if (sb === 'top') expect(arrow.bottom).toBeLessThanOrEqual(target.y + 0.5)
      if (sb === 'bottom') expect(arrow.top).toBeGreaterThanOrEqual(target.y + target.height - 0.5)
      if (sb === 'left') expect(arrow.right).toBeLessThanOrEqual(target.x + 0.5)
      if (sb === 'right') expect(arrow.left).toBeGreaterThanOrEqual(target.x + target.width - 0.5)
      if (sb === 'top' || sb === 'bottom') expect(Math.abs(centre.x - mid.x)).toBeLessThan(1)
      else expect(Math.abs(centre.y - mid.y)).toBeLessThan(1)
      expect(Math.hypot(centre.x - mid.x, centre.y - mid.y)).toBeLessThan(16)
    }
    // The label of a → b sits halfway along it.
    const midpoint = await host(page).evaluate((element) => {
      const path = element.shadowRoot!.querySelector<SVGPathElement>('path.edge')!
      const p = path.getPointAtLength(path.getTotalLength() / 2).matrixTransform(path.getScreenCTM()!)
      return { x: p.x, y: p.y }
    })
    near({ x: (parts.label.left + parts.label.right) / 2, y: (parts.label.top + parts.label.bottom) / 2 }, midpoint, 2)
  })
}

for (const type of ['bezier', 'step'] as const) {
  test(`${type}: a route between sides goes round the nodes rather than through them`, async ({ page, renderScenario }) => {
    await render(page, renderScenario, flow({ nodes: PLACED, edges: SIDED.map(({ edge }) => edge), attributes: `edge-type="${type}"` }))
    const crossings = await host(page).evaluate((element) => {
      const root = element.shadowRoot!
      const boxes = [...root.querySelectorAll('.node')].map((n) => n.getBoundingClientRect())
      return [...root.querySelectorAll<SVGPathElement>('path.edge')].map((path) => {
        const length = path.getTotalLength()
        let inside = 0
        for (let l = 3; l < length - 3; l += 2) {
          const p = path.getPointAtLength(l).matrixTransform(path.getScreenCTM()!)
          if (boxes.some((b) => p.x > b.left + 1 && p.x < b.right - 1 && p.y > b.top + 1 && p.y < b.bottom - 1)) inside++
        }
        return inside
      })
    })
    expect(crossings).toEqual(SIDED.map(() => 0))
  })
}

for (const direction of ['LR', 'TB'] as const) {
  test(`${direction}: edges without sides are drawn as before, from the outgoing to the incoming side`, async ({ page, renderScenario }) => {
    const [out, into]: FlowSide[] = direction === 'LR' ? ['right', 'left'] : ['bottom', 'top']
    const nodes: FlowNode[] = [...NODES, { id: 'publish', label: 'Publish' }]
    // A cycle, so one edge is a back edge looping round the outside.
    const edges: FlowEdge[] = [...EDGES, { source: 'review', target: 'publish' }, { source: 'publish', target: 'draft' }]
    for (const type of ['bezier', 'step'] as const) {
      await render(page, renderScenario, flow({ nodes, edges, attributes: `direction="${direction}" edge-type="${type}"` }))
      const plain = await ends(page)
      for (const [index, edge] of edges.entries()) {
        const line = plain[index]
        near(line.start, sideOf(await box(node(page, edge.source)), out))
        near(line.end, sideOf(await box(node(page, edge.target)), into))
      }
      await expect(page.locator('c2-flow .edge--back')).toHaveCount(1)
      await expect(page.locator(`c2-flow .handle--${out}.handle--out`)).toHaveCount(4)
      await expect(page.locator(`c2-flow .handle--${into}.handle--in`)).toHaveCount(3)
      await expect(page.locator('c2-flow .handle--in.handle--out')).toHaveCount(0)

      // Naming the default sides changes nothing, not even the back edge's loop.
      await render(
        page,
        renderScenario,
        flow({
          nodes,
          edges: edges.map((edge) => ({ ...edge, sourceSide: out, targetSide: into })),
          attributes: `direction="${direction}" edge-type="${type}"`,
        }),
      )
      expect((await ends(page)).map((line) => line.d)).toEqual(plain.map((line) => line.d))
      await expect(page.locator('c2-flow .edge--back')).toHaveCount(1)
    }
  })
}
