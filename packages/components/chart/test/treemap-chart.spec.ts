import AxeBuilder from '@axe-core/playwright'
import { test, expect } from './fixture'

type Node = { path: string[]; label: string; value: number; colorValue: number | null; depth: number; share: number; parentShare: number; leaf: boolean }
type EngineNode = {
  name: string
  value: number
  itemStyle: { color: string; borderColor?: string; opacity?: number }
  label?: { color: string }
  children?: EngineNode[]
}

interface TreemapElement extends HTMLElement {
  data: unknown
  nodes: Node[]
  highlighted: string | null
  legendAction: string
  childrenField: string
  groupField: string
  updateComplete: Promise<boolean>
  buildContext(): unknown
  handleEngineClick(detail: { index: number; seriesIndex: number }): void
  projectData(frame: unknown, context: unknown): EngineNode[][]
  frame: unknown
  getLegendItems(): { label: string; key: string; color: string; visible: boolean; toggle(): void }[]
  setGroupVisible(name: string, visible: boolean): void
}

test('groups the rows into tiles, sums the groups and orders siblings largest first', async ({ page, scenario }) => {
  await scenario('treemap')
  const chart = page.locator('c2-treemap-chart')
  await expect(chart).toHaveState('ready')

  const nodes = await chart.evaluate((element) => (element as TreemapElement).nodes.map((node) => [node.path.join('/'), node.value, node.leaf]))
  // ZERO has no positive size and is left out; Energy (780) outweighs Health (700).
  expect(nodes).toEqual([
    ['Technology', 9400, false],
    ['Technology/AAPL', 3400, true],
    ['Technology/MSFT', 3100, true],
    ['Technology/NVDA', 2900, true],
    ['Energy', 780, false],
    ['Energy/XOM', 480, true],
    ['Energy/CVX', 300, true],
    ['Health', 700, false],
    ['Health/LLY', 700, true],
  ])
  const shares = await chart.evaluate((element) => {
    const xom = (element as TreemapElement).nodes.find((node) => node.label === 'XOM')
    return [xom?.share, xom?.parentShare]
  })
  expect(shares[0]).toBeCloseTo(480 / 10880)
  expect(shares[1]).toBeCloseTo(480 / 780)
})

test('nests rows under children-field, and a comma-separated group-field nests the groups', async ({ page, scenario }) => {
  await scenario('treemap')
  const chart = page.locator('c2-treemap-chart')
  await expect(chart).toHaveState('ready')

  const result = await chart.evaluate(async (element) => {
    const treemap = element as TreemapElement
    treemap.groupField = ''
    treemap.data = [
      {
        ticker: 'src',
        children: [
          { ticker: 'app.ts', cap: 30 },
          { ticker: 'lib', children: [{ ticker: 'util.ts', cap: 5 }] },
        ],
      },
      { ticker: 'README.md', cap: 2 },
    ]
    await treemap.updateComplete
    const nested = treemap.nodes.map((node) => `${node.path.join('/')}:${node.value}:${node.depth}`)
    treemap.groupField = 'region, sector'
    treemap.data = [
      { region: 'US', sector: 'Tech', ticker: 'AAPL', cap: 3 },
      { region: 'US', sector: 'Energy', ticker: 'XOM', cap: 1 },
      { region: 'EU', sector: 'Tech', ticker: 'SAP', cap: 2 },
    ]
    await treemap.updateComplete
    return { nested, grouped: treemap.nodes.map((node) => node.path.join('/')) }
  })
  expect(result.nested).toEqual(['src:35:1', 'src/app.ts:30:2', 'src/lib:5:2', 'src/lib/util.ts:5:3', 'README.md:2:1'])
  expect(result.grouped).toEqual(['US', 'US/Tech', 'US/Tech/AAPL', 'US/Energy', 'US/Energy/XOM', 'EU', 'EU/Tech', 'EU/Tech/SAP'])
})

test('colours each tile by its top-level group, and a group as the surface its header sits on', async ({ page, scenario }) => {
  await scenario('treemap')
  const chart = page.locator('c2-treemap-chart')
  await expect(chart).toHaveState('ready')

  const engine = await chart.evaluate((element) => {
    const treemap = element as TreemapElement
    const context = treemap.buildContext()
    const [tree] = treemap.projectData(treemap.frame, context)
    return {
      group: tree[0].itemStyle.color,
      tiles: tree.map((group) => group.children?.[0]?.itemStyle.color),
      label: tree[0].children?.[0]?.label?.color,
      legend: treemap.getLegendItems().map((item) => item.label),
    }
  })
  expect(engine.group).toBe('rgb(255, 255, 255)')
  expect(engine.tiles).toEqual(['rgb(2, 101, 220)', 'rgb(234, 88, 12)', 'rgb(15, 118, 110)'])
  // Text on a tile is whichever of white and near-black reads better on it.
  expect(engine.label).toBe('#ffffff')
  expect(engine.legend).toEqual(['Technology', 'Energy', 'Health'])
})

test('colours tiles on a scale around zero with color-field, and prints the value with its suffix', async ({ page, scenario }) => {
  await scenario('treemap-color')
  const chart = page.locator('c2-treemap-chart')
  await expect(chart).toHaveState('ready')

  const engine = await chart.evaluate((element) => {
    const treemap = element as TreemapElement
    const [tree] = treemap.projectData(treemap.frame, treemap.buildContext())
    const tile = (group: number, index: number) => tree[group].children?.[index]?.itemStyle.color
    return {
      // NVDA is the largest move (+3.1), so it takes the full positive colour; CVX did not move.
      nvda: tile(0, 2),
      cvx: tile(1, 1),
      xom: tile(1, 0),
      legend: treemap.getLegendItems().length,
    }
  })
  expect(engine.nvda).toBe('rgb(22, 163, 74)')
  expect(engine.cvx).toBe('rgb(212, 212, 216)')
  expect(engine.xom).not.toBe('rgb(220, 38, 38)')
  expect(engine.legend).toBe(0)

  const tooltip = await chart.evaluate((element) => {
    let seen: string[] = []
    element.addEventListener('tooltip-change', (event) => {
      const detail = (event as CustomEvent).detail as { formattedX: string; entries: { series: { label: string }; formatted: string }[] } | null
      if (detail) seen = [detail.formattedX, ...detail.entries.map((entry) => `${entry.series.label}=${entry.formatted}`)]
    })
    // Data index 0 is ECharts' own root; 1 is Technology and 2 its first tile.
    window.chartScenario.hover({ index: 6, seriesIndex: 0, px: 40, py: 40 })
    return seen
  })
  expect(tooltip).toEqual(['Energy › XOM', 'Market cap=480', 'Change=-1.5%', 'Share of total=4.4%', 'Share of Energy=61.5%'])
})

test('reports the tile under the pointer as the engine numbers it', async ({ page, scenario }) => {
  await scenario('treemap')
  const chart = page.locator('c2-treemap-chart')
  await expect(chart).toHaveState('ready')

  await chart.evaluate((element) => {
    const out: string[] = []
    ;(window as unknown as { seen: string[] }).seen = out
    element.addEventListener('tooltip-change', (event) => {
      const detail = (event as CustomEvent).detail as { formattedX: string } | null
      out.push(detail ? detail.formattedX : 'null')
    })
  })
  const box = await chart.locator('.plot').boundingBox()
  if (!box) throw new Error('no plot')
  // The largest group fills the top-left; its header is the first strip and its largest tile sits under it.
  await page.mouse.move(box.x + 12, box.y + 8)
  await page.mouse.move(box.x + 16, box.y + 40)
  const names = await page.evaluate(() => (window as unknown as { seen: string[] }).seen)
  const name = names.at(-1)
  // A rebuild of the options (a highlight) keeps the numbering.
  await chart.evaluate(async (element) => {
    ;(element as TreemapElement).highlighted = 'Energy'
    await (element as TreemapElement).updateComplete
  })
  await page.mouse.move(box.x + 12, box.y + 8)
  await page.mouse.move(box.x + 18, box.y + 44)
  const after = await page.evaluate(() => (window as unknown as { seen: string[] }).seen)
  expect(after.at(-1)).toBe('Technology › AAPL')
  expect(name).toBe('Technology › AAPL')
})

test('highlights a clicked group, and hides one from the legend in toggle mode', async ({ page, scenario }) => {
  await scenario('treemap')
  const chart = page.locator('c2-treemap-chart')
  await expect(chart).toHaveState('ready')

  const result = await chart.evaluate(async (element) => {
    const treemap = element as TreemapElement
    treemap.handleEngineClick({ index: 6, seriesIndex: 0 })
    await treemap.updateComplete
    const [tree] = treemap.projectData(treemap.frame, treemap.buildContext())
    const highlighted = [treemap.highlighted, tree[0].children?.[0]?.itemStyle.color, tree[1].children?.[0]?.itemStyle.color]
    treemap.highlighted = null
    treemap.legendAction = 'toggle'
    await treemap.updateComplete
    const health = treemap.getLegendItems().find((item) => item.key === 'Health')?.color
    treemap
      .getLegendItems()
      .find((item) => item.key === 'Energy')
      ?.toggle()
    await treemap.updateComplete
    return {
      highlighted,
      groups: treemap.nodes.filter((node) => node.depth === 1).map((node) => node.label),
      legend: treemap.getLegendItems().map((item) => `${item.label}:${item.visible}`),
      healthKeepsColour: treemap.getLegendItems().find((item) => item.key === 'Health')?.color === health,
    }
  })
  // The other groups fade a quarter of the way from the surface to their colour; Energy keeps its own.
  expect(result.highlighted[0]).toBe('Energy')
  expect(result.highlighted[1]).not.toBe('rgb(2, 101, 220)')
  expect(result.highlighted[2]).toBe('rgb(234, 88, 12)')
  expect(result.groups).toEqual(['Technology', 'Health'])
  expect(result.legend).toEqual(['Technology:true', 'Energy:false', 'Health:true'])
  expect(result.healthKeepsColour).toBe(true)
})

test('names the plot and lists every tile in a table for screen readers, with no axe violations', async ({ page, scenario }) => {
  await scenario('treemap-color')
  const chart = page.locator('c2-treemap-chart')
  await expect(chart).toHaveState('ready')

  await expect(chart.locator('.plot')).toHaveAttribute('aria-label', 'Treemap of Market cap, 6 tiles')
  const rows = chart.locator('table.treemap-a11y tbody tr')
  await expect(rows).toHaveCount(6)
  await expect(rows.nth(3)).toHaveText(/Energy\s*XOM\s*480\s*-1\.5%\s*4\.4%/)

  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(results.violations).toEqual([])
})

test('keeps shares of the whole data when a group is hidden, and resolves a light-dark() neutral', async ({ page, scenario }) => {
  await scenario('treemap-color')
  const chart = page.locator('c2-treemap-chart')
  await expect(chart).toHaveState('ready')

  const result = await chart.evaluate(async (element) => {
    const treemap = element as TreemapElement
    const before = treemap.nodes.find((node) => node.label === 'Technology')?.share
    treemap.setGroupVisible('Energy', false)
    await treemap.updateComplete
    const after = treemap.nodes.find((node) => node.label === 'Technology')?.share
    treemap.setGroupVisible('Energy', true)
    treemap.style.setProperty('--c2-chart__neutral--color', 'light-dark(rgb(1, 2, 3), rgb(4, 5, 6))')
    await treemap.updateComplete
    // Theme reads are cached until the theme changes; a new style counts as one here.
    window.dispatchEvent(new Event('c2n-theme-change'))
    await treemap.updateComplete
    const [tree] = treemap.projectData(treemap.frame, treemap.buildContext())
    return { before, after, cvx: tree[1].children?.[1]?.itemStyle.color }
  })
  expect(result.after).toBe(result.before)
  expect(result.cvx).toBe('rgb(1, 2, 3)')
})

test('never infers a group field as the size, and gives a series colour only to a single group', async ({ page, scenario }) => {
  await scenario('treemap')
  const chart = page.locator('c2-treemap-chart')
  await expect(chart).toHaveState('ready')

  const result = await chart.evaluate(async (element) => {
    const treemap = element as TreemapElement
    const series = treemap.querySelector('c2-chart-series')
    series?.setAttribute('color', 'rgb(9, 9, 9)')
    await treemap.updateComplete
    const colours = treemap.getLegendItems().map((item) => item.color)
    series?.remove()
    treemap.groupField = 'year'
    treemap.data = [
      { year: 2024, ticker: 'A', size: 10 },
      { year: 2024, ticker: 'B', size: 30 },
    ]
    await treemap.updateComplete
    return { colours, sizes: treemap.nodes.map((node) => `${node.label}:${node.value}`) }
  })
  expect(result.colours).toEqual(['rgb(2, 101, 220)', 'rgb(234, 88, 12)', 'rgb(15, 118, 110)'])
  expect(result.sizes).toEqual(['2024:40', 'B:30', 'A:10'])
})
