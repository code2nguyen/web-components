import { test, expect } from './fixture'

type Node = { key: string; label: string; incoming: number; outgoing: number; value: number; column: number; share: number }
type Link = { source: string; target: string; value: number; shareOfSource: number; share: number }
type EngineNode = { name: string; depth: number; itemStyle: { color: string; opacity?: number }; label: { position: string; formatter: () => string } }
type EngineLink = { source: string; target: string; value: number; lineStyle?: { opacity: number } }

interface SankeyElement extends HTMLElement {
  data: unknown
  nodes?: unknown
  nodeTotals: Node[]
  flows: Link[]
  highlighted: string | null
  nodeAlign: string
  emphasis: string
  updateComplete: Promise<boolean>
  buildContext(): unknown
  seriesOption(index: number, context: unknown): Record<string, unknown>
  handleEngineClick(detail: { index: number; seriesIndex: number; dataType?: string }): void
  setNodeVisible(key: string, visible: boolean): void
  getLegendItems(): { label: string; visible: boolean }[]
  updateData(rows: unknown): void
  adapter?: { setData(data: unknown): void; setOptions(options: unknown, mode: string): void }
}

test('sums the rows into one flow per pair and places the nodes in columns', async ({ page, scenario }) => {
  await scenario('sankey')
  const chart = page.locator('c2-sankey-chart')
  await expect(chart).toHaveState('ready')

  const { nodes, flows } = await chart.evaluate((element) => {
    const sankey = element as SankeyElement
    return { nodes: sankey.nodeTotals.map((node) => [node.key, node.incoming, node.outgoing, node.column]), flows: sankey.flows }
  })
  // The zero-value row and the row without a target draw nothing; the two Revenue → Cost of revenue rows are summed.
  // Under the default `justify`, every node nothing leaves sits in the last column.
  expect(nodes).toEqual([
    ['Subscriptions', 0, 840, 0],
    ['Revenue', 1000, 1000, 1],
    ['Services', 0, 160, 0],
    ['Gross profit', 690, 690, 2],
    ['Cost of revenue', 310, 0, 4],
    ['Operating expenses', 520, 520, 3],
    ['Net profit', 170, 0, 4],
    ['R&D', 280, 0, 4],
    ['Sales', 240, 0, 4],
  ])
  expect(flows.map((flow) => [flow.source, flow.target, flow.value])).toEqual([
    ['Subscriptions', 'Revenue', 840],
    ['Services', 'Revenue', 160],
    ['Revenue', 'Gross profit', 690],
    ['Revenue', 'Cost of revenue', 310],
    ['Gross profit', 'Operating expenses', 520],
    ['Gross profit', 'Net profit', 170],
    ['Operating expenses', 'R&D', 280],
    ['Operating expenses', 'Sales', 240],
  ])
  // Everything that enters the diagram is what leaves the two sources: 1000.
  expect(flows[2].share).toBeCloseTo(0.69)
  expect(flows[6].shareOfSource).toBeCloseTo(280 / 520)
})

test('moves the ends with node-align, and a nodes entry pins a column, renames and recolours a node', async ({ page, scenario }) => {
  await scenario('sankey')
  const chart = page.locator('c2-sankey-chart')
  await expect(chart).toHaveState('ready')

  const columns = await chart.evaluate(async (element) => {
    const sankey = element as SankeyElement
    const read = () => Object.fromEntries(sankey.nodeTotals.map((node) => [node.key, node.column]))
    sankey.nodeAlign = 'left'
    await sankey.updateComplete
    const left = read()
    sankey.nodeAlign = 'right'
    await sankey.updateComplete
    const right = read()
    sankey.nodes = [{ id: 'Net profit', label: 'Profit', color: 'rgb(1, 2, 3)', column: 2 }]
    await sankey.updateComplete
    const series = sankey.seriesOption(0, sankey.buildContext()) as { data: EngineNode[] }
    const profit = series.data.find((node) => node.name === 'Net profit')
    return {
      left: [left['Cost of revenue'], left['Net profit'], left['R&D']],
      right: [right['Subscriptions'], right['Services'], right['Cost of revenue']],
      pinned: [read()['Net profit'], profit?.depth, profit?.label.formatter(), profit?.itemStyle.color],
    }
  })
  expect(columns).toEqual({ left: [2, 3, 4], right: [0, 0, 4], pinned: [2, 2, 'Profit', 'rgb(1, 2, 3)'] })
})

test('hands the engine one sankey series with every node placed and every link', async ({ page, scenario }) => {
  await scenario('sankey')
  const chart = page.locator('c2-sankey-chart')
  await expect(chart).toHaveState('ready')

  const option = await chart.evaluate((element) => {
    const sankey = element as SankeyElement
    const series = sankey.seriesOption(0, sankey.buildContext()) as {
      type: string
      draggable: boolean
      lineStyle: { color: string }
      emphasis: { focus: string }
      data: EngineNode[]
      links: EngineLink[]
    }
    const position = (name: string) => series.data.find((node) => node.name === name)?.label.position
    return {
      type: series.type,
      draggable: series.draggable,
      color: series.lineStyle.color,
      focus: series.emphasis.focus,
      links: series.links.length,
      depths: series.data.map((node) => `${node.name}:${node.depth}`).slice(0, 3),
      positions: [position('Subscriptions'), position('Revenue'), position('Sales')],
    }
  })
  expect(option).toEqual({
    type: 'sankey',
    draggable: false,
    color: 'source',
    focus: 'adjacency',
    links: 8,
    depths: ['Subscriptions:0', 'Revenue:1', 'Services:0'],
    // Under labels="outside", the first column is named on its left and the last on its right; the rest on the right.
    positions: ['left', 'right', 'right'],
  })
})

test('shows a loop in the error state instead of drawing it, and draws again once it is gone', async ({ page, scenario }) => {
  await scenario('sankey')
  const chart = page.locator('c2-sankey-chart')
  await expect(chart).toHaveState('ready')
  const state = chart.locator('[part="state"]')

  const loop = [
    { from: 'Inbox', to: 'Triage', amount: 10 },
    { from: 'Triage', to: 'Billing', amount: 4 },
    { from: 'Billing', to: 'Triage', amount: 1 },
    { from: 'Triage', to: 'Solved', amount: 7 },
  ]
  await chart.evaluate((element, rows) => ((element as SankeyElement).data = rows), loop)
  await expect(state).toHaveText('These flows form a loop, which a sankey diagram cannot draw: Triage → Billing → Triage')
  expect(await chart.evaluate((element) => (element as SankeyElement).seriesOption(0, (element as SankeyElement).buildContext()).links)).toEqual([])

  // A flow from a node to itself is a loop too.
  await chart.evaluate(
    (element) =>
      ((element as SankeyElement).data = [
        { from: 'A', to: 'A', amount: 1 },
        { from: 'A', to: 'B', amount: 2 },
      ]),
  )
  await expect(state).toHaveText('These flows form a loop, which a sankey diagram cannot draw: A → A')

  await chart.evaluate((element, rows) => ((element as SankeyElement).data = rows.slice(0, 2).concat(rows.slice(3))), loop)
  await expect(state).toHaveCount(0)
  await expect(chart.locator('table.sankey-a11y tbody tr')).toHaveCount(3)
})

test('describes a hovered node or link in the tooltip and the hover events', async ({ page, scenario }) => {
  await scenario('sankey')
  const chart = page.locator('c2-sankey-chart')
  await expect(chart).toHaveState('ready')

  const events = await chart.evaluate((element) => {
    const seen: string[] = []
    for (const name of ['node-hover', 'link-hover', 'tooltip-change']) {
      element.addEventListener(name, (event) => {
        const detail = (event as CustomEvent).detail as { key?: string; source?: string; target?: string; formattedX?: string } | null
        seen.push(`${name}:${detail ? (detail.key ?? detail.formattedX ?? `${detail.source}>${detail.target}`) : 'null'}`)
      })
    }
    window.chartScenario.hover({ index: 1, seriesIndex: 0, px: 40, py: 40, dataType: 'node' })
    window.chartScenario.hover({ index: 2, seriesIndex: 0, px: 60, py: 60, dataType: 'edge' })
    window.chartScenario.hover(null)
    return seen
  })
  expect(events).toEqual([
    'tooltip-change:Revenue',
    'node-hover:Revenue',
    'node-hover:null',
    'tooltip-change:Revenue → Gross profit',
    'link-hover:Revenue>Gross profit',
    'link-hover:null',
    'tooltip-change:null',
  ])
})

test('highlights a clicked node and dims what it does not light up, by adjacency or trajectory', async ({ page, scenario }) => {
  await scenario('sankey')
  const chart = page.locator('c2-sankey-chart')
  await expect(chart).toHaveState('ready')

  const result = await chart.evaluate(async (element) => {
    const sankey = element as SankeyElement
    const keys: (string | null)[] = []
    sankey.addEventListener('series-highlight', (event) => keys.push((event as CustomEvent<{ key: string | null }>).detail.key))
    const lit = () => {
      const series = sankey.seriesOption(0, sankey.buildContext()) as { data: EngineNode[]; links: EngineLink[] }
      return {
        nodes: series.data.filter((node) => node.itemStyle.opacity === undefined).map((node) => node.name),
        links: series.links.filter((link) => !link.lineStyle).length,
      }
    }
    // Gross profit is index 3.
    sankey.handleEngineClick({ index: 3, seriesIndex: 0, dataType: 'node' })
    await sankey.updateComplete
    const adjacency = lit()
    sankey.emphasis = 'trajectory'
    await sankey.updateComplete
    const trajectory = lit()
    sankey.handleEngineClick({ index: 3, seriesIndex: 0, dataType: 'node' })
    await sankey.updateComplete
    return { keys, adjacency, trajectory, after: sankey.highlighted }
  })
  expect(result).toEqual({
    keys: ['Gross profit', null],
    adjacency: { nodes: ['Revenue', 'Gross profit', 'Operating expenses', 'Net profit'], links: 3 },
    // Upstream to both sources, downstream through Operating expenses to its ends; Cost of revenue stays dim.
    trajectory: { nodes: ['Subscriptions', 'Revenue', 'Services', 'Gross profit', 'Operating expenses', 'Net profit', 'R&D', 'Sales'], links: 7 },
    after: null,
  })
})

test('keeps the highlight when node-click is cancelled, and reports a clicked link', async ({ page, scenario }) => {
  await scenario('sankey')
  const chart = page.locator('c2-sankey-chart')
  await expect(chart).toHaveState('ready')

  const result = await chart.evaluate(async (element) => {
    const sankey = element as SankeyElement
    let link: Link | undefined
    sankey.addEventListener('node-click', (event) => event.preventDefault())
    sankey.addEventListener('link-click', (event) => (link = (event as CustomEvent<Link>).detail))
    sankey.handleEngineClick({ index: 0, seriesIndex: 0, dataType: 'node' })
    sankey.handleEngineClick({ index: 4, seriesIndex: 0, dataType: 'edge' })
    await sankey.updateComplete
    return { highlighted: sankey.highlighted, link: link && `${link.source}>${link.target}:${link.value}` }
  })
  expect(result).toEqual({ highlighted: null, link: 'Gross profit>Operating expenses:520' })
})

test('walks the nodes from the keyboard and lists every flow for screen readers', async ({ page, scenario }) => {
  await scenario('sankey')
  const chart = page.locator('c2-sankey-chart')
  await expect(chart).toHaveState('ready')

  const plot = chart.locator('.plot')
  await expect(plot).toHaveAttribute('aria-label', /^Sankey diagram of Subscriptions, Revenue, Services, /)
  await expect(chart.locator('table.sankey-a11y tbody tr')).toHaveCount(8)

  const live = chart.locator('[aria-live]')
  await plot.focus()
  await page.keyboard.press('ArrowDown')
  await expect(live).toHaveText('Subscriptions: incoming 0, outgoing 840')
  await page.keyboard.press('ArrowDown')
  await expect(live).toHaveText('Services: incoming 0, outgoing 160')
  // Right follows the largest flow out; Revenue then Gross profit (690 beats 330).
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect(live).toHaveText('Gross profit: incoming 690, outgoing 690')
  await page.keyboard.press('ArrowLeft')
  await expect(live).toHaveText('Revenue: incoming 1,000, outgoing 1,000')
  await page.keyboard.press('Enter')
  await expect.poll(() => chart.evaluate((element) => (element as SankeyElement).highlighted)).toBe('Revenue')
  await page.keyboard.press('Escape')
  await expect.poll(() => chart.evaluate((element) => (element as SankeyElement).highlighted)).toBeNull()
})

test('keeps two nodes drawn when hiding one would strand the rest, and lists only drawn or hidden nodes', async ({ page, scenario }) => {
  await scenario('sankey')
  const chart = page.locator('c2-sankey-chart')
  await expect(chart).toHaveState('ready')

  const result = await chart.evaluate(async (element) => {
    const sankey = element as SankeyElement
    sankey.data = [
      { from: 'A', to: 'B', amount: 2 },
      { from: 'B', to: 'C', amount: 1 },
      { from: 'D', to: 'B', amount: 1 },
    ]
    await sankey.updateComplete
    // Hiding B would leave A, C and D with no flow at all: refused.
    sankey.setNodeVisible('B', false)
    await sankey.updateComplete
    const kept = sankey.nodeTotals.map((node) => node.key)
    // Hiding D leaves A → B → C; D stays in the legend, switched off, so it can come back.
    sankey.setNodeVisible('D', false)
    await sankey.updateComplete
    const legend = sankey.getLegendItems().map((item) => `${item.label}:${item.visible}`)
    return { kept, legend }
  })
  expect(result).toEqual({ kept: ['A', 'B', 'C', 'D'], legend: ['A:true', 'B:true', 'C:true', 'D:false'] })
})

test('leaves a nodes entry whose column is null to node-align, and resolves a color-mix() colour for the engine', async ({ page, scenario }) => {
  await scenario('sankey')
  const chart = page.locator('c2-sankey-chart')
  await expect(chart).toHaveState('ready')

  const result = await chart.evaluate(async (element) => {
    const sankey = element as SankeyElement
    sankey.nodes = [{ id: 'Net profit', column: null, color: 'color-mix(in srgb, #000000 50%, #ffffff)' }]
    await sankey.updateComplete
    const series = sankey.seriesOption(0, sankey.buildContext()) as { data: EngineNode[] }
    const profit = series.data.find((node) => node.name === 'Net profit')
    return { column: profit?.depth, color: profit?.itemStyle.color }
  })
  expect(result).toEqual({ column: 4, color: 'rgb(128, 128, 128)' })
})

test('sends the links with the nodes when data arrives through updateData', async ({ page, scenario }) => {
  await scenario('sankey')
  const chart = page.locator('c2-sankey-chart')
  await expect(chart).toHaveState('ready')

  const links = await chart.evaluate((element) => {
    const sankey = element as SankeyElement
    const adapter = sankey.adapter
    if (!adapter) return null
    let latest: string[] = []
    const setOptions = adapter.setOptions.bind(adapter)
    adapter.setOptions = (options, mode) => {
      const series = (options as { series?: { links?: EngineLink[] }[] }).series?.[0]
      if (series?.links) latest = series.links.map((link) => `${link.source}>${link.target}`)
      setOptions(options, mode)
    }
    let atData: string[] = []
    const setData = adapter.setData.bind(adapter)
    adapter.setData = (data) => {
      atData = latest
      setData(data)
    }
    sankey.updateData([
      { from: 'Left', to: 'Middle', amount: 3 },
      { from: 'Middle', to: 'Right', amount: 2 },
    ])
    return atData
  })
  expect(links).toEqual(['Left>Middle', 'Middle>Right'])
})
