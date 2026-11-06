import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect } from '../../../../tests/component-fixture'
import { test } from '../../../../tests/fixture'

type Node = { path: string[]; label: string; value: number; colorValue: number | null; depth: number; share: number; parentShare: number; leaf: boolean }
type EngineNode = {
  name: string
  value: number
  itemStyle: { color: string; opacity: number }
  label: { show: boolean; rotate?: string; color?: string }
  children?: EngineNode[]
}

interface SunburstElement extends HTMLElement {
  data: unknown
  nodes: Node[]
  root: string[]
  levels: number
  labels: string
  breadcrumb: string
  highlighted: string | null
  colorField: string
  animation: string
  updateComplete: Promise<boolean>
  zoomTo(path: string[]): boolean
  zoomOut(): boolean
  setGroupVisible(name: string, visible: boolean): void
  getLegendItems(): { label: string; key: string; color: string; visible: boolean; toggle(): void }[]
  buildContext(): { width: number; height: number }
  buildOptions(context: unknown): { series: Record<string, unknown>[] }
  projectData(frame: unknown, context: unknown): EngineNode[][]
  frame: unknown
}

interface ScenarioApi {
  hover(detail: { index: number; seriesIndex: number; px: number; py: number; name?: string } | null): void
  click(detail: { index: number; seriesIndex: number; name?: string }): void
  events: { type: string; detail: unknown }[]
  engineName(path: string[], leaf: boolean): string
}

async function open(page: Page, scenario = 'budget', query = ''): Promise<void> {
  await page.goto(`/packages/components/chart/test/sunburst-scenarios.html?scenario=${scenario}${query}`)
  await expect(page.locator('main')).toHaveAttribute('data-ready', 'true')
}

/** Page errors and console errors, collected for the whole test. */
function watchErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) errors.push(message.text())
  })
  return errors
}

/** The rings the engine is handed, as `name@ring` per segment, depth first. */
function flatten(nodes: EngineNode[], ring = 1, out: string[] = []): string[] {
  for (const node of nodes) {
    out.push(`${node.name.split('\u001f').at(-1)}@${ring}`)
    if (node.children) flatten(node.children, ring + 1, out)
  }
  return out
}

test('draws without errors, and builds the rings and values from the hierarchy', async ({ page }) => {
  const errors = watchErrors(page)
  await open(page, 'budget', '&renderer=svg')
  const chart = page.locator('c2-sunburst-chart')
  await expect(chart).toHaveState('ready')
  const drawn = await chart.evaluate((element) => element.shadowRoot?.querySelectorAll('.plot svg path').length ?? 0)
  expect(drawn).toBeGreaterThan(20)

  const nodes = await chart.evaluate((element) => (element as SunburstElement).nodes)
  const top = nodes.filter((node) => node.depth === 1).map((node) => `${node.label}:${node.value.toFixed(1)}`)
  expect(top).toEqual(['Engineering:5.1', 'Sales:2.5', 'Marketing:2.2', 'Operations:1.9'])
  const compute = nodes.find((node) => node.label === 'Compute')
  expect(compute?.path).toEqual(['Engineering', 'Platform', 'Compute'])
  expect(compute?.share).toBeCloseTo(1.1 / 11.7)
  expect(compute?.parentShare).toBeCloseTo(1.1 / 2.1)
  expect(nodes.filter((node) => node.leaf)).toHaveLength(19)
  expect(errors).toEqual([])
})

test('caps the rings at `levels`, and fits as many rings as the subtree has', async ({ page }) => {
  await open(page)
  const chart = page.locator('c2-sunburst-chart')
  await expect(chart).toHaveState('ready')

  const result = await chart.evaluate(async (element) => {
    const sunburst = element as SunburstElement
    const rings = () => {
      const context = sunburst.buildContext()
      const series = sunburst.buildOptions(context).series[0] as { radius: number[]; data: EngineNode[] }
      return { radius: series.radius, data: series.data }
    }
    const three = rings()
    sunburst.levels = 2
    await sunburst.updateComplete
    const two = rings()
    sunburst.levels = 3
    sunburst.root = ['Marketing']
    await sunburst.updateComplete
    const zoomed = rings()
    return { three, two, zoomed }
  })
  const depth = (data: EngineNode[]): number => Math.max(0, ...data.map((node) => 1 + depth(node.children ?? [])))
  expect(depth(result.three.data)).toBe(3)
  expect(depth(result.two.data)).toBe(2)
  // Marketing holds two levels; ECharts spreads them over the whole radius.
  expect(depth(result.zoomed.data)).toBe(2)
  expect(flatten(result.zoomed.data)).toEqual(['Demand@1', 'Search@2', 'Social@2', 'Brand@1', 'Events@1'])
  // The hole is 28% of the radius.
  expect(result.three.radius[0] / result.three.radius[1]).toBeCloseTo(0.28, 2)
})

test('colours each branch from the palette and steps its children lighter, largest darkest', async ({ page }) => {
  await open(page)
  const chart = page.locator('c2-sunburst-chart')
  await expect(chart).toHaveState('ready')

  const colours = await chart.evaluate(async (element) => {
    const sunburst = element as SunburstElement
    const [data] = sunburst.projectData(sunburst.frame, sunburst.buildContext())
    const before = data[0].children?.[0]?.itemStyle.color
    sunburst.root = ['Engineering']
    await sunburst.updateComplete
    const [zoomed] = sunburst.projectData(sunburst.frame, sunburst.buildContext())
    return {
      top: data.map((node) => node.itemStyle.color),
      engineering: data[0].children?.map((node) => node.itemStyle.color),
      before,
      after: zoomed[0].itemStyle.color,
      legend: sunburst.getLegendItems().map((item) => `${item.label}:${item.color}`),
    }
  })
  expect(colours.top).toEqual(['rgb(2, 101, 220)', 'rgb(234, 88, 12)', 'rgb(15, 118, 110)', 'rgb(219, 39, 119)'])
  // Each sibling is lighter (closer to the white surface) than the one before it.
  const lightness = (rgb: string) =>
    rgb
      .match(/\d+/g)
      ?.map(Number)
      .reduce((sum, channel) => sum + channel, 0) ?? 0
  const [platform, product, data] = (colours.engineering ?? []).map(lightness)
  expect(platform).toBeGreaterThan(lightness(colours.top[0]))
  expect(product).toBeGreaterThan(platform)
  expect(data).toBeGreaterThan(product)
  // A node keeps its colour when it is zoomed into view.
  expect(colours.after).toBe(colours.before)
  // The legend lists the top-level branches.
  expect(colours.legend[0]).toBe('Engineering:rgb(2, 101, 220)')
})

test('colours by color-field on the scale around zero, groups by their weighted mean', async ({ page }) => {
  await open(page, 'color')
  const chart = page.locator('c2-sunburst-chart')
  await expect(chart).toHaveState('ready')

  const result = await chart.evaluate((element) => {
    const sunburst = element as SunburstElement
    const [data] = sunburst.projectData(sunburst.frame, sunburst.buildContext())
    const tech = data.find((node) => node.name.endsWith('Tech'))
    return {
      sap: tech?.children?.find((node) => node.name.endsWith('SAP'))?.itemStyle.color,
      shel: data.find((node) => node.name.endsWith('Energy'))?.children?.find((node) => node.name.endsWith('SHEL'))?.itemStyle.color,
      legend: sunburst.getLegendItems().length,
    }
  })
  expect(result.sap).toBe('rgb(22, 163, 74)')
  expect(result.shel).toBe('rgb(212, 212, 216)')
  expect(result.legend).toBe(0)
})

test('builds groups from flat rows with a comma-separated group-field', async ({ page }) => {
  await open(page, 'flat')
  const chart = page.locator('c2-sunburst-chart')
  await expect(chart).toHaveState('ready')
  const paths = await chart.evaluate((element) => (element as SunburstElement).nodes.map((node) => node.path.join('/')))
  expect(paths).toEqual([
    'US',
    'US/Tech',
    'US/Tech/AAPL',
    'US/Tech/MSFT',
    'US/Energy',
    'US/Energy/XOM',
    'EU',
    'EU/Tech',
    'EU/Tech/SAP',
    'EU/Energy',
    'EU/Energy/SHEL',
  ])
})

test('labels a segment along the arc or the radius where its name fits, and none with labels="none"', async ({ page }) => {
  await open(page)
  const chart = page.locator('c2-sunburst-chart')
  await expect(chart).toHaveState('ready')

  const result = await chart.evaluate(async (element) => {
    const sunburst = element as SunburstElement
    const label = (data: EngineNode[], name: string): EngineNode['label'] | undefined => {
      for (const node of data) {
        if (node.name.endsWith(`\u001f${name}`)) return node.label
        const found = label(node.children ?? [], name)
        if (found) return found
      }
      return undefined
    }
    const [data] = sunburst.projectData(sunburst.frame, sunburst.buildContext())
    const placements = (nodes: EngineNode[], ring = 1, out: string[] = []): string[] => {
      for (const node of nodes) {
        out.push(`${ring}:${node.label.show ? node.label.rotate : 'none'}`)
        placements(node.children ?? [], ring + 1, out)
      }
      return out
    }
    const auto = { engineering: label(data, 'Engineering'), compute: label(data, 'Compute'), placed: placements(data) }
    // A narrower chart: the outer names that ran along their arcs now only fit along the radius.
    sunburst.style.width = '360px'
    sunburst.style.height = '360px'
    await new Promise((resolve) => setTimeout(resolve, 200))
    await sunburst.updateComplete
    const [narrow] = sunburst.projectData(sunburst.frame, sunburst.buildContext())
    sunburst.labels = 'none'
    await sunburst.updateComplete
    const [hidden] = sunburst.projectData(sunburst.frame, sunburst.buildContext())
    const shown = (nodes: EngineNode[]): number => nodes.reduce((sum, node) => sum + (node.label.show ? 1 : 0) + shown(node.children ?? []), 0)
    return { auto, narrow: placements(narrow), none: shown(hidden) }
  })
  expect(result.auto.engineering).toMatchObject({ show: true, rotate: 'tangential', color: '#ffffff' })
  expect(result.auto.compute?.show).toBe(true)
  // The first ring runs along its arcs; deeper, narrow arcs turn their names along the radius, and some fit neither.
  expect(result.auto.placed.filter((item) => item.startsWith('1:'))).toEqual(['1:tangential', '1:tangential', '1:tangential', '1:tangential'])
  expect(result.auto.placed).toContain('3:radial')
  expect(result.auto.placed).toContain('3:none')
  expect(result.narrow.filter((item) => item === '3:none').length).toBeGreaterThan(result.auto.placed.filter((item) => item === '3:none').length)
  expect(result.none).toBe(0)
})

test('hides the names a small sunburst cannot hold, and the hole text it has no room for', async ({ page }) => {
  await open(page, 'small')
  const chart = page.locator('c2-sunburst-chart')
  await expect(chart).toHaveState('ready')
  await expect(chart.locator('.legend-item')).toHaveCount(4)
  await expect(chart.locator('.sunburst-center-label')).toHaveCount(0)
  const shown = await chart.evaluate((element) => {
    const sunburst = element as SunburstElement
    const [data] = sunburst.projectData(sunburst.frame, sunburst.buildContext())
    return data.filter((node) => node.label.show).length
  })
  expect(shown).toBe(0)
})

test('shows the total in the hole, and the slot replaces it', async ({ page }) => {
  await open(page)
  const chart = page.locator('c2-sunburst-chart')
  await expect(chart).toHaveState('ready')
  await expect(chart.locator('.sunburst-center-label')).toHaveText('Total')
  await expect(chart.locator('.sunburst-center-value')).toHaveText('$11.7M')
  await chart.evaluate((element) => {
    const span = document.createElement('strong')
    span.slot = 'center'
    span.textContent = 'Budget 2026'
    element.append(span)
  })
  await expect(chart.locator('strong[slot="center"]')).toBeVisible()
  await expect(chart.locator('.sunburst-center-value')).toBeHidden()
})

test('the tooltip gives the path, the value and both shares', async ({ page }) => {
  await open(page)
  const chart = page.locator('c2-sunburst-chart')
  await expect(chart).toHaveState('ready')

  const tooltip = await chart.evaluate((element) => {
    const api = (window as unknown as { sunburstScenario: ScenarioApi }).sunburstScenario
    let seen: string[] = []
    element.addEventListener('tooltip-change', (event) => {
      const detail = (event as CustomEvent).detail as { formattedX: string; entries: { series: { label: string }; formatted: string }[] } | null
      if (detail) seen = [detail.formattedX, ...detail.entries.map((entry) => `${entry.series.label}=${entry.formatted}`)]
    })
    api.hover({ index: 0, seriesIndex: 0, px: 300, py: 100, name: api.engineName(['Engineering', 'Platform', 'Compute'], true) })
    return seen
  })
  expect(tooltip).toEqual(['Engineering › Platform › Compute', 'Budget=$1.1M', 'Share of total=9.4%', 'Share of Platform=52.4%'])
  await expect(chart.locator('.tooltip')).toContainText('Engineering › Platform › Compute')
})

test('hovering a segment keeps its path to the centre and fades the rest', async ({ page }) => {
  await open(page, 'budget', '&renderer=svg&animation=none')
  const chart = page.locator('c2-sunburst-chart')
  await expect(chart).toHaveState('ready')

  const options = await chart.evaluate((element) => {
    const sunburst = element as SunburstElement
    const series = sunburst.buildOptions(sunburst.buildContext()).series[0] as {
      emphasis: { focus: string }
      blur: { itemStyle: { opacity: number } }
      nodeClick: unknown
    }
    return { focus: series.emphasis.focus, blur: series.blur.itemStyle.opacity, nodeClick: series.nodeClick }
  })
  expect(options).toEqual({ focus: 'ancestor', blur: 0.25, nodeClick: false })

  // A real pointer over Engineering's first ring segment (right of the hole): the others fade in the SVG.
  const box = await chart.locator('.plot').boundingBox()
  if (!box) throw new Error('no plot')
  await page.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2 + 10)
  await expect
    .poll(() =>
      chart.evaluate((element) => {
        const paths = [...(element.shadowRoot?.querySelectorAll('.plot svg path') ?? [])]
        return paths.filter((path) => Number(path.getAttribute('fill-opacity') ?? path.getAttribute('opacity') ?? 1) < 0.5).length
      }),
    )
    .toBeGreaterThan(5)
})

test('clicking a group zooms into it: zoom-change, the breadcrumb and the centre button', async ({ page }) => {
  await open(page)
  const chart = page.locator('c2-sunburst-chart')
  await expect(chart).toHaveState('ready')
  await expect(chart.locator('.sunburst-breadcrumb')).toHaveCount(0)

  await chart.evaluate((element) => {
    const api = (window as unknown as { sunburstScenario: ScenarioApi }).sunburstScenario
    api.click({ index: 0, seriesIndex: 0, name: api.engineName(['Engineering'], false) })
    return (element as SunburstElement).updateComplete
  })
  const events = await page.evaluate(() =>
    (window as unknown as { sunburstScenario: ScenarioApi }).sunburstScenario.events.filter((event) => event.type === 'zoom-change'),
  )
  expect(events).toHaveLength(1)
  expect(events[0].detail).toMatchObject({ path: ['Engineering'], node: { label: 'Engineering', depth: 1, leaf: false } })
  expect(await chart.evaluate((element) => (element as SunburstElement).root)).toEqual(['Engineering'])

  const crumbs = chart.locator('.sunburst-breadcrumb li')
  await expect(crumbs).toHaveText(['All', 'Engineering'])
  await expect(chart.locator('.sunburst-breadcrumb [aria-current="location"]')).toHaveText('Engineering')
  const back = chart.getByRole('button', { name: 'Back to All' })
  await expect(back).toBeVisible()
  await expect(chart.locator('.sunburst-center-label')).toHaveText('Engineering')
  await expect(chart.locator('.sunburst-center-value')).toHaveText('$5.1M')

  // Deeper, then the breadcrumb goes straight back to the top.
  await chart.evaluate((element) => (element as SunburstElement).zoomTo(['Engineering', 'Platform']))
  await expect(crumbs).toHaveText(['All', 'Engineering', 'Platform'])
  await expect(chart.getByRole('button', { name: 'Back to Engineering' })).toBeVisible()
  await chart.getByRole('button', { name: 'Back to Engineering' }).click()
  await expect(crumbs).toHaveText(['All', 'Engineering'])
  await chart.locator('.sunburst-breadcrumb').getByRole('button', { name: 'All' }).click()
  await expect(chart.locator('.sunburst-breadcrumb')).toHaveCount(0)
  expect(await chart.evaluate((element) => (element as SunburstElement).root)).toEqual([])
})

test('a leaf click fires point-click and highlights it, dimming everything off its path', async ({ page }) => {
  await open(page)
  const chart = page.locator('c2-sunburst-chart')
  await expect(chart).toHaveState('ready')

  const result = await chart.evaluate(async (element) => {
    const sunburst = element as SunburstElement
    const api = (window as unknown as { sunburstScenario: ScenarioApi }).sunburstScenario
    api.click({ index: 0, seriesIndex: 0, name: api.engineName(['Sales', 'Field', 'Enterprise'], true) })
    await sunburst.updateComplete
    const [data] = sunburst.projectData(sunburst.frame, sunburst.buildContext())
    return {
      highlighted: sunburst.highlighted,
      root: sunburst.root,
      events: api.events.map((event) => event.type),
      sales: data[1].itemStyle.opacity,
      field: data[1].children?.[0]?.itemStyle.opacity,
      inside: data[1].children?.[1]?.itemStyle.opacity,
      engineering: data[0].itemStyle.opacity,
    }
  })
  expect(result.highlighted).toBe('Sales › Field › Enterprise')
  expect(result.root).toEqual([])
  expect(result.events).toContain('point-click')
  expect(result.events).not.toContain('zoom-change')
  expect([result.sales, result.field, result.inside, result.engineering]).toEqual([1, 1, 0.25, 0.25])
})

test('a cancelled zoom-change keeps the zoom', async ({ page }) => {
  await open(page)
  const chart = page.locator('c2-sunburst-chart')
  await expect(chart).toHaveState('ready')
  const result = await chart.evaluate(async (element) => {
    const sunburst = element as SunburstElement
    const cancel = (event: Event) => event.preventDefault()
    sunburst.addEventListener('zoom-change', cancel)
    const changed = sunburst.zoomTo(['Sales'])
    await sunburst.updateComplete
    const kept = [...sunburst.root]
    sunburst.removeEventListener('zoom-change', cancel)
    const second = sunburst.zoomTo(['Sales'])
    await sunburst.updateComplete
    return { changed, kept, second, root: sunburst.root, out: sunburst.zoomOut(), outAgain: sunburst.zoomOut() }
  })
  expect(result).toEqual({ changed: false, kept: [], second: true, root: ['Sales'], out: true, outAgain: false })
})

test('`root` as an attribute renders zoomed, and a path through a leaf draws its deepest group but is kept as written', async ({ page }) => {
  await open(page, 'root')
  const chart = page.locator('c2-sunburst-chart')
  await expect(chart).toHaveState('ready')
  await expect(chart.locator('.sunburst-breadcrumb li')).toHaveText(['All', 'Engineering'])
  const result = await chart.evaluate(async (element) => {
    const sunburst = element as SunburstElement
    const first = () => sunburst.projectData(sunburst.frame, sunburst.buildContext())[0].map((node) => node.name.split('\u001f').at(-1))
    const engineering = first()
    sunburst.root = ['Marketing', 'Brand', 'Nothing']
    await sunburst.updateComplete
    await sunburst.updateComplete
    return { engineering, marketing: first(), root: sunburst.root }
  })
  expect(result.engineering).toEqual(['Platform', 'Product', 'Data'])
  expect(result.marketing).toEqual(['Demand', 'Brand', 'Events'])
  expect(result.root).toEqual(['Marketing', 'Brand', 'Nothing'])
  await expect(chart.locator('.sunburst-breadcrumb li')).toHaveText(['All', 'Marketing'])
})

test('a `root` deeper than the data lands there once lazy data supplies the branch, and follows a hidden branch back', async ({ page }) => {
  await open(page)
  const chart = page.locator('c2-sunburst-chart')
  await expect(chart).toHaveState('ready')
  const crumbs = chart.locator('.sunburst-breadcrumb li')
  const full = await chart.evaluate((element) => (element as SunburstElement).data)
  await chart.evaluate(async (element) => {
    const sunburst = element as SunburstElement
    // Platform is not loaded yet: Engineering stands in for it.
    const rows = structuredClone(sunburst.data) as { name: string; children?: { name: string }[] }[]
    rows[0].children = rows[0].children?.filter((child) => child.name !== 'Platform')
    sunburst.data = rows
    sunburst.root = ['Engineering', 'Platform']
    await sunburst.updateComplete
  })
  await expect(crumbs).toHaveText(['All', 'Engineering'])
  expect(await chart.evaluate((element) => (element as SunburstElement).root)).toEqual(['Engineering', 'Platform'])

  await chart.evaluate(async (element, rows) => {
    ;(element as SunburstElement).data = rows
    await (element as SunburstElement).updateComplete
  }, full)
  await expect(crumbs).toHaveText(['All', 'Engineering', 'Platform'])

  await chart.evaluate((element) => (element as SunburstElement).setGroupVisible('Engineering', false))
  await expect(chart.locator('.sunburst-breadcrumb')).toHaveCount(0)
  await chart.evaluate((element) => (element as SunburstElement).setGroupVisible('Engineering', true))
  await expect(crumbs).toHaveText(['All', 'Engineering', 'Platform'])
  const zoomChanges = await page.evaluate(
    () => (window as unknown as { sunburstScenario: ScenarioApi }).sunburstScenario.events.filter((event) => event.type === 'zoom-change').length,
  )
  expect(zoomChanges).toBe(0)
})

test('zooming out with the keyboard lands on the group just left', async ({ page }) => {
  await open(page)
  const chart = page.locator('c2-sunburst-chart')
  await expect(chart).toHaveState('ready')
  const live = chart.locator('.sunburst-a11y[aria-live]')
  await chart.evaluate((element) => (element as SunburstElement).zoomTo(['Engineering', 'Platform']))
  await chart.locator('.plot').focus()
  await page.keyboard.press('ArrowRight')
  await expect(live).toContainText('Engineering › Platform › Compute')
  await page.keyboard.press('Escape')
  await expect(chart.locator('.sunburst-breadcrumb li')).toHaveText(['All', 'Engineering'])
  await expect(live).toHaveText('Zoomed into Engineering, $5.1M. Engineering › Platform, $2.1M, 17.9% of total, 3 items. Enter to zoom.')
  await page.keyboard.press('Escape')
  await expect(live).toContainText('Zoomed out to all, $11.7M. Engineering, $5.1M')
})

test('the keyboard walks the tree, zooms with Enter and out with Escape, and announces each segment', async ({ page }) => {
  await open(page)
  const chart = page.locator('c2-sunburst-chart')
  await expect(chart).toHaveState('ready')
  const plot = chart.locator('.plot')
  const live = chart.locator('.sunburst-a11y[aria-live]')
  const ring = chart.locator('.sunburst-focus-ring')

  await plot.focus()
  await page.keyboard.press('ArrowRight')
  await expect(live).toHaveText('Engineering, $5.1M, 43.6% of total, 3 items. Enter to zoom.')
  await expect(ring).toHaveCount(1)
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowDown')
  await expect(live).toHaveText('Sales › Field, $1.6M, 13.7% of total, 2 items. Enter to zoom.')
  await page.keyboard.press('ArrowRight')
  await expect(live).toContainText('Sales › Inside')
  await page.keyboard.press('ArrowRight')
  await expect(live).toContainText('Sales › Field')
  await page.keyboard.press('ArrowDown')
  await expect(live).toHaveText('Sales › Field › Enterprise, $1M, 8.5% of total')
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowUp')
  await expect(live).toContainText('Sales, $2.5M')

  await page.keyboard.press('Enter')
  await expect(chart.locator('.sunburst-breadcrumb li')).toHaveText(['All', 'Sales'])
  await expect(live).toHaveText('Zoomed into Sales, $2.5M. Sales › Field, $1.6M, 13.7% of total, 2 items. Enter to zoom.')
  await expect(plot).toBeFocused()

  await page.keyboard.press('Escape')
  await expect(chart.locator('.sunburst-breadcrumb')).toHaveCount(0)
  await expect(live).toContainText('Zoomed out to all, $11.7M. Sales, $2.5M')

  await page.keyboard.press('Escape')
  await expect(ring).toHaveCount(0)
  await expect(live).toHaveText('')
})

test('Enter on a leaf fires point-click instead of zooming', async ({ page }) => {
  await open(page)
  const chart = page.locator('c2-sunburst-chart')
  await expect(chart).toHaveState('ready')
  await chart.locator('.plot').focus()
  // Engineering, then round the ring to Operations, whose children are leaves.
  for (const key of ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'Enter']) await page.keyboard.press(key)
  const events = await page.evaluate(() => (window as unknown as { sunburstScenario: ScenarioApi }).sunburstScenario.events.map((event) => event.type))
  expect(events).toContain('point-click')
  expect(events).not.toContain('zoom-change')
  expect(await chart.evaluate((element) => (element as SunburstElement).highlighted)).toBe('Operations › Finance')
})

test('names the plot, lists every leaf in a hidden table, and passes axe zoomed in and out', async ({ page }) => {
  await open(page)
  const chart = page.locator('c2-sunburst-chart')
  await expect(chart).toHaveState('ready')
  const plot = chart.locator('.plot')
  await expect(plot).toHaveAttribute('aria-label', 'Sunburst of Budget, 19 items')
  await expect(plot).toHaveAttribute('role', 'group')
  await expect(plot).toHaveAttribute('aria-roledescription', 'sunburst chart')
  await expect(plot).toHaveAttribute('tabindex', '0')
  const rows = chart.locator('table.sunburst-a11y tbody tr')
  await expect(rows).toHaveCount(19)
  await expect(rows.first()).toHaveText(/Engineering › Platform\s*Compute\s*\$1\.1M\s*9\.4%\s*52\.4%/)

  const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']
  expect((await new AxeBuilder({ page }).include('c2-sunburst-chart').withTags(tags).analyze()).violations).toEqual([])
  await chart.evaluate((element) => (element as SunburstElement).zoomTo(['Engineering', 'Platform']))
  await expect(chart.locator('.sunburst-breadcrumb')).toBeVisible()
  expect((await new AxeBuilder({ page }).include('c2-sunburst-chart').withTags(tags).analyze()).violations).toEqual([])
})

test('writes nothing on the host, and renders the breadcrumb from `root` before the rings are measured', async ({ page }) => {
  await open(page)
  const result = await page.evaluate(async () => {
    const element = document.createElement('c2-sunburst-chart') as unknown as SunburstElement
    element.setAttribute('label-field', 'name')
    element.setAttribute('root', '["Engineering","Platform"]')
    element.style.width = '400px'
    element.style.height = '300px'
    document.body.append(element)
    await element.updateComplete
    const shadow = element.shadowRoot
    // The first render is what a server renders: no measurement yet, so the hole holds no data-driven text.
    const first = {
      crumbs: [...(shadow?.querySelectorAll('.sunburst-breadcrumb li') ?? [])].map((item) => item.textContent?.trim()),
      back: shadow?.querySelector('button.sunburst-center')?.getAttribute('aria-label'),
      centerText: shadow?.querySelector('.sunburst-center-text') !== null,
    }
    return { first, attributes: element.getAttributeNames().sort() }
  })
  expect(result.first).toEqual({ crumbs: ['All', 'Engineering', 'Platform'], back: 'Back to Engineering', centerText: false })
  expect(result.attributes).toEqual(['label-field', 'root', 'style'])
})

test('morphs a zoom in 400 ms, and instantly under reduced motion or animation="none"', async ({ page }) => {
  await open(page)
  const chart = page.locator('c2-sunburst-chart')
  await expect(chart).toHaveState('ready')
  const duration = () =>
    chart.evaluate(async (element) => {
      const sunburst = element as SunburstElement
      await sunburst.updateComplete
      return (sunburst.buildOptions(sunburst.buildContext()).series[0] as { animationDurationUpdate: number }).animationDurationUpdate
    })
  expect(await duration()).toBe(400)
  await chart.evaluate((element) => ((element as SunburstElement).animation = 'none'))
  expect(await duration()).toBe(0)
  await chart.evaluate((element) => ((element as SunburstElement).animation = 'auto'))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  expect(await duration()).toBe(0)
})

test('reads its layout from the theming variables', async ({ page }) => {
  await open(page)
  const chart = page.locator('c2-sunburst-chart')
  await expect(chart).toHaveState('ready')
  const result = await chart.evaluate(async (element) => {
    const sunburst = element as SunburstElement
    // Lengths in any unit: rem resolves against the root's 16px.
    sunburst.style.setProperty('--c2-chart__segment--gap', '0.25rem')
    sunburst.style.setProperty('--c2-chart__segment--border-radius', '0.375rem')
    sunburst.style.setProperty('--c2-chart__hole--size', '50%')
    sunburst.style.setProperty('--c2-chart__breadcrumb--color', 'rgb(1, 2, 3)')
    sunburst.style.setProperty('--c2-chart__breadcrumb--font-size', '1.25rem')
    sunburst.style.setProperty('--c2-chart__center--background', 'rgb(4, 5, 6)')
    sunburst.zoomTo(['Sales'])
    await sunburst.updateComplete
    const context = sunburst.buildContext()
    const series = sunburst.buildOptions(context).series[0] as { radius: number[]; center: number[]; itemStyle: { borderWidth: number; borderRadius: number } }
    const shadow = sunburst.shadowRoot as ShadowRoot
    return {
      // The rings sit below a breadcrumb strip of 1.5 × 20px + 8px.
      inset: series.center[1] * 2 - context.height,
      gap: series.itemStyle.borderWidth,
      radius: series.itemStyle.borderRadius,
      hole: series.radius[0] / series.radius[1],
      crumb: getComputedStyle(shadow.querySelector('.sunburst-breadcrumb button') as Element).color,
      center: getComputedStyle(shadow.querySelector('.sunburst-center') as Element).backgroundColor,
    }
  })
  expect(result.gap).toBe(4)
  expect(result.radius).toBe(6)
  expect(result.inset).toBe(38)
  expect(result.hole).toBeCloseTo(0.5, 2)
  expect(result.crumb).toBe('rgb(1, 2, 3)')
  expect(result.center).toBe('rgb(4, 5, 6)')
})

test('hiding a branch from the legend keeps the others’ colours and shares', async ({ page }) => {
  await open(page)
  const chart = page.locator('c2-sunburst-chart')
  await expect(chart).toHaveState('ready')
  const result = await chart.evaluate(async (element) => {
    const sunburst = element as SunburstElement
    const before = sunburst.getLegendItems().map((item) => item.color)
    const share = sunburst.nodes.find((node) => node.label === 'Sales')?.share
    sunburst.setGroupVisible('Engineering', false)
    await sunburst.updateComplete
    return {
      top: sunburst.nodes.filter((node) => node.depth === 1).map((node) => node.label),
      kept: sunburst.getLegendItems().map((item) => item.color),
      before,
      shareKept: sunburst.nodes.find((node) => node.label === 'Sales')?.share === share,
    }
  })
  expect(result.top).toEqual(['Sales', 'Marketing', 'Operations'])
  expect(result.kept).toEqual(result.before)
  expect(result.shareKept).toBe(true)
})

test('shows the empty state without data', async ({ page }) => {
  const errors = watchErrors(page)
  await open(page, 'empty')
  const chart = page.locator('c2-sunburst-chart')
  await expect(chart.locator('.state')).toHaveText('No data')
  await expect(chart.locator('table.sunburst-a11y')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('a real click on a segment zooms through the animated morph without errors', async ({ page }) => {
  const errors = watchErrors(page)
  await open(page)
  const chart = page.locator('c2-sunburst-chart')
  await expect(chart).toHaveState('ready')
  const box = await chart.locator('.plot').boundingBox()
  if (!box) throw new Error('no plot')
  // Engineering's first-ring segment sits right of the hole.
  await page.mouse.click(box.x + box.width / 2 + 90, box.y + box.height / 2 + 10)
  await expect(chart.locator('.sunburst-breadcrumb li')).toHaveText(['All', 'Engineering'])
  await page.waitForTimeout(500)
  // The hole is now the way back.
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2 + 20)
  await expect(chart.locator('.sunburst-breadcrumb')).toHaveCount(0)
  expect(errors).toEqual([])
})

// Uneven depth (Operations stops at two levels, Platform goes to three) must not push any segment past the outer ring.
for (const height of ['480px', '320px']) {
  test(`draws every segment inside the outer ring, at ${height} high`, async ({ page }) => {
    await open(page, 'budget', '&animation=none')
    const chart = page.locator('c2-sunburst-chart')
    await expect(chart).toHaveState('ready')
    await chart.evaluate(async (element, value) => {
      ;(element as HTMLElement).style.height = value
      await new Promise((resolve) => setTimeout(resolve, 300))
    }, height)
    const result = await chart.evaluate((element) => {
      const sunburst = element as SunburstElement
      const series = sunburst.buildOptions(sunburst.buildContext()).series[0] as { center: number[]; radius: number[] }
      const canvas = sunburst.shadowRoot?.querySelector('.plot canvas') as HTMLCanvasElement
      const scale = canvas.width / canvas.clientWidth
      const pixels = (canvas.getContext('2d') as CanvasRenderingContext2D).getImageData(0, 0, canvas.width, canvas.height).data
      // The circle the plot box allows (4px clear of its edges), worked out independently of the options.
      const cx = canvas.clientWidth / 2
      const cy = canvas.clientHeight / 2
      const outer = Math.min(canvas.clientWidth, canvas.clientHeight) / 2 - 4
      const option = series.radius[1]
      let farthest = 0
      for (let y = 0; y < canvas.height; y += 1) {
        for (let x = 0; x < canvas.width; x += 1) {
          if (pixels[(y * canvas.width + x) * 4 + 3] < 32) continue
          farthest = Math.max(farthest, Math.hypot(x / scale - cx, y / scale - cy))
        }
      }
      return { farthest, outer, option, center: series.center, expected: [cx, cy] }
    })
    expect(result.option).toBeCloseTo(result.outer, 0)
    expect(result.center).toEqual(result.expected)
    // Something is drawn on the outer ring, and nothing beyond it (a pixel of antialiasing and the gap stroke aside).
    expect(result.farthest).toBeGreaterThan(result.outer - 2)
    expect(result.farthest).toBeLessThanOrEqual(result.outer + 2)
  })
}

test('builds the engine tree once per update, measuring each name once', async ({ page }) => {
  await open(page, 'budget', '&animation=none')
  const chart = page.locator('c2-sunburst-chart')
  await expect(chart).toHaveState('ready')
  const result = await chart.evaluate(async (element) => {
    const sunburst = element as SunburstElement
    // Every label fit measures text on a canvas; count those calls across one highlight update.
    const original = CanvasRenderingContext2D.prototype.measureText
    let calls = 0
    CanvasRenderingContext2D.prototype.measureText = function (this: CanvasRenderingContext2D, text: string) {
      if (text === 'Compute') calls += 1
      return original.call(this, text)
    }
    try {
      sunburst.highlighted = 'Sales'
      await sunburst.updateComplete
      await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 50)))
      const first = sunburst.projectData(sunburst.frame, sunburst.buildContext())
      const second = sunburst.projectData(sunburst.frame, sunburst.buildContext())
      return { calls, same: first[0] === second[0] }
    } finally {
      CanvasRenderingContext2D.prototype.measureText = original
    }
  })
  expect(result.calls).toBe(1)
  expect(result.same).toBe(true)
})
