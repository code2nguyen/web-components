import type { Locator, Page } from '@playwright/test'
import type { Flow, FlowEdge, FlowLayout, FlowNode } from '../src/flow'
import { test, expect, watch, accessible } from '../../../../tests/component-fixture'

const NODES: FlowNode[] = [
  { id: 'checkout', label: 'Checkout', status: 'success', meta: '4s' },
  { id: 'install', label: 'Install', status: 'success', description: 'npm ci', details: { Runner: 'ubuntu-24.04' } },
  { id: 'lint', label: 'Lint', status: 'success' },
  { id: 'test', label: 'Test', status: 'running', details: [['Progress', '812 of 1320']] },
  { id: 'build', label: 'Build', status: 'pending' },
  { id: 'deploy', label: 'Deploy', status: 'pending' },
]

const EDGES: FlowEdge[] = [
  { source: 'checkout', target: 'install' },
  { source: 'install', target: 'lint' },
  { source: 'install', target: 'test' },
  { source: 'lint', target: 'build' },
  { source: 'test', target: 'build' },
  { source: 'build', target: 'deploy' },
]

const KEY = 'flow-test:ci'

function flow({
  nodes = NODES,
  edges = EDGES,
  attributes = '',
  inner = '',
}: { nodes?: FlowNode[]; edges?: FlowEdge[]; attributes?: string; inner?: string } = {}) {
  return `<c2-flow aria-label="CI pipeline" storage-key="${KEY}" nodes='${JSON.stringify(nodes)}' edges='${JSON.stringify(edges)}' ${attributes}>${inner}</c2-flow>`
}

const host = (page: Page) => page.locator('c2-flow')
const node = (page: Page, id: string) => page.locator(`c2-flow .node[data-node-id="${id}"]`)
const item = (page: Page, value: string) => page.locator(`c2-menu-item[value="${value}"]`)
const layout = (page: Page) => host(page).evaluate((element: Flow) => element.getLayout())
const stored = (page: Page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), KEY)
const events = async (locator: Locator) => JSON.parse((await locator.getAttribute('data-events')) ?? '[]')

async function center(locator: Locator) {
  const box = await locator.boundingBox()
  if (!box) throw new Error('Expected a visible target')
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, box }
}

async function drag(page: Page, locator: Locator, dx: number, dy: number) {
  const { x, y } = await center(locator)
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 4 })
  await page.mouse.move(x + dx, y + dy, { steps: 4 })
  await page.mouse.up()
}

/** Right-clicks the stage near its top-left corner, where the fitted view leaves empty canvas. */
async function rightClickCanvas(page: Page) {
  const box = (await page.locator('c2-flow .stage').boundingBox())!
  await page.mouse.click(box.x + 8, box.y + 8, { button: 'right' })
}

test('lays the steps out in one column per dependency depth and styles edges from the statuses', async ({ page, renderScenario }) => {
  await renderScenario(flow())
  const positions = await layout(page)
  expect(positions.checkout.x).toBeLessThan(positions.install.x)
  expect(positions.install.x).toBeLessThan(positions.lint.x)
  expect(positions.lint.x).toBe(positions.test.x)
  expect(positions.lint.y).not.toBe(positions.test.y)
  expect(positions.test.x).toBeLessThan(positions.build.x)
  expect(positions.build.x).toBeLessThan(positions.deploy.x)

  await expect(page.locator('c2-flow .edge')).toHaveCount(6)
  // install → test runs into a running step; test → build leaves one that has not finished.
  await expect(page.locator('c2-flow .edge--active')).toHaveCount(1)
  await expect(page.locator('c2-flow .edge--done')).toHaveCount(3)
  await expect(node(page, 'test')).toHaveAttribute('aria-label', 'Test, running')
  await expect(node(page, 'checkout')).toHaveAttribute('aria-label', 'Checkout, succeeded, 4s')
  await expect(host(page)).toHaveHostAria('role', 'group')
  await accessible(page)
})

test('each edge and status colour variable reaches the line, the arrowhead and the marker of its state', async ({ page, renderScenario }) => {
  await renderScenario(flow())
  await host(page).evaluate((element: Flow) => {
    element.style.setProperty('--c2-flow__edge--color', 'rgb(1, 2, 3)')
    element.style.setProperty('--c2-flow__edge__done--color', 'rgb(10, 20, 30)')
    element.style.setProperty('--c2-flow__edge__active--color', 'rgb(40, 50, 60)')
    element.style.setProperty('--c2-flow__success--color', 'rgb(70, 80, 90)')
    element.style.setProperty('--c2-flow__pending--color', 'rgb(100, 110, 120)')
  })
  await expect(page.locator('c2-flow .edge--done').first()).toHaveCSS('stroke', 'rgb(10, 20, 30)')
  await expect(page.locator('c2-flow .arrow.mark--done').first()).toHaveCSS('background-color', 'rgb(10, 20, 30)')
  await expect(page.locator('c2-flow .edge--active')).toHaveCSS('stroke', 'rgb(40, 50, 60)')
  await expect(page.locator('c2-flow .arrow.mark--active')).toHaveCSS('background-color', 'rgb(40, 50, 60)')
  // build → deploy: neither step has run.
  await expect(page.locator('c2-flow .edge:not(.edge--done):not(.edge--active)').last()).toHaveCSS('stroke', 'rgb(1, 2, 3)')
  await expect(node(page, 'checkout').locator('.status')).toHaveCSS('color', 'rgb(70, 80, 90)')
  await expect(node(page, 'deploy').locator('.status')).toHaveCSS('color', 'rgb(100, 110, 120)')
})

test('the auto layout reads --c2-flow__rank--gap and --c2-flow__node--gap', async ({ page, renderScenario }) => {
  await renderScenario(flow())
  const base = await layout(page)
  await renderScenario(flow({ attributes: 'style="--c2-flow__rank--gap: 172px; --c2-flow__node--gap: 70px"' }))
  const wide = await layout(page)
  expect(wide.install.x - wide.checkout.x).toBe(base.install.x - base.checkout.x + 100)
  // lint and test share a rank, one node gap apart.
  expect(Math.abs(wide.test.y - wide.lint.y)).toBe(Math.abs(base.test.y - base.lint.y) + 50)
})

test('direction="TB" stacks the ranks from top to bottom', async ({ page, renderScenario }) => {
  await renderScenario(flow({ attributes: 'direction="TB"' }))
  const positions = await layout(page)
  expect(positions.checkout.y).toBeLessThan(positions.install.y)
  expect(positions.lint.y).toBe(positions.test.y)
  expect(positions.build.y).toBeLessThan(positions.deploy.y)
})

test('dragging a node moves it, saves the layout and restores it on the next visit', async ({ page, renderScenario }) => {
  await renderScenario(flow())
  await watch(host(page), 'layout-change')
  const before = await center(node(page, 'build'))
  const auto = await layout(page)

  await drag(page, node(page, 'build'), 0, 90)
  const after = await center(node(page, 'build'))
  expect(Math.round(after.y - before.y)).toBe(90)
  expect(Math.round(after.x - before.x)).toBe(0)

  const moved = await layout(page)
  expect(moved.build.y).toBeGreaterThan(auto.build.y)
  expect(moved.checkout).toEqual(auto.checkout)
  const saved = await stored(page)
  expect(saved).toMatchObject({ v: 1, direction: 'LR', positions: moved })
  const [change] = await events(host(page))
  expect(change).toMatchObject({ reason: 'drag', direction: 'LR', positions: moved })
  // A drag is not a click.
  await expect(node(page, 'build')).not.toHaveClass(/is-selected/)

  await renderScenario(flow())
  expect(await layout(page)).toEqual(moved)
})

test('a saved layout is merged into a changed graph: kept nodes stay, new ones follow their neighbours, removed ones go', async ({ page, renderScenario }) => {
  await renderScenario(flow({ attributes: 'storage-key=""' }))
  const auto = await layout(page)

  const saved: FlowLayout = {}
  for (const [id, p] of Object.entries(auto)) if (id !== 'deploy') saved[id] = { x: p.x + 500, y: p.y + 300 }
  saved.build = { x: saved.build.x, y: saved.build.y + 200 }
  saved.gone = { x: 0, y: 0 }
  await page.evaluate(({ key, positions }) => localStorage.setItem(key, JSON.stringify({ v: 1, direction: 'LR', positions })), { key: KEY, positions: saved })

  await renderScenario(flow())
  const merged = await layout(page)
  for (const id of ['checkout', 'install', 'lint', 'test', 'build']) expect(merged[id]).toEqual(saved[id])
  expect(merged.gone).toBeUndefined()
  // Deploy sits where the auto layout puts it relative to Build, which the user moved.
  expect(Math.abs(merged.deploy.x - merged.build.x - (auto.deploy.x - auto.build.x))).toBeLessThanOrEqual(1)
  expect(Math.abs(merged.deploy.y - merged.build.y - (auto.deploy.y - auto.build.y))).toBeLessThanOrEqual(1)
})

test('the canvas context menu groups the view controls and switches the layout direction', async ({ page, renderScenario }) => {
  await renderScenario(flow())
  await watch(host(page), 'layout-change')
  await rightClickCanvas(page)

  for (const value of ['flow:zoom-in', 'flow:zoom-out', 'flow:fit', 'flow:direction-lr', 'flow:direction-tb', 'flow:auto-layout', 'flow:lock']) {
    await expect(item(page, value)).toBeVisible()
  }
  await expect(item(page, 'flow:details')).toHaveCount(0)
  await expect(item(page, 'flow:zoom-in').locator('c2-kbd[slot="shortcut"]')).toHaveText('Ctrl +')
  await expect(item(page, 'flow:fit').locator('c2-kbd[slot="shortcut"]')).toHaveText('Ctrl 0')
  await expect(item(page, 'flow:direction-lr')).toHaveJSProperty('checked', true)
  // Nothing has been moved yet, so there is no custom layout to discard.
  await expect(item(page, 'flow:auto-layout')).toHaveJSProperty('disabled', true)

  await item(page, 'flow:direction-tb').click()
  await expect.poll(async () => (await layout(page)).checkout.y < (await layout(page)).install.y).toBe(true)
  expect(await stored(page)).toMatchObject({ direction: 'TB', positions: null })
  expect((await events(host(page)))[0]).toMatchObject({ reason: 'direction', direction: 'TB', positions: null })

  // The choice is remembered.
  await renderScenario(flow())
  const positions = await layout(page)
  expect(positions.checkout.y).toBeLessThan(positions.install.y)
})

test('Auto layout in the context menu discards a dragged layout', async ({ page, renderScenario }) => {
  await renderScenario(flow())
  const auto = await layout(page)
  await drag(page, node(page, 'lint'), 60, -40)
  expect((await layout(page)).lint).not.toEqual(auto.lint)

  await rightClickCanvas(page)
  await expect(item(page, 'flow:auto-layout')).toHaveJSProperty('disabled', false)
  await item(page, 'flow:auto-layout').click()
  await expect.poll(() => layout(page)).toEqual(auto)
  expect(await stored(page)).toMatchObject({ positions: null })
})

test('zoom rows keep the menu open and scale the view; fit view restores it', async ({ page, renderScenario }) => {
  await renderScenario(flow())
  const scale = () => page.locator('c2-flow .viewport').evaluate((element) => Number(/scale\(([\d.]+)\)/.exec((element as HTMLElement).style.transform)?.[1]))
  const fitted = await scale()

  await rightClickCanvas(page)
  await item(page, 'flow:zoom-out').click()
  await expect(item(page, 'flow:zoom-out')).toBeVisible()
  await expect.poll(scale).toBeCloseTo(fitted / 1.2, 3)
  await item(page, 'flow:fit').click()
  await expect(item(page, 'flow:fit')).toBeHidden()
  await expect.poll(scale).toBeCloseTo(fitted, 3)
})

test('a node opens no menu of its own: the canvas rows stay on the canvas', async ({ page, renderScenario }) => {
  await renderScenario(flow())
  const { x, y } = await center(node(page, 'install'))
  await page.mouse.click(x, y, { button: 'right' })
  await expect(item(page, 'flow:zoom-in')).toHaveCount(0)
  await expect(page.locator('c2-flow c2-context-menu c2-menu')).not.toHaveJSProperty('open', true)
})

test('the canvas menu shows every row without scrolling', async ({ page, renderScenario }) => {
  await renderScenario(flow())
  await rightClickCanvas(page)
  await expect(item(page, 'flow:lock')).toBeVisible()
  const list = page.locator('c2-flow c2-context-menu c2-menu .menu')
  expect(await list.evaluate((element) => element.scrollHeight - element.clientHeight)).toBe(0)
})

test('a node menu from renderContextMenu names the node and flow:details fires node-click', async ({ page, renderScenario }) => {
  await renderScenario(flow())
  await watch(host(page), 'node-click')
  await host(page).evaluate(async (element: Flow) => {
    element.renderContextMenu = ({ node }) => {
      if (!node) return undefined
      const heading = document.createElement('h6')
      heading.textContent = node.label
      const details = document.createElement('c2-menu-item')
      details.setAttribute('value', 'flow:details')
      details.textContent = 'Show details'
      return [heading, details]
    }
    await element.updateComplete
  })
  const { x, y } = await center(node(page, 'install'))
  await page.mouse.click(x, y, { button: 'right' })

  await expect(page.locator('c2-flow c2-context-menu h6').first()).toHaveText('Install')
  await expect(item(page, 'flow:zoom-in')).toHaveCount(0)
  await item(page, 'flow:details').click()
  await expect(node(page, 'install')).toHaveClass(/is-selected/)
  expect((await events(host(page)))[0].node.id).toBe('install')
})

test('renderContextMenu extends the canvas rows and its own rows fire flow-menu-select with the node', async ({ page, renderScenario }) => {
  await renderScenario(flow())
  await watch(host(page), 'flow-menu-select')
  await host(page).evaluate(async (element: Flow) => {
    element.renderContextMenu = ({ node, defaultItems }) => {
      const retry = document.createElement('c2-menu-item')
      retry.setAttribute('value', 'retry')
      retry.textContent = node ? `Retry ${node.label}` : 'Retry all'
      return node ? [retry] : [retry, document.createElement('hr'), defaultItems]
    }
    await element.updateComplete
  })
  await rightClickCanvas(page)
  await expect(item(page, 'flow:zoom-in')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(item(page, 'flow:zoom-in')).toBeHidden()

  const { x, y } = await center(node(page, 'test'))
  await page.mouse.click(x, y, { button: 'right' })
  await expect(item(page, 'flow:zoom-in')).toHaveCount(0)
  await item(page, 'retry').click()
  const [selection] = await events(host(page))
  expect(selection).toMatchObject({ value: 'retry', node: { id: 'test' } })
})

test('hovering a node opens its card with the status and details, and leaving closes it', async ({ page, renderScenario }) => {
  await renderScenario(flow({ attributes: 'open-delay="0" close-delay="0"' }))
  const card = page.locator('c2-flow .card')
  await node(page, 'test').hover()
  await expect(card).toBeVisible()
  await expect(card).toContainText('Running')
  await expect(card).toContainText('812 of 1320')
  // The edges of the hovered node are highlighted and the rest dimmed.
  await expect(page.locator('c2-flow .edge.is-highlighted')).toHaveCount(2)
  await accessible(page)

  const box = (await page.locator('c2-flow .stage').boundingBox())!
  await page.mouse.move(box.x + 4, box.y + 4)
  await expect(card).toBeHidden()
})

test('no-card keeps the card closed', async ({ page, renderScenario }) => {
  await renderScenario(flow({ attributes: 'open-delay="0" no-card' }))
  await node(page, 'test').hover()
  await expect(page.locator('c2-flow .node.is-hovered, c2-flow .card:popover-open')).toHaveCount(0)
})

test('a click selects a node and fires node-click; a click on the canvas clears the selection', async ({ page, renderScenario }) => {
  await renderScenario(flow())
  await watch(host(page), 'selection-change')
  const { x, y } = await center(node(page, 'lint'))
  await page.mouse.click(x, y)
  await expect(node(page, 'lint')).toHaveClass(/is-selected/)
  await expect(host(page)).toHaveJSProperty('selected', 'lint')

  const box = (await page.locator('c2-flow .stage').boundingBox())!
  await page.mouse.click(box.x + 8, box.y + 8)
  await expect(host(page)).toHaveJSProperty('selected', null)
  expect((await events(host(page))).map((detail: { selected: string | null }) => detail.selected)).toEqual(['lint', null])
})

test('keyboard: one node in the tab order, arrows follow edges, Enter selects, Alt+arrow moves', async ({ page, renderScenario, tab }) => {
  await renderScenario(`<button>Before</button>${flow()}`)
  await page.getByRole('button', { name: 'Before' }).focus()
  await tab()
  await expect(node(page, 'checkout')).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(node(page, 'install')).toBeFocused()
  await page.keyboard.press('ArrowRight')
  const first = (await node(page, 'lint').evaluate((element) => element.matches(':focus'))) ? 'lint' : 'test'
  const other = first === 'lint' ? 'test' : 'lint'
  await expect(node(page, first)).toBeFocused()
  const positions = await layout(page)
  await page.keyboard.press(positions[other].y > positions[first].y ? 'ArrowDown' : 'ArrowUp')
  await expect(node(page, other)).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await expect(node(page, 'install')).toBeFocused()
  await expect(node(page, 'install')).toHaveAttribute('tabindex', '0')
  await expect(node(page, 'checkout')).toHaveAttribute('tabindex', '-1')

  await page.keyboard.press('Enter')
  await expect(host(page)).toHaveJSProperty('selected', 'install')

  const before = (await layout(page)).install
  await page.keyboard.press('Alt+ArrowDown')
  await page.keyboard.press('Shift+Alt+ArrowRight')
  expect((await layout(page)).install).toEqual({ x: before.x + 24, y: before.y + 8 })
  expect((await stored(page)).positions.install).toEqual({ x: before.x + 24, y: before.y + 8 })
})

test('Shift+F10 on a focused node opens its context menu', async ({ page, renderScenario }) => {
  await renderScenario(flow())
  await host(page).evaluate(async (element: Flow) => {
    element.renderContextMenu = ({ node }) => {
      if (!node) return undefined
      const heading = document.createElement('h6')
      heading.textContent = node.label
      const details = document.createElement('c2-menu-item')
      details.setAttribute('value', 'flow:details')
      details.textContent = 'Show details'
      return [heading, details]
    }
    await element.updateComplete
  })
  await node(page, 'checkout').focus()
  await page.keyboard.press('Shift+F10')
  await expect(item(page, 'flow:details')).toBeVisible()
  await expect(page.locator('c2-flow c2-context-menu h6').first()).toHaveText('Checkout')
})

test('locked keeps nodes in place but still selects them; Lock layout in the menu toggles it', async ({ page, renderScenario }) => {
  await renderScenario(flow({ attributes: 'locked' }))
  const before = await layout(page)
  await drag(page, node(page, 'build'), 0, 80)
  expect(await layout(page)).toEqual(before)

  await rightClickCanvas(page)
  await expect(item(page, 'flow:lock')).toHaveJSProperty('checked', true)
  await item(page, 'flow:lock').click()
  await expect(host(page)).toHaveJSProperty('locked', false)
  await drag(page, node(page, 'build'), 0, 80)
  expect((await layout(page)).build).not.toEqual(before.build)
})

test('a cycle is laid out by its forward edges and its closing edge is routed as a back edge', async ({ page, renderScenario }) => {
  await renderScenario(flow({ edges: [...EDGES, { source: 'deploy', target: 'build' }, { source: 'lint', target: 'lint' }] }))
  const positions = await layout(page)
  expect(positions.build.x).toBeLessThan(positions.deploy.x)
  await expect(page.locator('c2-flow .edge')).toHaveCount(8)
  await expect(page.locator('c2-flow .edge--back')).toHaveCount(2)
})

test('renderNode and a node:<id> slot replace the node body', async ({ page, renderScenario }) => {
  await renderScenario(flow({ inner: '<span slot="node:deploy" class="slotted">Ship it</span>' }))
  await host(page).evaluate(async (element: Flow) => {
    element.renderNode = ({ node, status }) => {
      const body = document.createElement('strong')
      body.className = 'custom-body'
      body.textContent = `${node.label} is ${status}`
      return body
    }
    await element.updateComplete
  })
  await expect(node(page, 'test').locator('.custom-body')).toHaveText('Test is running')
  await expect(page.locator('c2-flow .slotted')).toBeVisible()
  await expect(node(page, 'deploy').locator('.custom-body')).toBeHidden()
})

test('a status change restyles the node and its edges without moving anything', async ({ page, renderScenario }) => {
  await renderScenario(flow())
  const before = await layout(page)
  await host(page).evaluate(async (element: Flow) => {
    element.nodes = element.nodes.map((node) => (node.id === 'test' ? { ...node, status: 'error' } : node))
    await element.updateComplete
  })
  await expect(node(page, 'test')).toHaveClass(/status--error/)
  await expect(page.locator('c2-flow .edge--failed')).toHaveCount(1)
  expect(await layout(page)).toEqual(before)
})

test('Ctrl/⌘ + plus, minus and 0 zoom and fit while focus is in the flow; the bare keys do nothing', async ({ page, renderScenario }) => {
  await renderScenario(flow())
  const scale = () => page.locator('c2-flow .viewport').evaluate((element) => Number(/scale\(([\d.]+)\)/.exec((element as HTMLElement).style.transform)?.[1]))
  const fitted = await scale()
  // The modifier the page reads as `mod`. Playwright's ControlOrMeta follows the host OS instead, which differs on macOS.
  const mod = await page.evaluate(() =>
    /mac|iphone|ipad|ipod/i.test((navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform)
      ? 'Meta'
      : 'Control',
  )
  await node(page, 'checkout').focus()

  await page.keyboard.press('-')
  await page.keyboard.press('0')
  expect(await scale()).toBe(fitted)

  await page.keyboard.press(`${mod}+-`)
  await expect.poll(scale).toBeCloseTo(fitted / 1.2, 3)
  await page.keyboard.press(`${mod}+=`)
  await page.keyboard.press(`${mod}+=`)
  await expect.poll(scale).toBeCloseTo(fitted * 1.2, 3)
  await page.keyboard.press(`${mod}+0`)
  await expect.poll(scale).toBeCloseTo(fitted, 3)
  await expect(item(page, 'flow:zoom-in')).toHaveCount(0)
})

/** Per edge, in `edges` order: the stroke of its line and the box and colour of its arrowhead, in page pixels. */
const arrows = (page: Page) =>
  host(page).evaluate((element) => {
    const root = element.shadowRoot!
    const paths = [...root.querySelectorAll<SVGPathElement>('path.edge:not(.edge--draft)')]
    return [...root.querySelectorAll<HTMLElement>('.arrow')].map((arrow, index) => {
      const box = arrow.getBoundingClientRect()
      return {
        stroke: paths[index] ? getComputedStyle(paths[index]).stroke : null,
        color: getComputedStyle(arrow).backgroundColor,
        display: getComputedStyle(arrow).display,
        opacity: Number(getComputedStyle(arrow).opacity),
        box: { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height },
      }
    })
  })

/** The point halfway along each edge line, in page pixels. */
const midpoints = (page: Page) =>
  host(page).evaluate((element) =>
    [...element.shadowRoot!.querySelectorAll<SVGPathElement>('path.edge')].map((path) => {
      const point = path.getPointAtLength(path.getTotalLength() / 2).matrixTransform(path.getScreenCTM()!)
      return { x: point.x, y: point.y }
    }),
  )

test.describe('arrowheads', () => {
  test('every edge ends in an arrowhead at its target, in the colour of the edge', async ({ page, renderScenario }) => {
    await renderScenario(flow())
    const marks = await arrows(page)
    expect(marks).toHaveLength(EDGES.length)
    for (const [index, edge] of EDGES.entries()) {
      const target = (await node(page, edge.target).boundingBox())!
      const { box, color, stroke } = marks[index]
      // The tip stops at the target's incoming handle, centred on its incoming side.
      expect(box.right).toBeLessThan(target.x)
      expect(box.right).toBeGreaterThan(target.x - 8)
      expect(Math.abs((box.top + box.bottom) / 2 - (target.y + target.height / 2))).toBeLessThan(1)
      expect(box.width).toBeGreaterThan(2)
      expect(color).toBe(stroke)
    }
    // Idle, done and active edges each have their own colour.
    expect(new Set(marks.map((mark) => mark.color)).size).toBe(3)
  })

  test('arrowheads follow failed and dotted edges, the highlight, and point down in a top-to-bottom step flow', async ({ page, renderScenario }) => {
    const nodes = NODES.map((step) =>
      step.id === 'test' ? { ...step, status: 'error' as const } : step.id === 'build' ? { ...step, status: 'skipped' as const } : step,
    )
    await renderScenario(flow({ nodes, attributes: 'direction="TB" edge-type="step" open-delay="0"' }))
    const marks = await arrows(page)
    for (const mark of marks) expect(mark.color).toBe(mark.stroke)
    // test → build has failed: the error colour, shared by line and arrow.
    expect(marks[4].color).toBe('rgb(220, 38, 38)')
    for (const [index, edge] of EDGES.entries()) {
      const target = (await node(page, edge.target).boundingBox())!
      const { box } = marks[index]
      expect(box.bottom).toBeLessThan(target.y)
      expect(box.bottom).toBeGreaterThan(target.y - 8)
      expect(Math.abs((box.left + box.right) / 2 - (target.x + target.width / 2))).toBeLessThan(1)
    }

    // Hovering a node dims the other edges' arrowheads with their lines.
    await node(page, 'deploy').hover()
    await expect.poll(async () => (await arrows(page)).map((mark) => mark.opacity)).toEqual([0.35, 0.35, 0.35, 0.35, 0.35, 1])
  })

  test('--c2-flow__arrow--display: none turns the arrowheads off and --c2-flow__arrow--size sizes them', async ({ page, renderScenario }) => {
    await renderScenario(flow({ attributes: 'style="--c2-flow__arrow--size: 12px"' }))
    const zoom = await page.locator('c2-flow .viewport').evaluate((element) => Number(/scale\(([\d.]+)\)/.exec((element as HTMLElement).style.transform)?.[1]))
    for (const mark of await arrows(page)) expect(mark.box.width).toBeCloseTo(12 * zoom, 1)

    await host(page).evaluate((element) => element.style.setProperty('--c2-flow__arrow--display', 'none'))
    await expect(page.locator('c2-flow .arrow').first()).toBeHidden()
    for (const mark of await arrows(page)) expect(mark.display).toBe('none')
    await expect(page.locator('c2-flow .edge')).toHaveCount(EDGES.length)
  })
})

test.describe('edge labels', () => {
  const DECISION: FlowNode[] = [
    { id: 'missed', label: 'Missed the last train' },
    { id: 'bus', label: 'Book the night bus' },
    { id: 'walk', label: 'Walk home' },
  ]
  const BRANCHES: FlowEdge[] = [
    { source: 'missed', target: 'bus', label: 'yes' },
    { source: 'missed', target: 'walk', label: 'no' },
  ]

  async function expectLabelsAtMidpoints(page: Page) {
    const points = await midpoints(page)
    const labels = page.locator('c2-flow .edge-label')
    await expect(labels).toHaveText(['yes', 'no'])
    for (const [index, point] of points.entries()) {
      const { x, y } = await center(labels.nth(index))
      expect(Math.abs(x - point.x)).toBeLessThan(1.5)
      expect(Math.abs(y - point.y)).toBeLessThan(1.5)
    }
  }

  test('a label sits halfway along its edge, scales with the canvas and is read with the relations', async ({ page, renderScenario }) => {
    await renderScenario(flow({ nodes: DECISION, edges: BRANCHES }))
    await expectLabelsAtMidpoints(page)
    const before = (await page.locator('c2-flow .edge-label').first().boundingBox())!

    await expect(node(page, 'missed')).toHaveAccessibleDescription('Before Book the night bus, yes; Walk home, no.')
    await expect(node(page, 'bus')).toHaveAccessibleDescription('After Missed the last train, yes.')
    await accessible(page)

    await host(page).evaluate(async (element: Flow) => {
      element.zoomOut()
      await element.updateComplete
    })
    await expectLabelsAtMidpoints(page)
    const after = (await page.locator('c2-flow .edge-label').first().boundingBox())!
    expect(after.height / before.height).toBeCloseTo(1 / 1.2, 1)
  })

  test('labels sit at the midpoint of step edges and back edges too, and an unlabelled edge has none', async ({ page, renderScenario }) => {
    const edges: FlowEdge[] = [...BRANCHES, { source: 'walk', target: 'missed', label: 'retry' }, { source: 'bus', target: 'walk' }]
    await renderScenario(flow({ nodes: DECISION, edges, attributes: 'edge-type="step" direction="TB"' }))
    const points = await midpoints(page)
    const labels = page.locator('c2-flow .edge-label')
    await expect(labels).toHaveText(['yes', 'no', 'retry'])
    for (const index of [0, 1, 2]) {
      const { x, y } = await center(labels.nth(index))
      expect(Math.abs(x - points[index].x)).toBeLessThan(1.5)
      expect(Math.abs(y - points[index].y)).toBeLessThan(1.5)
    }
  })

  test('labels let a pan through in a read-only flow', async ({ page, renderScenario }) => {
    await renderScenario(flow({ nodes: DECISION, edges: BRANCHES }))
    await expect(page.locator('c2-flow .edge-label').first()).toHaveCSS('pointer-events', 'none')
  })
})

test.describe('status marker', () => {
  test('--c2-flow__marker--display: none hides the marker and the label starts at the padding', async ({ page, renderScenario }) => {
    await renderScenario(flow({ attributes: 'open-delay="0"' }))
    const marker = node(page, 'lint').locator('.body > .status')
    const label = node(page, 'lint').locator('.label')
    await expect(marker).toBeVisible()
    const shown = (await label.boundingBox())!

    await host(page).evaluate(async (element: Flow) => {
      element.style.setProperty('--c2-flow__marker--display', 'none')
      await element.updateComplete
    })
    await expect(marker).toBeHidden()
    // Measured in canvas pixels, relative to the node: the label starts at the padding and keeps its line.
    const offset = await node(page, 'lint').evaluate((element: HTMLElement) => {
      const zoom = element.getBoundingClientRect().width / element.offsetWidth
      const box = element.getBoundingClientRect()
      const text = element.querySelector('.label')!.getBoundingClientRect()
      const style = getComputedStyle(element)
      return {
        left: (text.left - box.left) / zoom,
        expected: Number.parseFloat(style.borderLeftWidth) + Number.parseFloat(style.paddingLeft),
        top: (text.top - box.top) / zoom,
        expectedTop: Number.parseFloat(style.borderTopWidth) + Number.parseFloat(style.paddingTop),
      }
    })
    expect(offset.left).toBeCloseTo(offset.expected, 0)
    expect(offset.top).toBeCloseTo(offset.expectedTop, 0)
    const hidden = (await label.boundingBox())!
    expect(hidden.x).toBeLessThan(shown.x)
    expect(Math.abs(hidden.y - shown.y)).toBeLessThan(0.5)
    // The hover card keeps its own marker.
    await node(page, 'lint').hover()
    await expect(page.locator('c2-flow .card .status')).toBeVisible()
  })
})
