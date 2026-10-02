import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { test } from '../../../../tests/fixture'
// Pulls in the `window.mapScenario` declaration the scenario page installs.
import './map-scenario-api'

async function open(page: Page, scenario = 'world', query = ''): Promise<void> {
  await page.goto(`/packages/components/chart/test/map-scenarios.html?scenario=${scenario}${query}`)
  await expect(page.locator('main')).toHaveAttribute('data-ready', 'true')
}

/** The members of the element the specs read; all of them are protected or internal on the class. */
interface MapInternals {
  buildContext(): unknown
  buildOptions(context: unknown): {
    geo: {
      map: string
      roam: boolean | string
      boundingCoords: [[number, number], [number, number]] | null
      projection?: { project(point: number[]): number[] | null }
      regions: { name: string; itemStyle: { areaColor: string; borderColor?: string; borderWidth?: number } }[]
    }
    series: { type: string; name: string; polyline?: boolean }[]
  }
  projectData(): unknown[][]
  regions: { key: string; name: string }[]
}

test('joins rows to countries by ISO alpha-3 code and shades them on a sequential scale', async ({ page }) => {
  await open(page)
  const chart = page.locator('c2-map-chart')
  await expect(chart).toHaveAttribute('data-chart-engine', 'echarts')

  const result = await chart.evaluate((element) => {
    const map = element as unknown as MapInternals
    const { geo } = map.buildOptions(map.buildContext())
    return {
      regionCount: map.regions.length,
      hasAntarctica: map.regions.some((region) => region.name === 'Antarctica'),
      shaded: Object.fromEntries(geo.regions.map((region) => [region.name, region.itemStyle.areaColor])),
      roam: geo.roam,
      identity: geo.projection?.project([12, 34]),
      planar: (
        element as unknown as {
          prepared: { registered: Map<string, { planar: { features: { properties: { name: string }; geometry: { coordinates: number[][][][] } }[] } }> }
        }
      ).prepared.registered.get('equal-earth')?.planar,
    }
  })

  // Natural Earth 1:110m has 177 shapes; Antarctica is left out.
  expect(result.regionCount).toBe(176)
  expect(result.hasAntarctica).toBe(false)
  // The largest value takes the end colour, the smallest the start colour; `fra` matched FRA regardless of case.
  expect(Object.keys(result.shaded).sort()).toEqual(['BRA', 'DEU', 'FRA', 'IND', 'USA'])
  expect(result.shaded.USA).toBe('rgb(10, 59, 140)')
  expect(result.shaded.BRA).toBe('rgb(220, 232, 251)')
  expect(result.roam).toBe(true)
  // d3 projects the outlines; ECharts is handed the plane through an identity projection.
  expect(result.identity).toEqual([12, 34])
  // No ring may stretch across the map: a polygon crossing the antimeridian (Russia, Fiji) is cut there by d3,
  // where projecting vertex by vertex would draw a stripe from one edge to the other.
  const features = result.planar?.features ?? []
  const xs = features.flatMap((item) => item.geometry.coordinates.flat(3).filter((_value, index) => index % 2 === 0))
  const width = Math.max(...xs) - Math.min(...xs)
  const widest = features
    .flatMap((item) =>
      item.geometry.coordinates.flatMap((polygon) =>
        polygon.map((ring) => ({ name: item.properties.name, span: Math.max(...ring.map((p) => p[0])) - Math.min(...ring.map((p) => p[0])) })),
      ),
    )
    .sort((a, b) => b.span - a.span)[0]
  expect(features).toHaveLength(176)
  expect(widest.span / width).toBeLessThan(0.5)

  const unmatched = await page.evaluate(() => window.mapScenario.events.filter((event) => event.type === 'unmatched-rows').map((event) => event.detail))
  expect(unmatched).toEqual([{ keys: ['XXX'] }])
})

test('the engine draws every country, shaded ones in their scale colour, without console errors', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  // The harness page has no favicon; anything else the map fails to load is an error.
  page.on('response', (response) => {
    if (response.status() >= 400 && !response.url().endsWith('/favicon.ico')) errors.push(`${response.status()} ${response.url()}`)
  })
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) errors.push(message.text())
  })
  await open(page, 'world', '&renderer=svg')
  const chart = page.locator('c2-map-chart')
  await expect(chart).toHaveAttribute('data-chart-ready', 'true')
  const fills = await chart.evaluate((element) => {
    const paths = Array.from(element.shadowRoot?.querySelectorAll('.plot svg path') ?? [])
    const count = (color: string) => paths.filter((path) => path.getAttribute('fill') === color).length
    const box = (color: string) => {
      const path = paths.find((item) => item.getAttribute('fill') === color) as SVGGraphicsElement | undefined
      const rect = path?.getBoundingClientRect()
      return rect ? rect.width > 0 && rect.height > 0 : false
    }
    return { usa: count('rgb(10, 59, 140)'), usaVisible: box('rgb(10, 59, 140)'), plain: count('rgb(244, 244, 245)') }
  })
  // One compound path per country: the USA in the scale's end colour, and the 171 countries without a row plain.
  expect(fills.usa).toBe(1)
  expect(fills.usaVisible).toBe(true)
  expect(fills.plain).toBe(171)
  expect(errors).toEqual([])
})

test('reads scale colours the theme writes as color-mix()', async ({ page }) => {
  await open(page)
  const chart = page.locator('c2-map-chart')
  await expect(chart).toHaveAttribute('data-chart-ready', 'true')
  const usa = await chart.evaluate((element) => {
    // `@c2n/theme` sets the scale ends as color-mix() expressions, which Chrome computes to `color(srgb …)`.
    element.style.setProperty('--c2-chart__scale-end--color', 'color-mix(in srgb, #0265dc 70%, #18181b)')
    const map = element as unknown as MapInternals
    return map.buildOptions(map.buildContext()).geo.regions.find((region) => region.name === 'USA')?.itemStyle.areaColor
  })
  expect(usa).toBe('rgb(9, 78, 162)')
})

test('draws a gradient key with its real bounds and a no-data swatch', async ({ page }) => {
  await open(page)
  const legend = page.locator('c2-map-chart [part="scale-legend"]')
  await expect(legend.locator('.scale-title')).toHaveText('Revenue')
  await expect(legend.locator('.scale-ticks span')).toHaveText(['1,270', '4,820'])
  await expect(legend.locator('.scale-no-data')).toHaveText('No data')
})

test('shows the hovered region with its value, and says when a region has no data', async ({ page }) => {
  await open(page)
  const chart = page.locator('c2-map-chart')
  await expect(chart).toHaveAttribute('data-chart-ready', 'true')

  const detail = await chart.evaluate(async (element) => {
    const next = () =>
      new Promise<{ formattedX: string; region?: { key: string }; row?: unknown; entries: { formatted: string }[] }>((resolve) =>
        element.addEventListener('tooltip-change', (event) => resolve((event as CustomEvent).detail), { once: true }),
      )
    const brazil = next()
    window.mapScenario.hover({ index: 0, seriesIndex: 0, px: 120, py: 140, name: 'BRA', component: 'geo' })
    const withData = await brazil
    const chad = next()
    window.mapScenario.hover({ index: 0, seriesIndex: 0, px: 300, py: 100, name: 'TCD', component: 'geo' })
    const withoutData = await chad
    return {
      withData: { title: withData.formattedX, key: withData.region?.key, row: withData.row, entries: withData.entries.map((entry) => entry.formatted) },
      withoutData: { title: withoutData.formattedX, row: withoutData.row ?? null, entries: withoutData.entries.length },
    }
  })

  expect(detail.withData).toEqual({ title: 'Brazil', key: 'BRA', row: { country: 'BRA', revenue: 1270 }, entries: ['1,270'] })
  expect(detail.withoutData).toEqual({ title: 'Chad', row: null, entries: 0 })
  await expect(chart.locator('.tooltip')).toContainText('No data')
})

/** The viewport position of a longitude and latitude on the drawn map, through the engine's own forward transform. */
async function pointOf(page: Page, lonLat: [number, number]): Promise<{ x: number; y: number }> {
  return page.locator('c2-map-chart').evaluate((element, place) => {
    const map = element as unknown as {
      adapter: { convertToPixel(finder: unknown, value: number[]): [number, number] | null }
      toPlane(place: [number, number]): [number, number] | null
    }
    const plane = map.toPlane(place)
    const pixel = plane ? map.adapter.convertToPixel({ geoIndex: 0 }, plane) : null
    const plot = (element.shadowRoot?.querySelector('.plot') as HTMLElement).getBoundingClientRect()
    if (!pixel) throw new Error('not on the map')
    return { x: plot.left + pixel[0], y: plot.top + pixel[1] }
  }, lonLat)
}

test('a real pointer over a country shows its tooltip', async ({ page }) => {
  await open(page)
  const chart = page.locator('c2-map-chart')
  await expect(chart).toHaveAttribute('data-chart-ready', 'true')
  // Inland Brazil, far from any border.
  const { x, y } = await pointOf(page, [-52, -10])
  await page.mouse.move(x, y)
  await expect(chart.locator('.tooltip-title')).toHaveText('Brazil')
  await expect(chart.locator('.tooltip')).toContainText('1,270')
})

test('lists the joined rows in a table a screen reader can reach', async ({ page }) => {
  await open(page)
  const rows = page.locator('c2-map-chart .data-table tbody tr')
  await expect(rows).toHaveCount(5)
  await expect(rows.filter({ hasText: 'Germany' })).toContainText('2,210')
  const results = await new AxeBuilder({ page }).include('c2-map-chart').analyze()
  expect(results.violations).toEqual([])
})

test('bins a diverging scale into classes around a neutral midpoint', async ({ page }) => {
  await open(page, 'diverging')
  const chart = page.locator('c2-map-chart')
  await expect(chart).toHaveAttribute('data-chart-ready', 'true')

  const result = await chart.evaluate((element) => {
    const map = element as unknown as MapInternals
    const { geo } = map.buildOptions(map.buildContext())
    return {
      regions: map.regions.length,
      colors: Object.fromEntries(geo.regions.map((region) => [region.name, region.itemStyle.areaColor])),
    }
  })

  // 50 states and DC, joined on their USPS codes.
  expect(result.regions).toBe(51)
  // NY sits in the middle class, which is the neutral midpoint colour itself.
  expect(result.colors.NY).toBe('rgb(228, 228, 231)')
  // MI and OH fall in the same class; TX is past the last break and takes the positive end colour.
  expect(result.colors.MI).toBe(result.colors.OH)
  expect(result.colors.TX).toBe('rgb(10, 59, 140)')
  await expect(chart.locator('.scale-break')).toHaveText(['-10%', '-5%', '-2%', '2%', '5%', '10%'])
})

test('sizes points by area, draws the largest first and reports the row a hovered point stands for', async ({ page }) => {
  await open(page, 'layers')
  const chart = page.locator('c2-map-chart')
  await expect(chart).toHaveAttribute('data-chart-ready', 'true')

  const result = await chart.evaluate(async (element) => {
    const map = element as unknown as MapInternals
    const [points, lines] = map.projectData() as [[number, number, number | null, number, number][], { coords: [number, number][] }[]]
    const tooltip = new Promise<{ formattedX: string; entries: { formatted: string; series: { label?: string } }[] }>((resolve) =>
      element.addEventListener('tooltip-change', (event) => resolve((event as CustomEvent).detail), { once: true }),
    )
    // Draw index 0 is Tokyo (row 1), the largest point.
    window.mapScenario.hover({ index: 0, seriesIndex: 0, px: 100, py: 80, component: 'series' })
    const hovered = await tooltip
    const series = map.buildOptions(map.buildContext()).series
    return {
      points: points.map((point) => [point[4], Math.round(point[3] * 10) / 10]),
      // The Rotterdam to New York route is one path; Los Angeles to Yokohama crosses the antimeridian and splits.
      linePieces: lines.length,
      crossing: {
        leaves: lines[1].coords[lines[1].coords.length - 1],
        enters: lines[2].coords[0],
        start: lines[1].coords[0],
        end: lines[2].coords[lines[2].coords.length - 1],
      },
      hovered: { title: hovered.formattedX, entries: hovered.entries.map((entry) => `${entry.series.label}: ${entry.formatted}`) },
      series: series.map((item) => [item.type, item.name, item.polyline ?? null]),
    }
  })

  // Tokyo holds the largest size (40px); Lisbon is √(40 / 160) of it and Lagos √(10 / 160). Nowhere has no position.
  expect(result.points).toEqual([
    [1, 40],
    [0, 20],
    [2, 10],
  ])
  expect(result.linePieces).toBe(3)
  // The route leaves the left edge and re-enters at the right one, at the same latitude, so at the same height.
  const { leaves, enters, start, end } = result.crossing
  expect(leaves[0]).toBeLessThan(start[0])
  expect(enters[0]).toBeGreaterThan(end[0])
  expect(enters[0] - leaves[0]).toBeGreaterThan(600)
  expect(enters[1]).toBeCloseTo(leaves[1], 3)
  expect(result.hovered).toEqual({ title: 'Tokyo', entries: ['Active users: 160'] })
  expect(result.series).toEqual([
    ['scatter', 'Users', null],
    ['lines', 'Routes', true],
  ])
})

test('toggles a layer from the legend', async ({ page }) => {
  await open(page, 'layers')
  const chart = page.locator('c2-map-chart')
  await expect(chart).toHaveAttribute('data-chart-ready', 'true')
  const routes = chart.locator('.legend-item', { hasText: 'Routes' })
  await expect(chart.locator('.legend-item')).toHaveText(['Users', 'Routes'])
  await routes.click()
  await expect(routes).toHaveAttribute('aria-pressed', 'false')
  const drawn = await chart.evaluate((element) => (element as unknown as MapInternals).projectData().map((data) => data.length))
  expect(drawn).toEqual([3, 0])
})

test('draws an SVG map whose regions are its element ids, binned into named classes', async ({ page }) => {
  await open(page, 'svg')
  const chart = page.locator('c2-map-chart')
  await expect(chart).toHaveAttribute('data-chart-ready', 'true')

  const result = await chart.evaluate((element) => {
    const map = element as unknown as MapInternals
    const { geo } = map.buildOptions(map.buildContext())
    return {
      regions: map.regions.map((region) => [region.key, region.name]),
      projection: geo.projection ?? null,
      colors: geo.regions.map((region) => region.itemStyle.areaColor),
    }
  })

  expect(result.regions).toEqual([
    ['A01', 'Rack A01'],
    ['A02', 'Rack A02'],
    ['A03', 'A03'],
  ])
  expect(result.projection).toBeNull()
  expect(result.colors).toEqual(['#16a34a', '#d97706', '#dc2626'])
  await expect(chart.locator('.scale-class')).toHaveText(['OK', 'Warm', 'Hot'])
})

test('selects regions as a form control and fits the view to the extent', async ({ page }) => {
  await open(page, 'picker')
  const chart = page.locator('c2-map-chart')
  await expect(chart).toHaveAttribute('data-chart-ready', 'true')

  const before = await chart.evaluate((element) => {
    const map = element as unknown as MapInternals
    const { geo } = map.buildOptions(map.buildContext())
    return { box: geo.boundingCoords, selected: geo.regions.map((region) => [region.name, region.itemStyle.borderWidth]) }
  })
  // Europe's degree box, in the plane: wider than tall, west of east and north above south.
  const [[x0, y0], [x1, y1]] = before.box as [[number, number], [number, number]]
  expect(x1 - x0).toBeGreaterThan(y1 - y0)
  expect(x0).toBeLessThan(x1)
  expect(y0).toBeLessThan(y1)
  expect(before.selected).toEqual([
    ['FRA', 2],
    ['DEU', 2],
  ])

  const after = await page.evaluate(() => {
    window.mapScenario.click({ index: 0, seriesIndex: 0, name: 'POL', component: 'geo' })
    window.mapScenario.click({ index: 0, seriesIndex: 0, name: 'FRA', component: 'geo' })
    const form = document.querySelector('form') as HTMLFormElement
    return {
      value: (document.querySelector('c2-map-chart') as unknown as { value: string[] }).value,
      form: new FormData(form).getAll('shipTo'),
      events: window.mapScenario.events.filter((event) => event.type !== 'point-click').map((event) => event.type),
      last: window.mapScenario.events.filter((event) => event.type === 'selection-change').pop()?.detail,
    }
  })
  expect(after.value).toEqual(['DEU', 'POL'])
  await expect.poll(() => page.evaluate(() => new FormData(document.querySelector('form') as HTMLFormElement).getAll('shipTo'))).toEqual(['DEU', 'POL'])
  expect(after.events).toEqual(['selection-change', 'input', 'change', 'selection-change', 'input', 'change'])
  expect(after.last).toEqual({
    value: ['DEU', 'POL'],
    regions: [
      { key: 'DEU', name: 'Germany' },
      { key: 'POL', name: 'Poland' },
    ],
  })
})

test('a real click on a country selects it', async ({ page }) => {
  await open(page, 'picker')
  const chart = page.locator('c2-map-chart')
  await expect(chart).toHaveAttribute('data-chart-ready', 'true')
  // Central Spain.
  const { x, y } = await pointOf(page, [-3.7, 40])
  await page.mouse.click(x, y)
  await expect.poll(() => chart.evaluate((element) => (element as unknown as { value: string[] }).value)).toEqual(['DEU', 'FRA', 'ESP'])
})

test('a cancelled point-click keeps the selection', async ({ page }) => {
  await open(page, 'picker')
  await expect(page.locator('c2-map-chart')).toHaveAttribute('data-chart-ready', 'true')
  const value = await page.evaluate(() => {
    const chart = document.querySelector('c2-map-chart') as unknown as HTMLElement & { value: string[] }
    chart.addEventListener('point-click', (event) => event.preventDefault())
    window.mapScenario.click({ index: 0, seriesIndex: 0, name: 'ESP', component: 'geo' })
    return chart.value
  })
  expect(value).toEqual(['DEU', 'FRA'])
})

test('zoom buttons zoom the map and report the visible area', async ({ page }) => {
  await open(page, 'picker')
  const chart = page.locator('c2-map-chart')
  await expect(chart).toHaveAttribute('data-chart-ready', 'true')
  await chart.getByRole('button', { name: 'Zoom in' }).click()
  await expect
    .poll(() =>
      page.evaluate(() => window.mapScenario.events.filter((event) => event.type === 'view-change').map((event) => (event.detail as { zoom: number }).zoom)),
    )
    .toEqual([1.5])
  const bounds = await page.evaluate(
    () => (window.mapScenario.events.find((event) => event.type === 'view-change')?.detail as { bounds: number[] | null }).bounds,
  )
  // Zoomed in on Europe: the visible area is a box somewhere inside it.
  expect(bounds).not.toBeNull()
  const [west, south, east, north] = bounds as number[]
  expect(west).toBeGreaterThan(-40)
  expect(east).toBeLessThan(60)
  expect(south).toBeGreaterThan(25)
  expect(north).toBeLessThan(80)
  await chart.getByRole('button', { name: 'Reset view' }).click()
  await expect
    .poll(() =>
      page.evaluate(() => window.mapScenario.events.filter((event) => event.type === 'view-change').map((event) => (event.detail as { zoom: number }).zoom)),
    )
    .toEqual([1.5, 1])
})

test('shows the error state for an unknown map', async ({ page }) => {
  await open(page, 'unknown')
  await expect(page.locator('c2-map-chart [part="state"]')).toContainText('Unknown map "mars"')
})
