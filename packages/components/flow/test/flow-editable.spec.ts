import type { Locator, Page } from '@playwright/test'
import type { Flow, FlowEdge, FlowNode } from '../src/flow'
import { test, expect, accessible } from '../../../../tests/component-fixture'

const NODES: FlowNode[] = [
  { id: 'idea', label: 'Idea' },
  { id: 'draft', label: 'Draft' },
  { id: 'review', label: 'Review' },
  { id: 'publish', label: 'Publish' },
]

const EDGES: FlowEdge[] = [
  { source: 'idea', target: 'draft' },
  { source: 'draft', target: 'review' },
  { source: 'review', target: 'publish' },
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
const editor = (page: Page) => page.locator('c2-flow .label-editor')
const edgeEditor = (page: Page) => page.locator('c2-flow .label-editor--edge')
const edgeLabel = (page: Page) => page.locator('c2-flow .edge-label')

/** The middle of the straight edge between two nodes of the single row the fitted view draws. */
async function between(page: Page, source: string, target: string) {
  const a = (await node(page, source).boundingBox())!
  const b = (await node(page, target).boundingBox())!
  return { x: (a.x + a.width + b.x) / 2, y: (a.y + a.height / 2 + b.y + b.height / 2) / 2 }
}
const item = (page: Page, value: string) => page.locator(`c2-menu-item[value="${value}"]`)
const layout = (page: Page) => host(page).evaluate((element: Flow) => element.getLayout())
const recorded = (page: Page, type?: string) =>
  host(page).evaluate((element, type) => ((element as unknown as { recorded: Recorded[] }).recorded ?? []).filter((r) => !type || r.type === type), type)

/**
 * Plays the application: records every editing event and, unless `controlled` is false, answers it by updating
 * `nodes` and `edges` the way a notes app would.
 */
async function wire(page: Page, controlled = true) {
  await host(page).evaluate((element: Flow, controlled) => {
    const recorded: Recorded[] = []
    ;(element as unknown as { recorded: Recorded[] }).recorded = recorded
    let count = 0
    for (const type of ['node-add', 'node-edit', 'node-delete', 'edge-add', 'edge-delete', 'edge-edit', 'layout-change', 'selection-change']) {
      element.addEventListener(type, (event) => {
        const detail = (event as CustomEvent).detail
        recorded.push({ type, detail: JSON.parse(JSON.stringify(detail)) })
        if (!controlled) return
        if (type === 'node-add') {
          const id = `new-${++count}`
          element.nodes = [...element.nodes, { id, label: `New ${count}`, position: detail.position }]
          if (detail.source) element.edges = [...element.edges, { source: detail.source, target: id }]
        } else if (type === 'node-edit') {
          element.nodes = element.nodes.map((node) => (node.id === detail.id ? { ...node, label: detail.label } : node))
        } else if (type === 'node-delete') {
          element.nodes = element.nodes.filter((node) => node.id !== detail.id)
          element.edges = element.edges.filter((edge) => edge.source !== detail.id && edge.target !== detail.id)
        } else if (type === 'edge-add') {
          element.edges = [...element.edges, { source: detail.source, target: detail.target }]
        } else if (type === 'edge-delete') {
          element.edges = element.edges.filter((edge) => edge.source !== detail.source || edge.target !== detail.target)
        } else if (type === 'edge-edit') {
          element.edges = element.edges.map((edge) => {
            if (edge.source !== detail.source || edge.target !== detail.target) return edge
            const next: FlowEdge = { ...edge, label: detail.label }
            if (!detail.label) delete next.label
            return next
          })
        }
      })
    }
  }, controlled)
}

async function center(locator: Locator) {
  const box = await locator.boundingBox()
  if (!box) throw new Error('Expected a visible target')
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, box }
}

/** A point of empty canvas: below the single row of nodes the fitted view draws. */
async function emptyCanvas(page: Page) {
  const stage = (await page.locator('c2-flow .stage').boundingBox())!
  return { x: stage.x + stage.width / 2, y: stage.y + stage.height - 40 }
}

/** Presses on a node's connection handle and drags to `to`, in steps so the live edge follows. */
async function connect(page: Page, from: string, to: { x: number; y: number }, release = true) {
  await node(page, from).hover()
  const handle = node(page, from).locator('.connector')
  await expect(handle).toHaveCSS('opacity', '1')
  const start = await center(handle)
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move((start.x + to.x) / 2, (start.y + to.y) / 2, { steps: 4 })
  await page.mouse.move(to.x, to.y, { steps: 4 })
  if (release) await page.mouse.up()
}

test.describe('without editable', () => {
  test('a read-only flow has no handles, no edge targets and ignores the editing gestures and keys', async ({ page, renderScenario }) => {
    await renderScenario(flow({ attributes: '' }))
    await wire(page, false)
    const before = await layout(page)
    await expect(page.locator('c2-flow .connector')).toHaveCount(0)
    await expect(page.locator('c2-flow .edge-hit')).toHaveCount(0)
    await expect(page.locator('c2-flow .handle--out')).toHaveCount(3)

    const { x, y } = await emptyCanvas(page)
    await page.mouse.dblclick(x, y)
    await node(page, 'draft').dblclick()
    await expect(editor(page)).toHaveCount(0)
    await node(page, 'draft').focus()
    for (const key of ['n', 'c', 'e', 'F2', 'Delete', 'Backspace']) await page.keyboard.press(key)
    await page.keyboard.press('Enter')
    await expect(editor(page)).toHaveCount(0)

    expect((await recorded(page)).filter((r) => r.type !== 'selection-change')).toEqual([])
    expect(await layout(page)).toEqual(before)
    // A node still opens no built-in menu.
    const point = await center(node(page, 'review'))
    await page.mouse.click(point.x, point.y, { button: 'right' })
    await expect(item(page, 'flow:delete')).toHaveCount(0)
  })

  test('a read-only flow never edits an edge label', async ({ page, renderScenario }) => {
    const edges = EDGES.map((edge) => (edge.target === 'review' ? { ...edge, label: 'done' } : edge))
    await renderScenario(flow({ edges, attributes: '' }))
    await wire(page, false)
    const point = await between(page, 'idea', 'draft')
    await page.mouse.dblclick(point.x, point.y)
    const label = await center(edgeLabel(page))
    await page.mouse.dblclick(label.x, label.y)
    await expect(page.locator('c2-flow .edge.is-selected')).toHaveCount(0)
    await node(page, 'draft').focus()
    for (const key of ['e', 'F2', 'Enter']) await page.keyboard.press(key)
    await expect(edgeEditor(page)).toHaveCount(0)
    await host(page).evaluate((element: Flow) => element.editEdgeLabel('draft', 'review'))
    await expect(edgeEditor(page)).toHaveCount(0)
    expect(await recorded(page, 'edge-edit')).toEqual([])
  })
})

test.describe('editable', () => {
  test('double-clicking empty canvas asks for a node where the pointer is, and adding it moves no other node', async ({ page, renderScenario }) => {
    await renderScenario(flow())
    await wire(page)
    const before = await layout(page)
    const { x, y } = await emptyCanvas(page)
    await page.mouse.dblclick(x, y)

    const [add] = await recorded(page, 'node-add')
    expect(add.detail).toEqual({ position: expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }) })
    expect(add.detail.source).toBeUndefined()
    // The application put the node at that position: it is centred on the double-click.
    const added = await center(node(page, 'new-1'))
    expect(Math.abs(added.x - x)).toBeLessThan(4)
    expect(Math.abs(added.y - y)).toBeLessThan(4)
    const after = await layout(page)
    for (const id of Object.keys(before)) expect(after[id]).toEqual(before[id])
    expect(after['new-1']).toEqual(add.detail.position)

    // The layout is pinned and reported, so it survives the next change too.
    const [change] = await recorded(page, 'layout-change')
    expect(change.detail).toMatchObject({ reason: 'edit', positions: after })
  })

  test('two quick clicks at different spots, or a click then a pan, do not add a node', async ({ page, renderScenario }) => {
    await renderScenario(flow())
    await wire(page, false)
    const { x, y } = await emptyCanvas(page)
    await page.mouse.click(x, y)
    await page.mouse.click(x + 30, y)
    await page.mouse.down()
    await page.mouse.move(x + 80, y, { steps: 4 })
    await page.mouse.up()
    expect(await recorded(page, 'node-add')).toEqual([])
  })

  test('N adds a node beside the focused node, or one connected after the selected node, and focuses it', async ({ page, renderScenario }) => {
    await renderScenario(flow())
    await wire(page)
    await node(page, 'idea').focus()
    await page.keyboard.press('n')
    let [add] = await recorded(page, 'node-add')
    expect(add.detail.source).toBeUndefined()
    await expect(node(page, 'new-1')).toBeFocused()
    await expect(host(page)).toHaveJSProperty('selected', 'new-1')
    // The keyboard picks a free spot beside the focused node, across the layout's axis: the new node covers no other.
    const positions = await layout(page)
    const a = positions['new-1']
    expect(a.x).toBe(positions.idea.x)
    expect(a.y).toBeGreaterThan(positions.idea.y)
    for (const id of ['idea', 'draft', 'review', 'publish']) {
      const b = positions[id]
      expect(Math.abs(a.x - b.x) >= 200 || Math.abs(a.y - b.y) >= 40).toBe(true)
    }

    // On the selected node, N makes a connected node after it.
    await page.keyboard.press('N')
    add = (await recorded(page, 'node-add'))[1]
    expect(add.detail.source).toBe('new-1')
    await expect(node(page, 'new-2')).toBeFocused()
    const after = await layout(page)
    expect(after['new-2'].x).toBeGreaterThan(after['new-1'].x)
    await expect(page.locator('c2-flow .edge')).toHaveCount(4)
  })

  test('an empty editable flow takes focus on its canvas and Enter adds the first node', async ({ page, renderScenario, tab }) => {
    await renderScenario(`<button>Before</button>${flow({ nodes: [], edges: [] })}`)
    await wire(page)
    await page.getByRole('button', { name: 'Before' }).focus()
    await tab()
    const stage = page.locator('c2-flow .stage')
    await expect(stage).toBeFocused()
    await expect(stage).toHaveAttribute('aria-label', 'Empty flow')
    await accessible(page)
    await page.keyboard.press('Enter')
    await expect(node(page, 'new-1')).toBeFocused()
    await expect(stage).not.toHaveAttribute('tabindex', /.*/)

    // Deleting the last node hands focus back to the canvas.
    await page.keyboard.press('Delete')
    await expect(node(page, 'new-1')).toHaveCount(0)
    await expect(stage).toBeFocused()
  })

  test('double-clicking a node opens the inline editor; Enter commits node-edit, Escape cancels, blur commits', async ({ page, renderScenario }) => {
    await renderScenario(flow())
    await wire(page)
    await node(page, 'draft').dblclick()
    await expect(editor(page)).toBeFocused()
    await expect(editor(page)).toHaveValue('Draft')
    await expect(page.locator('c2-flow .card:popover-open')).toHaveCount(0)
    await accessible(page)
    await page.keyboard.type('First draft')
    await page.keyboard.press('Enter')
    await expect(editor(page)).toHaveCount(0)
    expect((await recorded(page, 'node-edit')).map((r) => r.detail)).toEqual([{ id: 'draft', label: 'First draft' }])
    await expect(node(page, 'draft').locator('.label')).toHaveText('First draft')
    await expect(node(page, 'draft')).toBeFocused()

    // Escape cancels without an event, and does not clear the selection.
    await page.keyboard.press('F2')
    await page.keyboard.type('Scrapped')
    await page.keyboard.press('Escape')
    await expect(editor(page)).toHaveCount(0)
    await expect(node(page, 'draft')).toBeFocused()
    await expect(host(page)).toHaveJSProperty('selected', 'draft')

    // Enter on the selected node opens it again; clicking away commits.
    await page.keyboard.press('Enter')
    await expect(editor(page)).toBeFocused()
    await page.keyboard.type('Second draft')
    const { x, y } = await emptyCanvas(page)
    await page.mouse.click(x, y)
    await expect(editor(page)).toHaveCount(0)
    await expect(node(page, 'draft').locator('.label')).toHaveText('Second draft')

    // An unchanged or empty label fires nothing.
    await node(page, 'draft').focus()
    await page.keyboard.press('F2')
    await page.keyboard.press('Enter')
    await page.keyboard.press('F2')
    await page.keyboard.press('ControlOrMeta+a')
    await page.keyboard.press('Backspace')
    await page.keyboard.press('Enter')
    expect(await recorded(page, 'node-edit')).toHaveLength(2)
    // Keys typed in the editor never reach the flow's shortcuts.
    expect(await recorded(page, 'node-delete')).toEqual([])
  })

  test('a node drawn by renderNode gets the editor over its whole body and the same event', async ({ page, renderScenario }) => {
    await renderScenario(flow())
    await wire(page)
    await host(page).evaluate(async (element: Flow) => {
      element.renderNode = ({ node }) => {
        const body = document.createElement('strong')
        body.className = 'custom-body'
        body.textContent = node.label.toUpperCase()
        return body
      }
      await element.updateComplete
    })
    await node(page, 'review').dblclick()
    await expect(editor(page)).toHaveClass(/label-editor--overlay/)
    await expect(editor(page)).toHaveValue('Review')
    await page.keyboard.press('ControlOrMeta+a')
    await page.keyboard.type('Peer review')
    await page.keyboard.press('Enter')
    await expect(node(page, 'review').locator('.custom-body')).toHaveText('PEER REVIEW')
    expect((await recorded(page, 'node-edit'))[0].detail).toEqual({ id: 'review', label: 'Peer review' })
  })

  test('dragging a handle onto another node fires edge-add; onto itself or an existing target fires nothing', async ({ page, renderScenario }) => {
    await renderScenario(flow())
    await wire(page)
    const before = await layout(page)

    await connect(page, 'idea', await center(node(page, 'review')), false)
    await expect(page.locator('c2-flow .edge--draft')).toHaveCount(1)
    await expect(node(page, 'review')).toHaveClass(/is-connect-target/)
    await page.mouse.up()
    await expect(page.locator('c2-flow .edge--draft')).toHaveCount(0)
    expect((await recorded(page, 'edge-add')).map((r) => r.detail)).toEqual([{ source: 'idea', target: 'review' }])
    await expect(page.locator('c2-flow .edge')).toHaveCount(4)

    // Already connected: no duplicate, and the node is not offered as a target.
    await connect(page, 'idea', await center(node(page, 'draft')), false)
    await expect(node(page, 'draft')).not.toHaveClass(/is-connect-target/)
    await page.mouse.up()
    // Back onto itself: no self-loop.
    await connect(page, 'publish', await center(node(page, 'publish')))
    expect(await recorded(page, 'edge-add')).toHaveLength(1)
    expect(await recorded(page, 'node-add')).toEqual([])
    // Connecting is not dragging: nothing moved.
    expect(await layout(page)).toMatchObject(before)
  })

  test('dropping a connection on empty canvas asks for a connected node there; Escape cancels a drag', async ({ page, renderScenario }) => {
    await renderScenario(flow())
    await wire(page)
    const target = await emptyCanvas(page)
    await connect(page, 'draft', target)
    const [add] = await recorded(page, 'node-add')
    expect(add.detail.source).toBe('draft')
    // Its incoming side is where the connection was dropped.
    const box = (await node(page, 'new-1').boundingBox())!
    expect(Math.abs(box.x - target.x)).toBeLessThan(4)
    expect(Math.abs(box.y + box.height / 2 - target.y)).toBeLessThan(4)
    await expect(page.locator('c2-flow .edge')).toHaveCount(4)

    await connect(page, 'idea', await center(node(page, 'publish')), false)
    await page.keyboard.press('Escape')
    await expect(page.locator('c2-flow .edge--draft')).toHaveCount(0)
    await page.mouse.up()
    expect(await recorded(page, 'edge-add')).toEqual([])
    expect(await recorded(page, 'node-add')).toHaveLength(1)
  })

  test('keyboard: C starts a connection, arrows and Tab choose the target, Enter connects and Escape cancels', async ({ page, renderScenario }) => {
    await renderScenario(flow())
    await wire(page)
    await node(page, 'idea').focus()
    await page.keyboard.press('c')
    // Draft is already connected, so the first candidate is the next node in reading order.
    await expect(node(page, 'review')).toHaveClass(/is-connect-target/)
    await expect(page.locator('c2-flow [role="status"]')).toContainText('Connect Idea to Review')
    await expect(page.locator('c2-flow .edge--draft')).toHaveCount(1)
    await page.keyboard.press('ArrowRight')
    await expect(node(page, 'publish')).toHaveClass(/is-connect-target/)
    await page.keyboard.press('Tab')
    await expect(node(page, 'review')).toHaveClass(/is-connect-target/)
    await page.keyboard.press('Shift+Tab')
    await expect(node(page, 'publish')).toHaveClass(/is-connect-target/)
    await expect(node(page, 'idea')).toBeFocused()
    await page.keyboard.press('Enter')
    expect((await recorded(page, 'edge-add')).map((r) => r.detail)).toEqual([{ source: 'idea', target: 'publish' }])
    await expect(page.locator('c2-flow .edge--draft')).toHaveCount(0)

    await page.keyboard.press('c')
    await page.keyboard.press('Escape')
    await expect(page.locator('c2-flow .is-connect-target')).toHaveCount(0)
    await expect(page.locator('c2-flow [role="status"]')).toHaveText('Connection cancelled.')
    expect(await recorded(page, 'edge-add')).toHaveLength(1)
  })

  test('Delete on the focused node fires node-delete and focus moves to a neighbour', async ({ page, renderScenario }) => {
    await renderScenario(flow())
    await wire(page)
    const before = await layout(page)
    await node(page, 'review').focus()
    await page.keyboard.press('Delete')
    expect((await recorded(page, 'node-delete')).map((r) => r.detail)).toEqual([{ id: 'review' }])
    await expect(node(page, 'review')).toHaveCount(0)
    await expect(node(page, 'draft')).toBeFocused()
    // The rest of the diagram stays where it was.
    const after = await layout(page)
    for (const id of ['idea', 'draft', 'publish']) expect(after[id]).toEqual(before[id])

    await page.keyboard.press('Backspace')
    expect((await recorded(page, 'node-delete')).map((r) => r.detail.id)).toEqual(['review', 'draft'])
  })

  test('a click selects an edge, E steps through a node’s edges, Delete fires edge-delete and Escape deselects', async ({ page, renderScenario }) => {
    await renderScenario(flow())
    await wire(page)
    // Click the middle of the draft → review edge.
    const a = (await node(page, 'draft').boundingBox())!
    const b = (await node(page, 'review').boundingBox())!
    await page.mouse.click((a.x + a.width + b.x) / 2, (a.y + a.height / 2 + b.y + b.height / 2) / 2)
    await expect(page.locator('c2-flow .edge.is-selected')).toHaveCount(1)
    await expect(page.locator('c2-flow [role="status"]')).toContainText('Edge from Draft to Review selected')

    // Keyboard focus is still where it was; Delete removes the selected edge, not a node.
    await node(page, 'idea').focus()
    await page.keyboard.press('Delete')
    expect((await recorded(page, 'edge-delete')).map((r) => r.detail)).toEqual([{ source: 'draft', target: 'review' }])
    expect(await recorded(page, 'node-delete')).toEqual([])
    await expect(page.locator('c2-flow .edge')).toHaveCount(2)
    await expect(page.locator('c2-flow .edge.is-selected')).toHaveCount(0)

    await node(page, 'review').focus()
    await page.keyboard.press('e')
    await expect(page.locator('c2-flow [role="status"]')).toContainText('Edge from Review to Publish selected')
    await page.keyboard.press('Escape')
    await expect(page.locator('c2-flow .edge.is-selected')).toHaveCount(0)
    await node(page, 'draft').focus()
    await page.keyboard.press('e')
    await expect(page.locator('c2-flow [role="status"]')).toContainText('Edge from Idea to Draft selected')
    await page.keyboard.press('e')
    // Draft has a single edge left: E stays on it.
    await expect(page.locator('c2-flow .edge.is-selected')).toHaveCount(1)
    await page.keyboard.press('Backspace')
    expect((await recorded(page, 'edge-delete')).map((r) => r.detail)).toEqual([
      { source: 'draft', target: 'review' },
      { source: 'idea', target: 'draft' },
    ])
  })

  test('the context menu adds a node on the canvas, renames and deletes a node, and deletes an edge', async ({ page, renderScenario }) => {
    await renderScenario(flow())
    await wire(page)
    const { x, y } = await emptyCanvas(page)
    await page.mouse.click(x, y, { button: 'right' })
    await expect(item(page, 'flow:add-node')).toBeVisible()
    await expect(item(page, 'flow:zoom-in')).toBeVisible()
    await item(page, 'flow:add-node').click()
    await expect(node(page, 'new-1')).toBeVisible()
    const added = await center(node(page, 'new-1'))
    expect(Math.abs(added.x - x)).toBeLessThan(4)

    let point = await center(node(page, 'draft'))
    await page.mouse.click(point.x, point.y, { button: 'right' })
    await expect(item(page, 'flow:zoom-in')).toHaveCount(0)
    await item(page, 'flow:rename').click()
    await expect(editor(page)).toBeFocused()
    await page.keyboard.press('ControlOrMeta+a')
    await page.keyboard.type('Outline')
    await page.keyboard.press('Enter')
    await expect(node(page, 'draft').locator('.label')).toHaveText('Outline')

    point = await center(node(page, 'publish'))
    await page.mouse.click(point.x, point.y, { button: 'right' })
    await item(page, 'flow:delete').click()
    await expect(node(page, 'publish')).toHaveCount(0)

    const a = (await node(page, 'idea').boundingBox())!
    const b = (await node(page, 'draft').boundingBox())!
    await page.mouse.click((a.x + a.width + b.x) / 2, (a.y + a.height / 2 + b.y + b.height / 2) / 2, { button: 'right' })
    await expect(item(page, 'flow:rename')).toHaveCount(0)
    await item(page, 'flow:delete').click()
    expect((await recorded(page, 'edge-delete')).map((r) => r.detail)).toEqual([{ source: 'idea', target: 'draft' }])
    expect((await recorded(page, 'node-delete')).map((r) => r.detail)).toEqual([{ id: 'publish' }])
  })

  test('double-clicking an edge opens the label editor at its middle; Enter commits edge-edit and the label shows', async ({ page, renderScenario }) => {
    await renderScenario(flow())
    await wire(page)
    const point = await between(page, 'draft', 'review')
    await page.mouse.dblclick(point.x, point.y)
    await expect(edgeEditor(page)).toBeFocused()
    await expect(edgeEditor(page)).toHaveValue('')
    await expect(edgeEditor(page)).toHaveAccessibleName('Label of the edge from Draft to Review')
    const field = await center(edgeEditor(page))
    expect(Math.abs(field.x - point.x)).toBeLessThan(2)
    expect(Math.abs(field.y - point.y)).toBeLessThan(2)
    await accessible(page)
    await page.keyboard.type(' approved ')
    await page.keyboard.press('Enter')
    await expect(edgeEditor(page)).toHaveCount(0)
    expect((await recorded(page, 'edge-edit')).map((r) => r.detail)).toEqual([{ source: 'draft', target: 'review', label: 'approved' }])
    await expect(edgeLabel(page)).toHaveText('approved')
    await expect(node(page, 'draft')).toHaveAccessibleDescription('After Idea. Before Review, approved.')
    // Nothing moved, and the flow never changed `edges` itself: the label came from the application.
    expect(await recorded(page, 'node-edit')).toEqual([])

    // Double-clicking the label edits it; clearing it removes it.
    const label = await center(edgeLabel(page))
    await page.mouse.dblclick(label.x, label.y)
    await expect(edgeEditor(page)).toHaveValue('approved')
    await page.keyboard.press('ControlOrMeta+a')
    await page.keyboard.press('Backspace')
    await page.keyboard.press('Enter')
    expect((await recorded(page, 'edge-edit')).map((r) => r.detail.label)).toEqual(['approved', ''])
    await expect(edgeLabel(page)).toHaveCount(0)

    // An unchanged label fires nothing, and leaving the field commits.
    await page.mouse.dblclick(point.x, point.y)
    await page.keyboard.press('Enter')
    await page.mouse.dblclick(point.x, point.y)
    await page.keyboard.type('maybe')
    const { x, y } = await emptyCanvas(page)
    await page.mouse.click(x, y)
    await expect(edgeEditor(page)).toHaveCount(0)
    expect((await recorded(page, 'edge-edit')).map((r) => r.detail.label)).toEqual(['approved', '', 'maybe'])
    await expect(edgeLabel(page)).toHaveText('maybe')
  })

  test('keyboard: Enter or F2 on the selected edge edits its label, Escape cancels', async ({ page, renderScenario }) => {
    const edges = EDGES.map((edge) => (edge.target === 'draft' ? { ...edge, label: 'yes' } : edge))
    await renderScenario(flow({ edges }))
    await wire(page)
    await node(page, 'draft').focus()
    await page.keyboard.press('e')
    await expect(page.locator('c2-flow [role="status"]')).toContainText('Edge from Idea to Draft, labelled yes, 1 of 2, selected')
    await page.keyboard.press('Enter')
    await expect(edgeEditor(page)).toBeFocused()
    await expect(edgeEditor(page)).toHaveValue('yes')
    await page.keyboard.type('no')
    await page.keyboard.press('Escape')
    await expect(edgeEditor(page)).toHaveCount(0)
    await expect(node(page, 'draft')).toBeFocused()
    // Escape in the editor leaves the edge selected and the label as it was.
    await expect(page.locator('c2-flow .edge.is-selected')).toHaveCount(1)
    await expect(edgeLabel(page)).toHaveText('yes')
    expect(await recorded(page, 'edge-edit')).toEqual([])

    await page.keyboard.press('F2')
    await expect(edgeEditor(page)).toBeFocused()
    await page.keyboard.press('ControlOrMeta+a')
    await page.keyboard.type('always')
    await page.keyboard.press('Enter')
    expect((await recorded(page, 'edge-edit')).map((r) => r.detail)).toEqual([{ source: 'idea', target: 'draft', label: 'always' }])
    await expect(edgeLabel(page)).toHaveText('always')
    await expect(node(page, 'draft')).toBeFocused()
    // No node was renamed or deleted on the way.
    expect(await recorded(page, 'node-edit')).toEqual([])
    expect(await recorded(page, 'node-delete')).toEqual([])
  })

  test('Edit label in the edge context menu opens the editor; editLabel on a node still renames it', async ({ page, renderScenario }) => {
    await renderScenario(flow())
    await wire(page)
    const point = await between(page, 'review', 'publish')
    await page.mouse.click(point.x, point.y, { button: 'right' })
    await expect(item(page, 'flow:rename')).toHaveCount(0)
    await expect(item(page, 'flow:edit-label')).toBeVisible()
    await item(page, 'flow:edit-label').click()
    await expect(edgeEditor(page)).toBeFocused()
    await page.keyboard.type('ship it')
    await page.keyboard.press('Enter')
    expect((await recorded(page, 'edge-edit')).map((r) => r.detail)).toEqual([{ source: 'review', target: 'publish', label: 'ship it' }])

    // The label is part of its edge: a right-click on it opens the same menu.
    const label = await center(edgeLabel(page))
    await page.mouse.click(label.x, label.y, { button: 'right' })
    await expect(item(page, 'flow:edit-label')).toBeVisible()
    await item(page, 'flow:delete').click()
    expect((await recorded(page, 'edge-delete')).map((r) => r.detail)).toEqual([{ source: 'review', target: 'publish' }])
  })

  test('the selected edge, its arrowhead and its label take the selection colour; the live edge has an arrowhead too', async ({ page, renderScenario }) => {
    const edges = EDGES.map((edge) => (edge.target === 'review' ? { ...edge, label: 'ok' } : edge))
    await renderScenario(flow({ edges }))
    await edgeLabel(page).click()
    await expect(page.locator('c2-flow .edge.is-selected')).toHaveCount(1)
    const colours = () =>
      host(page).evaluate((element) => {
        const root = element.shadowRoot!
        return [
          getComputedStyle(root.querySelector('path.edge.is-selected')!).stroke,
          getComputedStyle(root.querySelector('.arrow.is-selected')!).backgroundColor,
          getComputedStyle(root.querySelector('.edge-label.is-selected')!).borderTopColor,
        ]
      })
    // The colours ease in.
    await expect.poll(colours).toEqual(['rgb(2, 101, 220)', 'rgb(2, 101, 220)', 'rgb(2, 101, 220)'])

    await connect(page, 'idea', await center(node(page, 'publish')), false)
    const draft = () =>
      host(page).evaluate((element) => {
        const root = element.shadowRoot!
        return [getComputedStyle(root.querySelector('path.edge--draft')!).stroke, getComputedStyle(root.querySelector('.arrow.mark--draft')!).backgroundColor]
      })
    await expect.poll(draft).toEqual(['rgb(2, 101, 220)', 'rgb(2, 101, 220)'])
    const tip = (await page.locator('c2-flow .arrow.mark--draft').boundingBox())!
    const target = (await node(page, 'publish').boundingBox())!
    expect(tip.x + tip.width).toBeLessThan(target.x)
    expect(tip.x + tip.width).toBeGreaterThan(target.x - 8)
    await page.mouse.up()
    await expect(page.locator('c2-flow .arrow.mark--draft')).toHaveCount(0)
  })

  test('connection handles show on hover and selection, on the side the flow runs to', async ({ page, renderScenario }) => {
    await renderScenario(flow({ attributes: 'editable direction="TB"' }))
    const handle = node(page, 'draft').locator('.connector')
    await expect(handle).toHaveCSS('opacity', '0')
    await node(page, 'draft').hover()
    await expect(handle).toHaveCSS('opacity', '1')
    const box = (await node(page, 'draft').boundingBox())!
    const dot = await center(handle)
    expect(Math.abs(dot.y - (box.y + box.height))).toBeLessThan(2)
    expect(Math.abs(dot.x - (box.x + box.width / 2))).toBeLessThan(2)
    await accessible(page)
  })
})

test.describe('node positions', () => {
  test('a node with a position is placed there, a saved layout wins over it, and a changed position moves it', async ({ page, renderScenario }) => {
    const nodes: FlowNode[] = [...NODES, { id: 'aside', label: 'Aside', position: { x: 40, y: 400 } }]
    await renderScenario(flow({ nodes, attributes: 'storage-key="flow-test:positions"' }))
    expect((await layout(page)).aside).toEqual({ x: 40, y: 400 })
    // Nodes without a position still follow the auto layout.
    const positions = await layout(page)
    expect(positions.idea.x).toBeLessThan(positions.draft.x)

    await host(page).evaluate(async (element: Flow) => {
      element.setLayout({ ...element.getLayout(), aside: { x: 100, y: 500 } })
      await element.updateComplete
    })
    await renderScenario(flow({ nodes, attributes: 'storage-key="flow-test:positions"' }))
    expect((await layout(page)).aside).toEqual({ x: 100, y: 500 })

    await host(page).evaluate(async (element: Flow) => {
      element.nodes = element.nodes.map((node) => (node.id === 'aside' ? { ...node, position: { x: 0, y: 300 } } : node))
      await element.updateComplete
    })
    expect((await layout(page)).aside).toEqual({ x: 0, y: 300 })
  })
})

test.describe('actions', () => {
  const withActions = (attributes: string) =>
    flow({ attributes }).replace(
      '></c2-flow>',
      '><button slot="actions" type="button">Add node</button><button slot="actions" type="button">Auto layout</button><button slot="actions" type="button">Fit</button></c2-flow>',
    )

  test('the toolbar sits along the edge actions-placement names, in a row or a column', async ({ page, renderScenario }) => {
    for (const placement of ['top', 'right', 'bottom', 'left'] as const) {
      await renderScenario(withActions(`editable actions-placement="${placement}"`))
      const box = (await host(page).boundingBox())!
      const toolbar = page.getByRole('toolbar', { name: 'Flow actions' })
      await expect(toolbar).toHaveAttribute('aria-orientation', placement === 'left' || placement === 'right' ? 'vertical' : 'horizontal')
      const add = (await page.getByRole('button', { name: 'Add node' }).boundingBox())!
      const fit = (await page.getByRole('button', { name: 'Fit' }).boundingBox())!
      if (placement === 'top') expect(add.y - box.y).toBeLessThan(32)
      if (placement === 'bottom') expect(box.y + box.height - (add.y + add.height)).toBeLessThan(32)
      if (placement === 'left') expect(add.x - box.x).toBeLessThan(32)
      if (placement === 'right') expect(box.x + box.width - (add.x + add.width)).toBeLessThan(32)
      if (placement === 'top' || placement === 'bottom') {
        expect(fit.x).toBeGreaterThan(add.x)
        expect(Math.abs(fit.y - add.y)).toBeLessThan(1)
      } else {
        expect(fit.y).toBeGreaterThan(add.y)
      }
    }
  })

  test('the arrow keys move along the toolbar and wrap', async ({ page, renderScenario }) => {
    await renderScenario(withActions('editable actions-placement="left"'))
    await page.getByRole('button', { name: 'Add node' }).focus()
    await page.keyboard.press('ArrowDown')
    await expect(page.getByRole('button', { name: 'Auto layout' })).toBeFocused()
    await page.keyboard.press('End')
    await expect(page.getByRole('button', { name: 'Fit' })).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(page.getByRole('button', { name: 'Add node' })).toBeFocused()
    await page.keyboard.press('ArrowUp')
    await expect(page.getByRole('button', { name: 'Fit' })).toBeFocused()
  })

  test('a click on an action does not pan the canvas, and addNode() asks for a node like N', async ({ page, renderScenario }) => {
    await renderScenario(withActions('editable'))
    await wire(page)
    await host(page).evaluate((element: Flow) => {
      element.querySelector('button')!.addEventListener('click', () => element.addNode())
    })
    const before = await node(page, 'idea').boundingBox()
    await page.getByRole('button', { name: 'Add node' }).click()
    expect(await node(page, 'idea').boundingBox()).toEqual(before)
    const [add] = await recorded(page, 'node-add')
    expect(add.detail.position).toEqual(expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }))
    await expect(node(page, 'new-1')).toBeVisible()
  })

  test('addNode() with a node selected connects the new one after it, so repeated adds make a chain', async ({ page, renderScenario }) => {
    await renderScenario(withActions('editable'))
    await wire(page)
    await host(page).evaluate((element: Flow) => {
      element.querySelector('button')!.addEventListener('click', () => element.addNode())
    })
    await node(page, 'publish').click()
    const add = page.getByRole('button', { name: 'Add node' })
    await add.click()
    await add.click()
    expect((await recorded(page, 'node-add')).map((r) => r.detail.source)).toEqual(['publish', 'new-1'])
    const positions = await layout(page)
    expect(positions['new-1'].x).toBeGreaterThan(positions.publish.x)
    expect(positions['new-2'].x).toBeGreaterThan(positions['new-1'].x)
    await expect(host(page)).toHaveJSProperty('selected', 'new-2')
  })

  test('a node added out of sight is brought into view; nothing selected, it goes in the middle of the view', async ({ page, renderScenario }) => {
    await renderScenario(withActions('editable'))
    await wire(page)
    await host(page).evaluate((element: Flow) => {
      element.querySelector('button')!.addEventListener('click', () => element.addNode())
    })
    const stage = page.locator('c2-flow .stage')
    /** Fully in sight, clear of the edges by `margin` pixels. */
    const inView = async (id: string, margin = 0) => {
      const view = (await stage.boundingBox())!
      const box = (await node(page, id).boundingBox())!
      return (
        box.x >= view.x + margin &&
        box.y >= view.y + margin &&
        box.x + box.width <= view.x + view.width - margin &&
        box.y + box.height <= view.y + view.height - margin
      )
    }

    // Nothing selected: the middle of the view.
    await page.getByRole('button', { name: 'Add node' }).click()
    expect((await recorded(page, 'node-add'))[0].detail.source).toBeUndefined()
    const view = (await stage.boundingBox())!
    const added = await center(node(page, 'new-1'))
    expect(Math.abs(added.x - (view.x + view.width / 2))).toBeLessThan(view.width / 4)
    expect(await inView('new-1')).toBe(true)

    // Pan until the selected node sits at the right edge: the next node, after it, would land off the canvas.
    await node(page, 'publish').click()
    const publish = await center(node(page, 'publish'))
    const from = await emptyCanvas(page)
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(from.x + (view.x + view.width - 30 - publish.x), from.y, { steps: 6 })
    await page.mouse.up()
    // A click on a node cut by the edge brings it in by panning, not by scrolling the clipped stage.
    const scroll = () => stage.evaluate((element) => [element.scrollLeft, element.scrollTop])
    await node(page, 'publish').click()
    await expect.poll(scroll).toEqual([0, 0])
    await page.getByRole('button', { name: 'Add node' }).click()
    await expect(node(page, 'new-2')).toBeVisible()
    // Panned in with room to spare, not left flush against the edge where the toolbar may sit.
    await expect.poll(() => inView('new-2', 20)).toBe(true)
    await expect.poll(scroll).toEqual([0, 0])
    expect((await recorded(page, 'node-add'))[1].detail.source).toBe('publish')
  })

  test('dragNewNode(): drag the add button onto the canvas to drop a node there; elsewhere or Escape cancels', async ({ page, renderScenario }) => {
    await renderScenario(withActions('editable no-double-click-add'))
    await wire(page)
    await host(page).evaluate((element: Flow) => {
      const button = element.querySelector('button')!
      button.addEventListener('pointerdown', (event) => element.dragNewNode(event))
      button.addEventListener('click', () => element.addNode())
    })
    const ghost = page.locator('c2-flow .ghost')
    const button = await center(page.getByRole('button', { name: 'Add node' }))
    // Empty canvas below the row of nodes, clear of the edge (a node dropped at the very edge is panned into view).
    const stage = (await page.locator('c2-flow .stage').boundingBox())!
    const drop = { x: stage.x + stage.width / 2, y: stage.y + stage.height * 0.75 }

    // Released outside the canvas: nothing. The placeholder shows only over the canvas.
    await page.mouse.move(button.x, button.y)
    await page.mouse.down()
    await page.mouse.move(drop.x, drop.y, { steps: 8 })
    await expect(ghost).toBeVisible()
    const placeholder = await center(ghost)
    expect(Math.abs(placeholder.x - drop.x)).toBeLessThan(4)
    expect(Math.abs(placeholder.y - drop.y)).toBeLessThan(4)
    const outside = (await host(page).boundingBox())!
    await page.mouse.move(outside.x + outside.width / 2, outside.y + outside.height + 40, { steps: 4 })
    await expect(ghost).toHaveCount(0)
    await page.mouse.up()
    expect(await recorded(page, 'node-add')).toEqual([])

    // Escape cancels a drag in progress.
    await page.mouse.move(button.x, button.y)
    await page.mouse.down()
    await page.mouse.move(drop.x, drop.y, { steps: 8 })
    await page.keyboard.press('Escape')
    await expect(ghost).toHaveCount(0)
    await page.mouse.up()
    expect(await recorded(page, 'node-add')).toEqual([])

    // Dropped on the canvas: a node where it was released, selected and focused.
    await page.mouse.move(button.x, button.y)
    await page.mouse.down()
    await page.mouse.move(drop.x, drop.y, { steps: 8 })
    await page.mouse.up()
    await expect(ghost).toHaveCount(0)
    const [add] = await recorded(page, 'node-add')
    expect(add.detail.source).toBeUndefined()
    const added = await center(node(page, 'new-1'))
    expect(Math.abs(added.x - drop.x)).toBeLessThan(4)
    expect(Math.abs(added.y - drop.y)).toBeLessThan(4)
    await expect(node(page, 'new-1')).toBeFocused()

    // A plain click on the same button still adds through addNode().
    await page.getByRole('button', { name: 'Add node' }).click()
    await expect(node(page, 'new-2')).toBeVisible()
    expect(await recorded(page, 'node-add')).toHaveLength(2)

    // A press that wanders past the drag threshold and is released back on the button is one click: one node, not a
    // drop under the toolbar as well.
    await page.mouse.move(button.x, button.y)
    await page.mouse.down()
    await page.mouse.move(button.x + 6, button.y + 3, { steps: 3 })
    await page.mouse.move(button.x, button.y, { steps: 3 })
    await expect(ghost).toHaveCount(0)
    await page.mouse.up()
    await expect(node(page, 'new-3')).toBeVisible()
    expect(await recorded(page, 'node-add')).toHaveLength(3)
    await expect(node(page, 'new-4')).toHaveCount(0)
  })

  test('addNode() from the toolbar goes beside the node the keyboard was on, even though the button took focus', async ({ page, renderScenario }) => {
    await renderScenario(withActions('editable'))
    await wire(page)
    await host(page).evaluate((element: Flow) => {
      element.querySelector('button')!.addEventListener('click', () => element.addNode())
    })
    // Focused from the keyboard, not selected.
    await node(page, 'review').focus()
    await expect(host(page)).toHaveJSProperty('selected', null)
    await page.getByRole('button', { name: 'Add node' }).click()
    const [add] = await recorded(page, 'node-add')
    expect(add.detail.source).toBeUndefined()
    const positions = await layout(page)
    expect(positions['new-1'].x).toBe(positions.review.x)
    expect(positions['new-1'].y).toBeGreaterThan(positions.review.y)

    // Once focus has left the flow, the next add goes to the middle of the view again.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    await page.locator('body').click({ position: { x: 2, y: 2 } })
    await page.getByRole('button', { name: 'Add node' }).click()
    await expect(node(page, 'new-2')).toBeVisible()
    expect((await layout(page))['new-2'].x).not.toBe(positions.review.x)
  })

  test('no-double-click-add: double-clicking empty canvas adds nothing, N and addNode() still do', async ({ page, renderScenario }) => {
    await renderScenario(withActions('editable no-double-click-add'))
    await wire(page)
    await host(page).evaluate((element: Flow) => {
      element.querySelector('button')!.addEventListener('click', () => element.addNode())
    })
    const { x, y } = await emptyCanvas(page)
    await page.mouse.dblclick(x, y)
    expect(await recorded(page, 'node-add')).toEqual([])
    await expect(host(page)).toHaveJSProperty('selected', null)
    // A node still opens its editor on a double-click.
    await node(page, 'draft').dblclick()
    await expect(editor(page)).toBeVisible()
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Add node' }).click()
    await expect(node(page, 'new-1')).toBeVisible()
    await page.keyboard.press('n')
    await expect(node(page, 'new-2')).toBeFocused()
  })

  test('without slotted actions there is no toolbar', async ({ page, renderScenario }) => {
    await renderScenario(flow())
    await expect(page.getByRole('toolbar')).toHaveCount(0)
  })
})
