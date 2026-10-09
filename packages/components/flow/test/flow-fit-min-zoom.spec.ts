import type { Page } from '@playwright/test'
import type { Flow, FlowEdge, FlowNode } from '../src/flow'
import { test, expect } from '../../../../tests/component-fixture'

/** A long chain, far too wide (or tall) for a small preview box at 100%. */
const CHAIN: FlowNode[] = Array.from({ length: 12 }, (_, index) => ({ id: `step-${index}`, label: `Step ${index + 1}`, status: 'pending' }))
const CHAIN_EDGES: FlowEdge[] = CHAIN.slice(1).map((step, index) => ({ source: CHAIN[index].id, target: step.id }))

const SHORT: FlowNode[] = [
  { id: 'build', label: 'Build', status: 'success' },
  { id: 'test', label: 'Test', status: 'running' },
  { id: 'deploy', label: 'Deploy', status: 'pending' },
]
const SHORT_EDGES: FlowEdge[] = [
  { source: 'build', target: 'test' },
  { source: 'test', target: 'deploy' },
]

function flow({
  nodes = CHAIN,
  edges = CHAIN_EDGES,
  attributes = '',
  small = true,
}: { nodes?: FlowNode[]; edges?: FlowEdge[]; attributes?: string; small?: boolean } = {}) {
  const markup = `<c2-flow aria-label="Preview" nodes='${JSON.stringify(nodes)}' edges='${JSON.stringify(edges)}' ${attributes}></c2-flow>`
  return small ? `<div style="width: 360px; --c2-flow--height: 220px">${markup}</div>` : markup
}

const host = (page: Page) => page.locator('c2-flow')
const stage = (page: Page) => page.locator('c2-flow .stage')
const node = (page: Page, id: string) => page.locator(`c2-flow .node[data-node-id="${id}"]`)
const transform = (page: Page) => page.locator('c2-flow .viewport').evaluate((element) => (element as HTMLElement).style.transform)
const scale = async (page: Page) => Number(/scale\(([\d.]+)\)/.exec(await transform(page))?.[1])

async function box(page: Page, locator: ReturnType<Page['locator']>) {
  const rect = await locator.boundingBox()
  if (!rect) throw new Error('Expected a visible element')
  return rect
}

/** The stage's inner box (inside its border), which the view's translation is measured from. */
const inner = (page: Page) =>
  stage(page).evaluate((element) => {
    const rect = element.getBoundingClientRect()
    return { x: rect.x + element.clientLeft, y: rect.y + element.clientTop, width: element.clientWidth, height: element.clientHeight }
  })

/** The bounding box of every node, relative to the stage. */
async function graphBounds(page: Page) {
  const frame = await inner(page)
  const boxes = await Promise.all(CHAIN.map((step) => box(page, node(page, step.id))))
  const left = Math.min(...boxes.map((b) => b.x)) - frame.x
  const top = Math.min(...boxes.map((b) => b.y)) - frame.y
  const right = frame.x + frame.width - Math.max(...boxes.map((b) => b.x + b.width))
  const bottom = frame.y + frame.height - Math.max(...boxes.map((b) => b.y + b.height))
  return { left, top, right, bottom }
}

test('by default a flow too large for its box is fitted down to 25% and centred, as before', async ({ page, renderScenario }) => {
  await renderScenario(flow())
  await expect.poll(() => scale(page)).toBe(0.25)
  const bounds = await graphBounds(page)
  // Centred both ways: the overflow is split evenly between the two sides.
  expect(Math.abs(bounds.left - bounds.right)).toBeLessThan(2)
  expect(Math.abs(bounds.top - bounds.bottom)).toBeLessThan(2)
  expect(bounds.left).toBeLessThan(0)
  expect(await host(page).evaluate((element: Flow) => element.fitMinZoom)).toBe(0.25)
})

test('fit-min-zoom keeps a long left-to-right flow readable and shows its first step at the left edge', async ({ page, renderScenario }) => {
  await renderScenario(flow({ attributes: 'fit-min-zoom="0.6"' }))
  await expect.poll(() => scale(page)).toBe(0.6)
  const frame = await inner(page)
  const first = await box(page, node(page, 'step-0'))
  expect(first.x - frame.x).toBeCloseTo(24, 0)
  // One row of nodes fits across the box at 60%: it stays centred vertically.
  const bounds = await graphBounds(page)
  expect(Math.abs(bounds.top - bounds.bottom)).toBeLessThan(2)
  expect(first.y).toBeGreaterThanOrEqual(frame.y)
  expect(first.y + first.height).toBeLessThanOrEqual(frame.y + frame.height)
  // The last step lies beyond the right edge.
  const last = await box(page, node(page, 'step-11'))
  expect(last.x).toBeGreaterThan(frame.x + frame.width)
})

test('fit-min-zoom shows the first step of a long top-to-bottom flow at the top edge', async ({ page, renderScenario }) => {
  await renderScenario(flow({ attributes: 'direction="TB" fit-min-zoom="0.6"' }))
  await expect.poll(() => scale(page)).toBe(0.6)
  const frame = await inner(page)
  const first = await box(page, node(page, 'step-0'))
  expect(first.y - frame.y).toBeCloseTo(24, 0)
  // One column fits down the box's width at 60%: it stays centred horizontally.
  const bounds = await graphBounds(page)
  expect(Math.abs(bounds.left - bounds.right)).toBeLessThan(2)
  expect(first.x).toBeGreaterThanOrEqual(frame.x)
  const last = await box(page, node(page, 'step-11'))
  expect(last.y).toBeGreaterThan(frame.y + frame.height)
})

test('a cross axis that does not fit either is aligned to its start too', async ({ page, renderScenario }) => {
  // A fan of twelve steps from one source: wide along the main axis's cross direction.
  const fan: FlowNode[] = [{ id: 'step-0', label: 'Source', status: 'success' }, ...CHAIN.slice(1)]
  const fanEdges: FlowEdge[] = CHAIN.slice(1).map((step) => ({ source: 'step-0', target: step.id }))
  await renderScenario(flow({ nodes: fan, edges: fanEdges, attributes: 'fit-min-zoom="1"' }))
  await expect.poll(() => scale(page)).toBe(1)
  const bounds = await graphBounds(page)
  expect(bounds.left).toBeCloseTo(24, 0)
  expect(bounds.top).toBeCloseTo(24, 0)
})

test('a flow that fits above fit-min-zoom is centred exactly as without it', async ({ page, renderScenario }) => {
  await renderScenario(flow({ nodes: SHORT, edges: SHORT_EDGES, small: false }))
  const plain = await transform(page)
  await renderScenario(flow({ nodes: SHORT, edges: SHORT_EDGES, small: false, attributes: 'fit-min-zoom="0.5"' }))
  await expect.poll(() => transform(page)).toBe(plain)
})

test('an invalid fit-min-zoom falls back to 25% and one outside the range is held to it', async ({ page, renderScenario }) => {
  await renderScenario(flow())
  const plain = await transform(page)
  for (const value of ['abc', '-1', '0.1']) {
    await renderScenario(flow({ attributes: `fit-min-zoom="${value}"` }))
    await expect.poll(() => transform(page)).toBe(plain)
  }
  await renderScenario(flow())
  await host(page).evaluate((element: Flow) => {
    element.fitMinZoom = Number.POSITIVE_INFINITY
  })
  await expect.poll(() => transform(page)).toBe(plain)
  await renderScenario(flow({ attributes: 'fit-min-zoom="5"' }))
  await expect.poll(() => scale(page)).toBe(1)
})

test('changing fit-min-zoom refits an untouched view, but not one the user zoomed', async ({ page, renderScenario }) => {
  await renderScenario(flow())
  await expect.poll(() => scale(page)).toBe(0.25)
  await host(page).evaluate((element: Flow) => element.setAttribute('fit-min-zoom', '0.6'))
  await expect.poll(() => scale(page)).toBe(0.6)
  await host(page).evaluate((element: Flow) => element.removeAttribute('fit-min-zoom'))
  await expect.poll(() => scale(page)).toBe(0.25)

  await host(page).evaluate((element: Flow) => element.zoomIn())
  const zoomed = await transform(page)
  await host(page).evaluate((element: Flow) => element.setAttribute('fit-min-zoom', '0.8'))
  await expect.poll(() => transform(page)).toBe(zoomed)
  // fitView() itself honours the new value.
  await host(page).evaluate((element: Flow) => element.fitView())
  await expect.poll(() => scale(page)).toBe(0.8)
})

test('a resize of an untouched view refits it to fit-min-zoom', async ({ page, renderScenario }) => {
  await renderScenario(flow({ attributes: 'fit-min-zoom="0.6"' }))
  await expect.poll(() => scale(page)).toBe(0.6)
  await page.locator('main > div').evaluate((element) => ((element as HTMLElement).style.width = '300px'))
  const frame = await inner(page)
  await expect.poll(async () => (await box(page, node(page, 'step-0'))).x - frame.x).toBeCloseTo(24, 0)
  expect(await scale(page)).toBe(0.6)
})
