import type { Locator, Page } from '@playwright/test'
import { test, expect, accessible, hostAria } from '../../../../tests/component-fixture'
import type { MindMapLayout, MindMapNode } from '../src/mind-map-types'

/**
 * The parts of `c2-mind-map` the tests touch. Declared here rather than imported from `../src/mind-map`: that module
 * imports `@c2n/pan-zoom`, whose built declaration of `c2-pan-zoom` would clash with the pan-zoom suite's source one.
 */
interface MindMap extends HTMLElement {
  data: MindMapNode
  layout: MindMapLayout
  editable: boolean
  noDrag: boolean
  updateComplete: Promise<boolean>
  panZoom:
    | (HTMLElement & {
        zoom: number
        view: { x: number; y: number; zoom: number }
        updateComplete: Promise<boolean>
        zoomTo(zoom: number, options?: { animate?: boolean }): unknown
      })
    | null
  getNode(id: string): MindMapNode | undefined
  select(id: string): void
  edit(id?: string): void
  addChild(id?: string): unknown
  addSibling(id?: string, before?: boolean): unknown
  fold(id?: string, folded?: boolean): unknown
  setColor(id?: string, color?: string): unknown
  undo(): unknown
  redo(): unknown
}

// The scenario page sizes every map to 900 × 520 with no motion (see scenarios.html), so a layout lands at once.

const plan: MindMapNode = {
  id: 'root',
  label: 'Q3 launch',
  children: [
    {
      id: 'mkt',
      label: 'Marketing',
      children: [
        {
          id: 'ads',
          label: 'Paid ads',
          children: [
            { id: 'search', label: 'Search' },
            { id: 'social', label: 'Social' },
          ],
        },
        { id: 'seo', label: 'SEO refresh' },
        {
          id: 'event',
          label: 'Launch event',
          children: [
            { id: 'venue', label: 'Venue' },
            { id: 'speakers', label: 'Speakers' },
          ],
        },
      ],
    },
    {
      id: 'eng',
      label: 'Engineering',
      children: [
        {
          id: 'api',
          label: 'Public API',
          children: [
            { id: 'rate', label: 'Rate limits' },
            { id: 'sdks', label: 'SDKs' },
          ],
        },
        { id: 'perf', label: 'Performance' },
        { id: 'mig', label: 'Data migration' },
      ],
    },
    {
      id: 'prod',
      label: 'Product',
      children: [
        { id: 'onb', label: 'Onboarding flow' },
        { id: 'price', label: 'Pricing page' },
        { id: 'notes', label: 'Release notes' },
      ],
    },
    {
      id: 'sup',
      label: 'Support',
      children: [
        { id: 'help', label: 'Help center' },
        { id: 'train', label: 'Agent training' },
      ],
    },
  ],
}

const small: MindMapNode = {
  id: 'root',
  label: 'Trip',
  children: [
    {
      id: 'a',
      label: 'Alpha',
      side: 'right',
      children: [
        { id: 'a1', label: 'One' },
        { id: 'a2', label: 'Two' },
        { id: 'a3', label: 'Three' },
      ],
    },
    { id: 'b', label: 'Bravo', side: 'left', children: [{ id: 'b1', label: 'Four' }] },
  ],
}

const json = (data: unknown) => JSON.stringify(data).replaceAll("'", '&#39;')

function mindMap(data: MindMapNode, attributes = '') {
  return `<c2-mind-map label="Launch plan" ${attributes} data='${json(data)}'></c2-mind-map><button id="after">After</button>`
}

const host = (page: Page) => page.locator('c2-mind-map')
const topic = (page: Page, name: string) => page.getByRole('treeitem', { name, exact: true })
const status = (page: Page) => page.locator('c2-mind-map div.live')
const focusedId = (page: Page) => host(page).evaluate((map) => (map.shadowRoot!.activeElement as HTMLElement | null)?.dataset.id ?? null)
const dataOf = (page: Page) => host(page).evaluate((map: MindMap) => map.data)
const childLabels = async (page: Page, id: string) =>
  host(page).evaluate((map: MindMap, nodeId) => (map.getNode(nodeId)?.children ?? []).map((child) => child.label), id)

/** Waits for the layout: the second render, its measurement and the render it asks for. */
async function settle(page: Page) {
  await host(page).evaluate(async (map: MindMap) => {
    for (let i = 0; i < 3; i++) {
      await map.updateComplete
      await new Promise((resolve) => requestAnimationFrame(resolve))
    }
  })
}

async function render(page: Page, renderScenario: (html: string) => Promise<void>, markup: string) {
  await renderScenario(markup)
  await settle(page)
}

async function box(locator: Locator) {
  const rect = await locator.boundingBox()
  if (!rect) throw new Error('Expected a visible topic')
  return { ...rect, cx: rect.x + rect.width / 2, cy: rect.y + rect.height / 2 }
}

/** Records the map's events on the page, for `events()`. */
async function record(page: Page) {
  await host(page).evaluate((map) => {
    const log: { type: string; bubbles: boolean; detail: unknown }[] = []
    ;(window as unknown as { mapEvents: typeof log }).mapEvents = log
    for (const type of ['before-change', 'change', 'selection-change', 'node-click']) {
      map.addEventListener(type, (event) => {
        const detail = (event as CustomEvent).detail
        log.push({ type, bubbles: event.bubbles, detail: JSON.parse(JSON.stringify(detail)) })
      })
    }
  })
}

type Logged = {
  type: string
  bubbles: boolean
  detail: { action?: { type: string; node: MindMapNode; parent: MindMapNode | null; index: number }; node?: MindMapNode; data?: MindMapNode }
}
const events = (page: Page) => page.evaluate(() => (window as unknown as { mapEvents: Logged[] }).mapEvents)

async function focusTopic(page: Page, name: string) {
  await topic(page, name).focus()
  await expect.poll(() => host(page).evaluate((map) => (map.shadowRoot!.activeElement as HTMLElement | null)?.getAttribute('aria-label'))).toBe(name)
}

test.describe('layout', () => {
  test('balances the branches on both sides and keeps their order top to bottom', async ({ page, renderScenario }) => {
    await render(page, renderScenario, mindMap(plan))
    const root = await box(topic(page, 'Q3 launch'))
    const firsts = await Promise.all(['Marketing', 'Engineering', 'Product', 'Support'].map((name) => box(topic(page, name))))
    const right = firsts.filter((first) => first.cx > root.cx)
    const left = firsts.filter((first) => first.cx < root.cx)
    expect(right.length).toBeGreaterThan(0)
    expect(left.length).toBeGreaterThan(0)
    // Marketing, the heaviest branch, opens the right side; Engineering the left one.
    expect(firsts[0].cx).toBeGreaterThan(root.cx)
    expect(firsts[1].cx).toBeLessThan(root.cx)
    // Topics on one side keep their data order from top to bottom, and a parent is centred on its subtopics.
    for (const side of [right, left]) for (let i = 1; i < side.length; i++) expect(side[i].y).toBeGreaterThan(side[i - 1].y)
    const subtopics = await Promise.all(['Paid ads', 'SEO refresh', 'Launch event'].map((name) => box(topic(page, name))))
    expect(subtopics[0].y).toBeLessThan(subtopics[1].y)
    expect(subtopics[1].y).toBeLessThan(subtopics[2].y)
    const marketing = firsts[0]
    expect(subtopics[0].x).toBeGreaterThan(marketing.x + marketing.width)
    expect(Math.abs((subtopics[0].cy + subtopics[2].cy) / 2 - marketing.cy)).toBeLessThan(marketing.height)
    // Deeper levels keep going outwards.
    const search = await box(topic(page, 'Search'))
    expect(search.x).toBeGreaterThan(subtopics[0].x + subtopics[0].width)
    const rate = await box(topic(page, 'Rate limits'))
    const api = await box(topic(page, 'Public API'))
    expect(rate.x + rate.width).toBeLessThan(api.x)
  })

  test('an explicit side is honoured, and layout="right" puts every branch on the right', async ({ page, renderScenario }) => {
    await render(page, renderScenario, mindMap(small))
    let root = await box(topic(page, 'Trip'))
    expect((await box(topic(page, 'Alpha'))).cx).toBeGreaterThan(root.cx)
    expect((await box(topic(page, 'Bravo'))).cx).toBeLessThan(root.cx)

    await host(page).evaluate(async (map: MindMap) => {
      map.layout = 'right'
      await map.updateComplete
    })
    await settle(page)
    root = await box(topic(page, 'Trip'))
    const alpha = await box(topic(page, 'Alpha'))
    const bravo = await box(topic(page, 'Bravo'))
    expect(alpha.x).toBeGreaterThan(root.x + root.width)
    expect(bravo.x).toBeGreaterThan(root.x + root.width)
    expect(bravo.y).toBeGreaterThan(alpha.y)

    await host(page).evaluate(async (map: MindMap) => {
      map.layout = 'left'
      await map.updateComplete
    })
    await settle(page)
    root = await box(topic(page, 'Trip'))
    expect((await box(topic(page, 'Alpha'))).x + (await box(topic(page, 'Alpha'))).width).toBeLessThan(root.x)
    expect((await box(topic(page, 'Four'))).x + (await box(topic(page, 'Four'))).width).toBeLessThan((await box(topic(page, 'Bravo'))).x)
  })

  test('draws the levels differently and colours each branch', async ({ page, renderScenario }) => {
    await render(page, renderScenario, mindMap({ ...small, children: [...small.children!, { id: 'c', label: 'Charlie', color: 'rgb(200, 0, 100)' }] }))
    const styleOf = (name: string) =>
      topic(page, name).evaluate((element) => {
        const style = getComputedStyle(element)
        return { background: style.backgroundColor, border: style.borderTopColor, borderWidth: style.borderTopWidth }
      })
    const root = await styleOf('Trip')
    expect(root.background).toBe('rgb(24, 24, 27)')
    const alpha = await styleOf('Alpha')
    // A first-level topic is a box with a border in its branch colour and a tint of it as background.
    expect(alpha.border).toBe('rgb(2, 101, 220)')
    expect(alpha.background).not.toBe('rgba(0, 0, 0, 0)')
    const bravo = await styleOf('Bravo')
    expect(bravo.border).toBe('rgb(234, 88, 12)')
    // A colour set on the branch wins over the palette.
    expect((await styleOf('Charlie')).border).toBe('rgb(200, 0, 100)')
    // Deeper topics are text on a line: no box, and the connector carries the branch colour, thinner at each level.
    const one = await styleOf('One')
    expect(one.background).toBe('rgba(0, 0, 0, 0)')
    expect(one.borderWidth).toBe('0px')
    const connectors = await host(page).evaluate((map) =>
      [...map.shadowRoot!.querySelectorAll<SVGPathElement>('path.connector')].map((path) => ({
        stroke: getComputedStyle(path).stroke,
        width: parseFloat(getComputedStyle(path).strokeWidth),
      })),
    )
    expect(connectors.length).toBe(7)
    expect(connectors.some((connector) => connector.stroke === 'rgb(2, 101, 220)')).toBe(true)
    expect(connectors.some((connector) => connector.stroke === 'rgb(200, 0, 100)')).toBe(true)
    const widths = connectors.map((connector) => connector.width)
    expect(Math.max(...widths)).toBe(2.5)
    expect(Math.min(...widths)).toBe(2)
  })

  test('long labels wrap at the maximum width and the layout follows', async ({ page, renderScenario }) => {
    const long = 'A very long topic label that has to wrap over several lines in the map'
    await render(
      page,
      renderScenario,
      mindMap({
        id: 'r',
        label: 'Root',
        children: [
          { id: 'a', label: long, side: 'right', children: [{ id: 'x', label: 'X' }] },
          { id: 'b', label: 'B', side: 'right' },
        ],
      }),
    )
    const wrapped = await box(topic(page, long))
    expect(wrapped.width).toBeLessThanOrEqual(220.5)
    expect(wrapped.height).toBeGreaterThan(40)
    // The sibling below starts below the tall topic, and the subtopic starts past its right edge.
    expect((await box(topic(page, 'B'))).y).toBeGreaterThan(wrapped.y + wrapped.height)
    expect((await box(topic(page, 'X'))).x).toBeGreaterThan(wrapped.x + wrapped.width)
  })
})

test.describe('accessibility', () => {
  test('is a tree with one tab stop; topics carry their level, position, state and name', async ({ page, renderScenario }) => {
    await render(page, renderScenario, mindMap(plan, 'editable'))
    const map = host(page)
    await expect(map).toHaveHostAria('role', 'tree')
    await expect(map).toHaveHostAria('aria-label', 'Launch plan')
    await expect(map).toHaveHostAria('aria-roledescription', 'mind map')
    await expect(page.getByRole('treeitem')).toHaveCount(22)
    const root = topic(page, 'Q3 launch')
    await expect(root).toHaveAttribute('aria-level', '1')
    await expect(root).toHaveAttribute('aria-expanded', 'true')
    await expect(root).toHaveAttribute('aria-selected', 'true')
    await expect(root).toHaveAttribute('aria-roledescription', 'topic')
    const price = topic(page, 'Pricing page')
    await expect(price).toHaveAttribute('aria-level', '3')
    await expect(price).toHaveAttribute('aria-posinset', '2')
    await expect(price).toHaveAttribute('aria-setsize', '3')
    await expect(price).not.toHaveAttribute('aria-expanded')
    await expect(price).toHaveAttribute('aria-selected', 'false')
    // One tab stop: the selected topic.
    await expect(map.locator('[tabindex="0"]')).toHaveCount(1)
    await expect(root).toHaveAttribute('tabindex', '0')
    await accessible(page)
  })

  test('the description names the keys, and the way out of an editable map', async ({ page, renderScenario }) => {
    await render(page, renderScenario, mindMap(small, 'editable'))
    const description = await hostAria(host(page), 'aria-description')
    // ariaDescription on ElementInternals is not in every browser yet; where it is, it reads the keys.
    if (test.info().project.name === 'chromium') expect(description).not.toBeNull()
    if (description !== null) expect(description).toContain('Escape, then Tab, leaves the map')
    await host(page).evaluate(async (map: MindMap) => {
      map.editable = false
      await map.updateComplete
    })
    const readOnly = await hostAria(host(page), 'aria-description')
    if (readOnly !== null) expect(readOnly).toContain('Arrow keys follow the drawing')
  })

  test('writes no attribute on the host', async ({ page, renderScenario }) => {
    await renderScenario('<c2-mind-map></c2-mind-map>')
    const attributes = await page.evaluate(async () => {
      const map = document.createElement('c2-mind-map') as MindMap
      map.data = { id: 'r', label: 'Root', children: [{ id: 'a', label: 'A' }] }
      document.querySelector('main')!.append(map)
      await map.updateComplete
      await new Promise((resolve) => requestAnimationFrame(resolve))
      await map.updateComplete
      map.select('a')
      map.addChild()
      await map.updateComplete
      return map.getAttributeNames()
    })
    expect(attributes).toEqual([])
  })

  test('an empty map is no tree', async ({ page, renderScenario }) => {
    await render(page, renderScenario, '<c2-mind-map></c2-mind-map>')
    await expect(host(page)).toHaveHostAria('role', null)
    await expect(page.getByRole('treeitem')).toHaveCount(0)
  })
})

test.describe('server rendering', () => {
  test('the first render is the indented outline the server sends, and the map is laid out on the second', async ({ page, renderScenario }) => {
    await renderScenario('<div id="spot"></div>')
    const first = await page.evaluate(async (data) => {
      const map = document.createElement('c2-mind-map') as MindMap
      map.data = data
      // Registered before the first update runs, so it sees the DOM of the first render, as hydration does.
      const firstRender = map.updateComplete.then(() => {
        const board = map.shadowRoot!.querySelector('.board')!
        const topics = [...map.shadowRoot!.querySelectorAll<HTMLElement>('[role="treeitem"]')]
        return {
          outline: board.classList.contains('outline'),
          connectors: map.shadowRoot!.querySelectorAll('path.connector').length,
          topics: topics.map((element) => ({
            label: element.getAttribute('aria-label'),
            level: element.getAttribute('aria-level'),
            indent: element.getBoundingClientRect().left,
          })),
          attributes: map.getAttributeNames(),
        }
      })
      document.querySelector('#spot')!.append(map)
      return firstRender
    }, small)
    expect(first.outline).toBe(true)
    expect(first.connectors).toBe(0)
    expect(first.attributes).toEqual([])
    expect(first.topics.map((item) => item.label)).toEqual(['Trip', 'Alpha', 'One', 'Two', 'Three', 'Bravo', 'Four'])
    // Indented by level.
    expect(first.topics[1].indent).toBeGreaterThan(first.topics[0].indent)
    expect(first.topics[2].indent).toBeGreaterThan(first.topics[1].indent)
    expect(first.topics[2].level).toBe('3')
    await settle(page)
    await expect(host(page).locator('.board')).not.toHaveClass(/outline/)
    await expect(host(page).locator('path.connector')).toHaveCount(6)
  })
})

test.describe('navigation', () => {
  test('the arrows follow the drawing, and focus follows the selection', async ({ page, renderScenario }) => {
    await render(page, renderScenario, mindMap(small))
    await record(page)
    await focusTopic(page, 'Trip')
    await page.keyboard.press('ArrowRight')
    expect(await focusedId(page)).toBe('a')
    await expect(topic(page, 'Alpha')).toHaveAttribute('aria-selected', 'true')
    await expect(topic(page, 'Alpha')).toHaveAttribute('tabindex', '0')
    await expect(topic(page, 'Trip')).toHaveAttribute('tabindex', '-1')
    await page.keyboard.press('ArrowRight')
    expect(await focusedId(page)).toBe('a1')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    expect(await focusedId(page)).toBe('a3')
    // Past the last sibling there is nothing lower on that level.
    await page.keyboard.press('ArrowDown')
    expect(await focusedId(page)).toBe('a3')
    await page.keyboard.press('ArrowLeft')
    expect(await focusedId(page)).toBe('a')
    await page.keyboard.press('ArrowLeft')
    expect(await focusedId(page)).toBe('root')
    // The left side is mirrored: ← goes out, → comes back.
    await page.keyboard.press('ArrowLeft')
    expect(await focusedId(page)).toBe('b')
    await page.keyboard.press('ArrowLeft')
    expect(await focusedId(page)).toBe('b1')
    await page.keyboard.press('ArrowRight')
    expect(await focusedId(page)).toBe('b')
    await page.keyboard.press('Home')
    expect(await focusedId(page)).toBe('root')
    const selections = (await events(page)).filter((event) => event.type === 'selection-change')
    expect(selections.map((event) => event.detail.node!.id)).toEqual(['a', 'a1', 'a2', 'a3', 'a', 'root', 'b', 'b1', 'b', 'root'])
    expect(selections.every((event) => !event.bubbles)).toBe(true)
  })

  test('↑ and ↓ go on to the nearest topic on the same level past the last sibling', async ({ page, renderScenario }) => {
    await render(page, renderScenario, mindMap(plan))
    await focusTopic(page, 'Social')
    await page.keyboard.press('ArrowDown')
    expect(await focusedId(page)).toBe('venue')
    await page.keyboard.press('ArrowUp')
    expect(await focusedId(page)).toBe('social')
  })

  test('→ unfolds a folded topic, then goes in', async ({ page, renderScenario }) => {
    await render(page, renderScenario, mindMap({ ...small, children: [{ ...small.children![0], collapsed: true }, small.children![1]] }))
    await expect(topic(page, 'One')).toHaveCount(0)
    await focusTopic(page, 'Alpha')
    await expect(topic(page, 'Alpha')).toHaveAttribute('aria-expanded', 'false')
    await page.keyboard.press('ArrowRight')
    await expect(topic(page, 'Alpha')).toHaveAttribute('aria-expanded', 'true')
    expect(await focusedId(page)).toBe('a')
    await page.keyboard.press('ArrowRight')
    expect(await focusedId(page)).toBe('a1')
  })

  test('the focused topic is brought into view', async ({ page, renderScenario }) => {
    await render(page, renderScenario, mindMap(plan))
    await host(page).evaluate(async (map: MindMap) => {
      map.panZoom!.zoomTo(3, { animate: false })
      await map.panZoom!.updateComplete
    })
    await focusTopic(page, 'Q3 launch')
    for (const key of ['ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowDown']) await page.keyboard.press(key)
    expect(await focusedId(page)).toBe('social')
    await settle(page)
    const viewport = await box(host(page).locator('c2-pan-zoom'))
    const social = await box(topic(page, 'Social'))
    expect(social.x).toBeGreaterThanOrEqual(viewport.x)
    expect(social.y).toBeGreaterThanOrEqual(viewport.y)
    expect(social.x + social.width).toBeLessThanOrEqual(viewport.x + viewport.width)
    expect(social.y + social.height).toBeLessThanOrEqual(viewport.y + viewport.height)
  })

  test('Ctrl + plus, minus and 0 zoom and fit', async ({ page, renderScenario }) => {
    await render(page, renderScenario, mindMap(plan))
    const zoom = () => host(page).evaluate((map: MindMap) => map.panZoom!.zoom)
    const start = await zoom()
    await focusTopic(page, 'Q3 launch')
    await page.keyboard.press('Control+=')
    await expect.poll(zoom).toBeGreaterThan(start)
    await page.keyboard.press('Control+0')
    await expect.poll(zoom).toBeCloseTo(start, 3)
    await page.keyboard.press('Control+-')
    await expect.poll(zoom).toBeLessThan(start)
  })
})

test.describe('editing', () => {
  test('Tab adds a subtopic in the editor; typing and Enter name it', async ({ page, renderScenario }) => {
    await render(page, renderScenario, mindMap(small, 'editable'))
    await record(page)
    await focusTopic(page, 'Alpha')
    await page.keyboard.press('Tab')
    const editor = host(page).getByRole('textbox', { name: 'Edit topic' })
    await expect(editor).toBeFocused()
    await expect(editor).toHaveValue('New topic')
    await expect(status(page)).toHaveText('Added a subtopic of Alpha')
    await page.keyboard.type('Four')
    await page.keyboard.press('Enter')
    await expect(editor).toHaveCount(0)
    await expect(topic(page, 'Four').first()).toBeVisible()
    expect(await childLabels(page, 'a')).toEqual(['One', 'Two', 'Three', 'Four'])
    const newId = await focusedId(page)
    expect(await host(page).evaluate((map: MindMap, id) => map.getNode(id!)?.label, newId)).toBe('Four')
    await expect(topic(page, 'Four').first()).toHaveAttribute('aria-level', '3')
    const changes = (await events(page)).filter((event) => event.type === 'change')
    expect(changes.map((event) => event.detail.action!.type)).toEqual(['add', 'edit'])
    expect(changes[0].detail.action!.parent!.id).toBe('a')
    expect(changes[0].detail.action!.index).toBe(3)
    expect(changes[1].detail.data!.children![0].children![3].label).toBe('Four')
    expect(changes.every((event) => event.bubbles)).toBe(true)
    // The new subtopic is drawn right of its parent, below the old last subtopic.
    const three = await box(topic(page, 'Three'))
    const four = await box(topic(page, 'Four').first())
    expect(four.y).toBeGreaterThan(three.y)
    expect(Math.abs(four.x - three.x)).toBeLessThan(1)
  })

  test('Insert adds a subtopic, Enter a sibling after, Shift+Enter one before, and Enter on the centre a subtopic', async ({ page, renderScenario }) => {
    await render(page, renderScenario, mindMap(small, 'editable'))
    await focusTopic(page, 'Two')
    await page.keyboard.press('Insert')
    await page.keyboard.press('Escape')
    expect((await host(page).evaluate((map: MindMap) => map.getNode('a2')?.children ?? [])).map((child) => child.label)).toEqual(['New topic'])
    await focusTopic(page, 'Two')
    await page.keyboard.press('Enter')
    await page.keyboard.type('After')
    await page.keyboard.press('Enter')
    await focusTopic(page, 'Two')
    await page.keyboard.press('Shift+Enter')
    await page.keyboard.type('Before')
    await page.keyboard.press('Enter')
    expect(await childLabels(page, 'a')).toEqual(['One', 'Before', 'Two', 'After', 'Three'])
    await focusTopic(page, 'Trip')
    await page.keyboard.press('Enter')
    await page.keyboard.type('Charlie')
    await page.keyboard.press('Enter')
    expect(await childLabels(page, 'root')).toEqual(['Alpha', 'Bravo', 'Charlie'])
    await expect(topic(page, 'Charlie')).toHaveAttribute('aria-level', '2')
  })

  test('F2 edits, Escape cancels, typing a character starts editing with it, and leaving the field commits', async ({ page, renderScenario }) => {
    await render(page, renderScenario, mindMap(small, 'editable'))
    await record(page)
    const editor = host(page).getByRole('textbox', { name: 'Edit topic' })
    await focusTopic(page, 'One')
    await page.keyboard.press('F2')
    await expect(editor).toHaveValue('One')
    await page.keyboard.type(' more')
    await page.keyboard.press('Escape')
    await expect(editor).toHaveCount(0)
    expect(await focusedId(page)).toBe('a1')
    await expect(topic(page, 'One')).toBeVisible()

    await page.keyboard.press('X')
    await expect(editor).toHaveValue('X')
    await page.keyboard.type('ray')
    // Shift+Enter is a line break; Enter commits.
    await page.keyboard.press('Shift+Enter')
    await page.keyboard.type('two')
    await page.keyboard.press('Enter')
    expect(await host(page).evaluate((map: MindMap) => map.getNode('a1')?.label)).toBe('Xray\ntwo')
    await expect(status(page)).toHaveText('Renamed to Xray two')

    await page.keyboard.press('F2')
    await page.keyboard.press('Control+a')
    await page.keyboard.type('Blurred')
    await page.locator('#after').focus()
    expect(await host(page).evaluate((map: MindMap) => map.getNode('a1')?.label)).toBe('Blurred')

    // A blank label is not saved.
    await focusTopic(page, 'Blurred')
    await page.keyboard.press('F2')
    await page.keyboard.press('Control+a')
    await page.keyboard.press('Backspace')
    await page.keyboard.press('Enter')
    expect(await host(page).evaluate((map: MindMap) => map.getNode('a1')?.label)).toBe('Blurred')
    const edits = (await events(page)).filter((event) => event.type === 'change').map((event) => event.detail.action!.type)
    expect(edits).toEqual(['edit', 'edit'])
  })

  test('Tab in the editor commits and adds a subtopic; a double-click and the + button edit and add', async ({ page, renderScenario }) => {
    await render(page, renderScenario, mindMap(small, 'editable'))
    await topic(page, 'Bravo').dblclick()
    const editor = host(page).getByRole('textbox', { name: 'Edit topic' })
    await expect(editor).toBeFocused()
    await page.keyboard.type('Beta')
    await page.keyboard.press('Tab')
    await expect(editor).toHaveValue('New topic')
    await page.keyboard.press('Enter')
    expect(await host(page).evaluate((map: MindMap) => map.getNode('b')?.label)).toBe('Beta')
    expect(await childLabels(page, 'b')).toEqual(['Four', 'New topic'])

    await topic(page, 'Two').click()
    const add = topic(page, 'Two').locator('.add')
    await expect(add).toBeVisible()
    await add.click()
    await expect(editor).toBeFocused()
    await page.keyboard.press('Enter')
    expect((await host(page).evaluate((map: MindMap) => map.getNode('a2')?.children ?? [])).length).toBe(1)
  })

  test('Delete removes a topic and its subtopics and focuses the previous sibling, else the parent; the centre stays', async ({ page, renderScenario }) => {
    await render(page, renderScenario, mindMap(plan, 'editable'))
    await record(page)
    await focusTopic(page, 'Launch event')
    await page.keyboard.press('Delete')
    await expect(topic(page, 'Launch event')).toHaveCount(0)
    await expect(topic(page, 'Venue')).toHaveCount(0)
    expect(await focusedId(page)).toBe('seo')
    await expect(status(page)).toHaveText('Deleted Launch event and 2 subtopics. Ctrl+Z to undo')
    const change = (await events(page)).find((event) => event.type === 'change')!
    expect(change.detail.action).toMatchObject({ type: 'delete', index: 2 })
    expect(change.detail.action!.node.id).toBe('event')
    expect(change.detail.action!.parent!.id).toBe('mkt')

    await focusTopic(page, 'Search')
    await page.keyboard.press('Backspace')
    expect(await focusedId(page)).toBe('ads')
    await expect(status(page)).toHaveText('Deleted Search. Ctrl+Z to undo')
    await page.keyboard.press('Backspace')
    expect(await focusedId(page)).toBe('mkt')

    await focusTopic(page, 'Q3 launch')
    await page.keyboard.press('Delete')
    await expect(topic(page, 'Q3 launch')).toHaveCount(1)
  })

  test('Alt + the arrows move a topic: reorder, promote and nest', async ({ page, renderScenario }) => {
    await render(page, renderScenario, mindMap(small, 'editable'))
    await focusTopic(page, 'One')
    await page.keyboard.press('Alt+ArrowDown')
    expect(await childLabels(page, 'a')).toEqual(['Two', 'One', 'Three'])
    await expect(status(page)).toHaveText('Moved One to position 2 of 3')
    expect(await focusedId(page)).toBe('a1')
    await page.keyboard.press('Alt+ArrowUp')
    await page.keyboard.press('Alt+ArrowUp')
    expect(await childLabels(page, 'a')).toEqual(['One', 'Two', 'Three'])
    // Away from the centre: into the previous sibling. On the right side, that is →.
    await focusTopic(page, 'Two')
    await page.keyboard.press('Alt+ArrowRight')
    expect(await childLabels(page, 'a1')).toEqual(['Two'])
    await expect(status(page)).toHaveText('Moved Two into One')
    await expect(topic(page, 'Two')).toHaveAttribute('aria-level', '4')
    // Toward the centre: next to the parent.
    await page.keyboard.press('Alt+ArrowLeft')
    expect(await childLabels(page, 'a')).toEqual(['One', 'Two', 'Three'])
    await page.keyboard.press('Alt+ArrowLeft')
    expect(await childLabels(page, 'root')).toEqual(['Alpha', 'Two', 'Bravo'])
    await expect(topic(page, 'Two')).toHaveAttribute('aria-level', '2')
    // The left side is mirrored: ← nests, → promotes.
    await focusTopic(page, 'Four')
    await page.keyboard.press('Alt+ArrowRight')
    expect(await childLabels(page, 'root')).toEqual(['Alpha', 'Two', 'Bravo', 'Four'])
    const root = await box(topic(page, 'Trip'))
    expect((await box(topic(page, 'Four'))).cx).toBeLessThan(root.cx)
  })

  test('Space folds and unfolds, with the hidden count on the fold dot', async ({ page, renderScenario }) => {
    await render(page, renderScenario, mindMap(plan, 'editable'))
    await record(page)
    await focusTopic(page, 'Engineering')
    await page.keyboard.press(' ')
    const engineering = topic(page, 'Engineering')
    await expect(engineering).toHaveAttribute('aria-expanded', 'false')
    await expect(topic(page, 'Public API')).toHaveCount(0)
    await expect(engineering.locator('.toggle')).toHaveText('5')
    await expect(engineering.locator('.toggle')).toBeVisible()
    await expect(status(page)).toHaveText('Folded, 5 topics hidden')
    expect(await host(page).evaluate((map: MindMap) => map.getNode('eng')?.collapsed)).toBe(true)
    await page.keyboard.press(' ')
    await expect(engineering).toHaveAttribute('aria-expanded', 'true')
    await expect(status(page)).toHaveText('Unfolded, 5 topics shown')
    // The fold dot folds too.
    await topic(page, 'Paid ads').hover()
    await topic(page, 'Paid ads').locator('.toggle').click()
    await expect(topic(page, 'Search')).toHaveCount(0)
    await expect(topic(page, 'Paid ads').locator('.toggle')).toHaveText('2')
    const types = (await events(page)).filter((event) => event.type === 'change').map((event) => event.detail.action!.type)
    expect(types).toEqual(['collapse', 'expand', 'collapse'])
    await accessible(page)
  })

  test('folding a topic above the selection selects the folded topic', async ({ page, renderScenario }) => {
    await render(page, renderScenario, mindMap(small, 'editable'))
    await focusTopic(page, 'Two')
    await host(page).evaluate((map: MindMap) => map.fold('a'))
    await expect(topic(page, 'Two')).toHaveCount(0)
    await expect(topic(page, 'Alpha')).toHaveAttribute('aria-selected', 'true')
    expect(await focusedId(page)).toBe('a')
  })

  test('Ctrl+Z undoes and Ctrl+Shift+Z redoes; the methods do the same', async ({ page, renderScenario }) => {
    await render(page, renderScenario, mindMap(small, 'editable'))
    await record(page)
    await focusTopic(page, 'Two')
    await page.keyboard.press('Delete')
    await focusTopic(page, 'Bravo')
    await page.keyboard.press(' ')
    await page.keyboard.press('Control+z')
    await expect(topic(page, 'Four')).toBeVisible()
    await expect(status(page)).toHaveText('Undone')
    await page.keyboard.press('Control+z')
    await expect(topic(page, 'Two')).toBeVisible()
    expect(await childLabels(page, 'a')).toEqual(['One', 'Two', 'Three'])
    // The selection comes back with the step.
    expect(await focusedId(page)).toBe('a2')
    await page.keyboard.press('Control+z')
    await expect(status(page)).toHaveText('Nothing to undo')
    await page.keyboard.press('Control+Shift+z')
    expect(await childLabels(page, 'a')).toEqual(['One', 'Three'])
    await expect(status(page)).toHaveText('Redone')
    expect(await host(page).evaluate((map: MindMap) => map.redo())).toBe(true)
    await expect(topic(page, 'Four')).toHaveCount(0)
    expect(await host(page).evaluate((map: MindMap) => map.redo())).toBe(false)
    expect(await host(page).evaluate((map: MindMap) => map.undo())).toBe(true)
    await expect(topic(page, 'Four')).toBeVisible()
    const types = (await events(page)).filter((event) => event.type === 'change').map((event) => event.detail.action!.type)
    expect(types).toEqual(['delete', 'collapse', 'undo', 'undo', 'redo', 'redo', 'undo'])
  })

  test('copy writes the subtopics as an indented list, and pasting a list adds it as subtopics', async ({ page, renderScenario }) => {
    await render(page, renderScenario, mindMap(small, 'editable'))
    await focusTopic(page, 'Alpha')
    // The copy event the browser fires for Ctrl/⌘+C, dispatched as is: the system clipboard needs a permission only
    // Chromium can grant, and the map only ever writes to the event's own clipboard data.
    const copied = await page.evaluate(() => {
      // Engines differ on the constructor's `clipboardData` (some drop it, Firefox copies it), so the event carries a
      // stand-in defined on itself that records what the map writes.
      const written = new Map<string, string>()
      const event = new ClipboardEvent('copy', { bubbles: true, cancelable: true })
      Object.defineProperty(event, 'clipboardData', {
        value: { setData: (type: string, value: string) => written.set(type, value), getData: (type: string) => written.get(type) ?? '' },
      })
      document.dispatchEvent(event)
      return written.get('text/plain')
    })
    expect(copied).toBe('- Alpha\n  - One\n  - Two\n  - Three')
    await expect(status(page)).toHaveText('Copied 4 topics')

    await focusTopic(page, 'Four')
    await page.evaluate(() => {
      const data = new DataTransfer()
      data.setData('text/plain', '- Ideas\n  - Sun\n  - Sea\n- Budget')
      const event = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })
      Object.defineProperty(event, 'clipboardData', { value: data })
      document.dispatchEvent(event)
    })
    expect(await childLabels(page, 'b1')).toEqual(['Ideas', 'Budget'])
    await expect(topic(page, 'Sea')).toHaveAttribute('aria-level', '5')
    await expect(status(page)).toHaveText('Pasted 4 topics into Four')
  })
})

test.describe('drag to reparent', () => {
  async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(to.x, to.y, { steps: 10 })
  }

  test('dropping a topic onto another makes it its last subtopic', async ({ page, renderScenario }) => {
    await render(page, renderScenario, mindMap(plan, 'editable'))
    await record(page)
    const help = await box(topic(page, 'Help center'))
    const onboarding = await box(topic(page, 'Onboarding flow'))
    await drag(page, { x: help.cx, y: help.cy }, { x: onboarding.cx, y: onboarding.cy })
    await expect(topic(page, 'Onboarding flow')).toHaveClass(/drop-into/)
    await expect(topic(page, 'Help center')).toHaveClass(/drag-source/)
    await expect(host(page).locator('.ghost')).toHaveText('Help center')
    await page.mouse.up()
    expect(await childLabels(page, 'onb')).toEqual(['Help center'])
    expect(await childLabels(page, 'sup')).toEqual(['Agent training'])
    await expect(status(page)).toHaveText('Moved Help center into Onboarding flow')
    const change = (await events(page)).find((event) => event.type === 'change')!
    expect(change.detail.action).toMatchObject({ type: 'move', index: 0 })
    expect(change.detail.action!.parent!.id).toBe('onb')
    // The drop is not a click.
    expect((await events(page)).some((event) => event.type === 'node-click')).toBe(false)
  })

  test('dropping onto the lower edge of a sibling puts it after that sibling', async ({ page, renderScenario }) => {
    await render(page, renderScenario, mindMap(plan, 'editable'))
    const onboarding = await box(topic(page, 'Onboarding flow'))
    const notes = await box(topic(page, 'Release notes'))
    await drag(page, { x: onboarding.cx, y: onboarding.cy }, { x: notes.cx, y: notes.y + notes.height - 2 })
    await expect(host(page).locator('path.drop-line')).toHaveCount(1)
    await page.mouse.up()
    expect(await childLabels(page, 'prod')).toEqual(['Pricing page', 'Release notes', 'Onboarding flow'])
  })

  test('Escape cancels a drag, and a topic cannot be dropped into its own subtopics', async ({ page, renderScenario }) => {
    await render(page, renderScenario, mindMap(plan, 'editable'))
    const marketing = await box(topic(page, 'Marketing'))
    const product = await box(topic(page, 'Product'))
    await drag(page, { x: marketing.cx, y: marketing.cy }, { x: product.cx, y: product.cy })
    await expect(topic(page, 'Product')).toHaveClass(/drop-into/)
    await page.keyboard.press('Escape')
    await expect(host(page).locator('.ghost')).toHaveCount(0)
    await page.mouse.up()
    expect(await childLabels(page, 'prod')).toEqual(['Onboarding flow', 'Pricing page', 'Release notes'])
    await expect(status(page)).toHaveText('Move cancelled')

    const ads = await box(topic(page, 'Paid ads'))
    await drag(page, { x: marketing.cx, y: marketing.cy }, { x: ads.cx, y: ads.cy })
    await expect(topic(page, 'Paid ads')).not.toHaveClass(/drop-into/)
    await page.mouse.up()
    expect(await childLabels(page, 'root')).toEqual(['Marketing', 'Engineering', 'Product', 'Support'])
  })

  test('a drag on the empty canvas pans, and with no-drag a drag on a topic pans too', async ({ page, renderScenario }) => {
    await render(page, renderScenario, mindMap(plan, 'editable'))
    const view = () => host(page).evaluate((map: MindMap) => map.panZoom!.view)
    const canvas = await box(host(page).locator('c2-pan-zoom'))
    const before = await view()
    await page.mouse.move(canvas.x + 20, canvas.y + 20)
    await page.mouse.down()
    await page.mouse.move(canvas.x + 120, canvas.y + 80, { steps: 8 })
    await page.mouse.up()
    const after = await view()
    expect(after.x).toBeLessThan(before.x)
    expect(after.y).toBeLessThan(before.y)

    await host(page).evaluate(async (map: MindMap) => {
      map.noDrag = true
      await map.updateComplete
    })
    const help = await box(topic(page, 'Help center'))
    await page.mouse.move(help.cx, help.cy)
    await page.mouse.down()
    await page.mouse.move(help.cx + 60, help.cy + 60, { steps: 8 })
    await page.mouse.up()
    expect((await view()).x).toBeLessThan(after.x)
    expect(await childLabels(page, 'sup')).toEqual(['Help center', 'Agent training'])
  })
})

test.describe('events', () => {
  test('before-change is cancelable and a vetoed edit changes nothing', async ({ page, renderScenario }) => {
    await render(page, renderScenario, mindMap(small, 'editable'))
    await record(page)
    await host(page).evaluate((map) =>
      map.addEventListener('before-change', (event) => {
        if ((event as CustomEvent<{ action: { type: string } }>).detail.action.type === 'delete') event.preventDefault()
      }),
    )
    await focusTopic(page, 'Two')
    await page.keyboard.press('Delete')
    await expect(topic(page, 'Two')).toBeVisible()
    expect(await childLabels(page, 'a')).toEqual(['One', 'Two', 'Three'])
    const logged = await events(page)
    expect(logged.filter((event) => event.type === 'before-change').map((event) => event.detail.action!.type)).toEqual(['delete'])
    expect(logged.some((event) => event.type === 'change')).toBe(false)
    // The rest still goes through, and `data` is the new map.
    await page.keyboard.press(' ')
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press(' ')
    expect((await dataOf(page))!.children![0].collapsed).toBe(true)
  })

  test('setting data replaces the map and clears the undo history', async ({ page, renderScenario }) => {
    await render(page, renderScenario, mindMap(small, 'editable'))
    await focusTopic(page, 'Two')
    await page.keyboard.press('Delete')
    await host(page).evaluate(async (map: MindMap) => {
      map.data = { id: 'n', label: 'New map', children: [{ id: 'x', label: 'Only' }] }
      await map.updateComplete
    })
    await settle(page)
    await expect(page.getByRole('treeitem')).toHaveCount(2)
    expect(await host(page).evaluate((map: MindMap) => map.undo())).toBe(false)
    await expect(topic(page, 'New map')).toHaveAttribute('tabindex', '0')
  })

  test('node-click fires on a click and, read-only, on Enter', async ({ page, renderScenario }) => {
    await render(page, renderScenario, mindMap(small))
    await record(page)
    await topic(page, 'Three').click()
    expect(await focusedId(page)).toBe('a3')
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('Enter')
    const clicks = (await events(page)).filter((event) => event.type === 'node-click')
    expect(clicks.map((event) => event.detail.node!.id)).toEqual(['a3', 'a2'])
    expect(clicks[0].bubbles).toBe(true)
  })
})

test.describe('tab and focus', () => {
  test('read-only: Tab leaves, and the editing keys do nothing', async ({ page, renderScenario }) => {
    await render(page, renderScenario, mindMap(small))
    await focusTopic(page, 'Alpha')
    for (const key of ['Delete', 'F2', 'x', 'Insert', 'Alt+ArrowDown', 'Control+z']) await page.keyboard.press(key)
    await expect(host(page).getByRole('textbox')).toHaveCount(0)
    expect(await childLabels(page, 'root')).toEqual(['Alpha', 'Bravo'])
    expect(await childLabels(page, 'a')).toEqual(['One', 'Two', 'Three'])
    await expect(topic(page, 'Alpha').locator('.add')).toHaveCount(0)
    await page.keyboard.press('Tab')
    await expect(page.locator('#after')).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    expect(await focusedId(page)).toBe('a')
  })

  test('editable: Tab adds a subtopic, so Escape then Tab leaves; Tab from outside comes back to the selection', async ({ page, renderScenario }) => {
    await render(page, renderScenario, mindMap(small, 'editable'))
    await focusTopic(page, 'Bravo')
    await page.keyboard.press('Escape')
    const board = host(page).locator('.board')
    await expect(board).toBeFocused()
    await expect(board).toHaveAttribute('role', 'group')
    await expect(board).toHaveAttribute('aria-label', 'Mind map canvas')
    await page.keyboard.press('Tab')
    await expect(page.locator('#after')).toBeFocused()
    expect(await childLabels(page, 'b')).toEqual(['Four'])
    await page.keyboard.press('Shift+Tab')
    expect(await focusedId(page)).toBe('b')
    // From the canvas, an arrow goes back to the selected topic.
    await page.keyboard.press('Escape')
    await expect(board).toBeFocused()
    await page.keyboard.press('ArrowDown')
    expect(await focusedId(page)).toBe('b')
  })
})

test.describe('localization', () => {
  test('speaks the language of the page', async ({ page, renderScenario }) => {
    await render(page, renderScenario, `<div lang="fr">${mindMap(small, 'editable').replace('label="Launch plan" ', '')}</div>`)
    await expect(host(page)).toHaveHostAria('aria-label', 'Carte mentale')
    await expect(host(page)).toHaveHostAria('aria-roledescription', 'carte mentale')
    await expect(topic(page, 'Alpha')).toHaveAttribute('aria-roledescription', 'sujet')
    await focusTopic(page, 'Alpha')
    await page.keyboard.press('Tab')
    await expect(host(page).getByRole('textbox', { name: 'Modifier le sujet' })).toHaveValue('Nouveau sujet')
    await expect(status(page)).toHaveText('Sous-sujet ajouté à Alpha')
  })
})

test.describe('motion and extras', () => {
  async function moves(page: Page) {
    await page.locator('c2-mind-map').evaluate((map: HTMLElement) => map.style.setProperty('--c2-mind-map--transition-duration', '1500ms'))
    await focusTopic(page, 'One')
    const before = await box(topic(page, 'Three'))
    await host(page).evaluate((map: MindMap) => map.addSibling('a1'))
    await settle(page)
    const during = await box(topic(page, 'Three'))
    await page.keyboard.press('Escape')
    return { before, during }
  }

  test('after an edit, topics glide to their new place', async ({ page, renderScenario }) => {
    await render(page, renderScenario, mindMap(small, 'editable'))
    const { during } = await moves(page)
    // Still on its way after a few frames of a 1.5 s glide: not yet where it ends up.
    const final = await host(page).evaluate(
      (map: MindMap) =>
        new Promise<number>((resolve) => setTimeout(() => resolve(map.shadowRoot!.querySelector('[aria-label="Three"]')!.getBoundingClientRect().y), 1700)),
    )
    expect(Math.abs(final - during.y)).toBeGreaterThan(2)
  })

  test('under reduced motion, topics jump', async ({ page, renderScenario }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await render(page, renderScenario, mindMap(small, 'editable'))
    const { before, during } = await moves(page)
    expect(during.y).toBeGreaterThan(before.y)
    await page.waitForTimeout(300)
    expect((await box(topic(page, 'Three'))).y).toBeCloseTo(during.y, 1)
  })

  test('an icon is drawn before the label and left out of the name; select() and setColor() work from code', async ({ page, renderScenario }) => {
    await render(
      page,
      renderScenario,
      mindMap({ ...small, children: [{ ...small.children![0], icon: '🚀' }, small.children![1]] }, 'editable minimap controls'),
    )
    await record(page)
    const alpha = topic(page, 'Alpha')
    await expect(alpha.locator('.icon')).toHaveText('🚀')
    await expect(alpha.locator('.icon')).toHaveAttribute('aria-hidden', 'true')
    await host(page).evaluate((map: MindMap) => map.select('b1'))
    await expect(topic(page, 'Four')).toHaveAttribute('aria-selected', 'true')
    // Selecting from code does not steal focus, and fires no selection-change.
    expect(await focusedId(page)).toBe(null)
    expect((await events(page)).some((event) => event.type === 'selection-change')).toBe(false)
    await host(page).evaluate((map: MindMap) => map.setColor('b', '#7c3aed'))
    await expect.poll(() => topic(page, 'Bravo').evaluate((element) => getComputedStyle(element).borderTopColor)).toBe('rgb(124, 58, 237)')
    expect((await dataOf(page))!.children![1].color).toBe('#7c3aed')
    // The canvas passes `controls` and `minimap` on, and the minimap draws one box per topic.
    await expect(host(page).locator('c2-pan-zoom')).toHaveAttribute('controls', '')
    await expect(host(page).locator('svg.minimap rect.mini')).toHaveCount(7)
    await expect(host(page).getByRole('toolbar')).toBeVisible()
  })

  test('the editor and the canvas pass the audit', async ({ page, renderScenario }) => {
    await render(page, renderScenario, mindMap(plan, 'editable controls'))
    await focusTopic(page, 'Pricing page')
    await page.keyboard.press('F2')
    await accessible(page)
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')
    await expect(host(page).locator('.board')).toBeFocused()
    await accessible(page)
  })
})

test.describe('review fixes', () => {
  test('a branch colour from data must be colour syntax: url() and other values are ignored', async ({ page, renderScenario }) => {
    const evil = 'url(https://evil.example/x.svg#p)'
    await render(
      page,
      renderScenario,
      mindMap(
        {
          id: 'r',
          label: 'R',
          children: [
            { id: 'a', label: 'Evil', color: evil, children: [{ id: 'a1', label: 'Child' }] },
            { id: 'b', label: 'Var', color: 'var(--nope, #7c3aed)' },
          ],
        },
        'minimap',
      ),
    )
    const styles = await host(page).evaluate((map) =>
      [...map.shadowRoot!.querySelectorAll('[style]')].map((element) => element.getAttribute('style')).join(' '),
    )
    expect(styles).not.toContain('url(')
    // The palette colour stands in for the refused one; a valid colour expression is kept.
    await expect.poll(() => topic(page, 'Evil').evaluate((element) => getComputedStyle(element).borderTopColor)).toBe('rgb(2, 101, 220)')
    await expect.poll(() => topic(page, 'Var').evaluate((element) => getComputedStyle(element).borderTopColor)).toBe('rgb(124, 58, 237)')
  })

  test('with a one-sided layout a reorder announces the real position and writes no side', async ({ page, renderScenario }) => {
    await render(
      page,
      renderScenario,
      mindMap(
        {
          id: 'r',
          label: 'R',
          children: [
            { id: 'a', label: 'A' },
            { id: 'b', label: 'B' },
            { id: 'c', label: 'C' },
          ],
        },
        'editable layout="right"',
      ),
    )
    await focusTopic(page, 'A')
    await page.keyboard.press('Alt+ArrowDown')
    expect(await childLabels(page, 'r')).toEqual(['B', 'A', 'C'])
    await expect(status(page)).toHaveText('Moved A to position 2 of 3')
    expect((await dataOf(page))!.children!.some((child) => 'side' in child)).toBe(false)
    await page.keyboard.press('Enter')
    await page.keyboard.press('Escape')
    expect((await dataOf(page))!.children!.some((child) => 'side' in child)).toBe(false)
  })

  test('select() and edit() under a folded topic unfold it in one step and select the topic itself', async ({ page, renderScenario }) => {
    const folded = {
      id: 'r',
      label: 'R',
      children: [
        { id: 'a', label: 'A', side: 'right', collapsed: true, children: [{ id: 'a1', label: 'A1', collapsed: true, children: [{ id: 'x', label: 'Deep' }] }] },
      ],
    }
    await render(page, renderScenario, mindMap(folded as MindMapNode, 'editable'))
    await record(page)
    await host(page).evaluate((map: MindMap) => map.edit('x'))
    await expect(host(page).getByRole('textbox', { name: 'Edit topic' })).toBeFocused()
    await expect(topic(page, 'Deep')).toHaveAttribute('aria-selected', 'true')
    await expect(topic(page, 'A')).toHaveAttribute('aria-selected', 'false')
    await page.keyboard.press('Escape')
    const changes = (await events(page)).filter((event) => event.type === 'change')
    expect(changes.map((event) => event.detail.action!.type)).toEqual(['expand'])
    expect(changes[0].detail.action!.node.id).toBe('a')
    expect(changes[0].detail.data!.children![0].collapsed).toBe(false)
    expect(changes[0].detail.data!.children![0].children![0].collapsed).toBe(false)
    // One undo step folds both back.
    expect(await host(page).evaluate((map: MindMap) => map.undo())).toBe(true)
    await expect(topic(page, 'A1')).toHaveCount(0)
    expect(await host(page).evaluate((map: MindMap) => map.undo())).toBe(false)
  })

  test('first-level topics number their position in drawing order', async ({ page, renderScenario }) => {
    await render(page, renderScenario, mindMap(plan))
    const positions = await host(page).evaluate((map) =>
      [...map.shadowRoot!.querySelectorAll('[role="treeitem"][aria-level="2"]')].map((item) => [
        item.getAttribute('aria-posinset'),
        item.getAttribute('aria-setsize'),
      ]),
    )
    expect(positions).toEqual([
      ['1', '4'],
      ['2', '4'],
      ['3', '4'],
      ['4', '4'],
    ])
  })
})

test('an edit keeps the zoom: adding a subtopic does not re-fit the map', async ({ page, renderScenario }) => {
  await render(page, renderScenario, mindMap(plan, 'editable'))
  const zoom = () => host(page).evaluate((map: MindMap) => map.panZoom!.zoom)
  const before = await zoom()
  await focusTopic(page, 'Search')
  await page.keyboard.press('Tab')
  await page.keyboard.type('A topic with a rather longer label')
  await page.keyboard.press('Enter')
  await settle(page)
  expect(await zoom()).toBeCloseTo(before, 6)
})

test.describe('second review fixes', () => {
  test('setColor() on a deeper topic colours its branch, and the central topic has none', async ({ page, renderScenario }) => {
    await render(page, renderScenario, mindMap(small, 'editable'))
    expect(await host(page).evaluate((map: MindMap) => map.setColor('a2', '#7c3aed'))).toBe(true)
    await expect.poll(() => topic(page, 'Alpha').evaluate((element) => getComputedStyle(element).borderTopColor)).toBe('rgb(124, 58, 237)')
    const data = (await dataOf(page))!
    expect(data.children![0].color).toBe('#7c3aed')
    expect(data.children![0].children![1].color).toBeUndefined()
    expect(await host(page).evaluate((map: MindMap) => map.setColor('root', '#7c3aed'))).toBe(false)
  })

  test('new data that folds the selected topic away selects its nearest drawn ancestor', async ({ page, renderScenario }) => {
    await render(page, renderScenario, mindMap(small, 'editable'))
    await focusTopic(page, 'Two')
    await host(page).evaluate(
      async (map: MindMap, data) => {
        map.data = data
        await map.updateComplete
      },
      { ...small, children: [{ ...small.children![0], collapsed: true }, small.children![1]] },
    )
    await settle(page)
    await expect(topic(page, 'Two')).toHaveCount(0)
    await expect(topic(page, 'Alpha')).toHaveAttribute('aria-selected', 'true')
    await expect(topic(page, 'Alpha')).toHaveAttribute('tabindex', '0')
  })

  test('dropping a topic where it already is changes nothing and adds no undo step', async ({ page, renderScenario }) => {
    await render(page, renderScenario, mindMap(plan, 'editable'))
    await record(page)
    const price = await box(topic(page, 'Pricing page'))
    const onboarding = await box(topic(page, 'Onboarding flow'))
    await page.mouse.move(price.cx, price.cy)
    await page.mouse.down()
    await page.mouse.move(onboarding.cx, onboarding.y + onboarding.height - 2, { steps: 10 })
    await page.mouse.up()
    expect(await childLabels(page, 'prod')).toEqual(['Onboarding flow', 'Pricing page', 'Release notes'])
    expect((await events(page)).some((event) => event.type === 'change' || event.type === 'before-change')).toBe(false)
    expect(await host(page).evaluate((map: MindMap) => map.undo())).toBe(false)
  })

  test('counts take the singular in French', async ({ page, renderScenario }) => {
    await render(page, renderScenario, `<div lang="fr">${mindMap(small, 'editable')}</div>`)
    await focusTopic(page, 'Bravo')
    await page.keyboard.press(' ')
    await expect(status(page)).toHaveText('Replié, 1 sujet masqué')
    await page.keyboard.press(' ')
    await focusTopic(page, 'Alpha')
    await page.keyboard.press(' ')
    await expect(status(page)).toHaveText('Replié, 3 sujets masqués')
  })
})
