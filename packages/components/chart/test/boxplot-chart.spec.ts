import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect } from '../../../../tests/component-fixture'
import { test } from '../../../../tests/fixture'
// Pulls in the `window.boxplotScenario` declaration the scenario page installs.
import './boxplot-scenario-api'

async function open(page: Page, scenario = 'latency', query = ''): Promise<void> {
  await page.goto(`/packages/components/chart/test/boxplot-scenarios.html?scenario=${scenario}${query}`)
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

type Shape = {
  type: string
  shape?: Record<string, number>
  style?: Record<string, unknown>
  children?: Shape[]
  originX?: number
  originY?: number
  enterFrom?: Record<string, number>
}
type RenderItem = (params: { dataIndex: number; coordSys: { x: number; y: number; width: number; height: number } }, api: unknown) => Shape | null
interface Options {
  animation: boolean
  grid: { top: number }
  xAxis: { type: string; data?: string[]; name?: string; inverse?: boolean }
  yAxis: { type: string; data?: string[]; name?: string; inverse?: boolean }
  series: {
    name: string
    type: string
    renderItem: RenderItem
    markLine?: {
      data: { name: string; xAxis?: number; yAxis?: number; lineStyle: { color: string; type: string }; label: { formatter: string; color: string } }[]
    }
  }[]
}
interface Box {
  label: string
  category: number
  seriesIndex: number
  min: number
  q1: number
  median: number
  q3: number
  max: number
  outliers: number[]
  mean?: number
  count?: number
  given: boolean
}
interface BoxplotElement extends HTMLElement {
  data: unknown
  frame: unknown
  boxes: Box[]
  highlighted: string | null
  orientation: string
  outliers: string
  updateComplete: Promise<boolean>
  buildContext(): unknown
  buildOptions(context: unknown): Options
  projectData(frame: unknown, context: unknown): unknown[][]
  handleEngineClick(detail: { index: number; seriesIndex: number }): void
  getLegendItems(): { label: string; color: string; visible: boolean; toggle(): void }[]
}

const options = (page: Page) =>
  page.locator('c2-boxplot-chart').evaluate((element) => {
    const chart = element as BoxplotElement
    const built = chart.buildOptions(chart.buildContext())
    // Functions do not cross the page boundary; the render callbacks are exercised with `drawn` below.
    return JSON.parse(JSON.stringify(built)) as Options
  })

/**
 * What a series' `renderItem` draws for one datum, against a fake 600 × 300 grid: a band of 100px per category, and 1px
 * per 5 value units from the bottom (or from the left when horizontal).
 */
const drawn = (page: Page, seriesIndex: number, dataIndex: number) =>
  page.locator('c2-boxplot-chart').evaluate(
    (element, [seriesIndex, dataIndex]) => {
      const chart = element as BoxplotElement
      const built = chart.buildOptions(chart.buildContext())
      const horizontal = chart.orientation === 'horizontal'
      const api = {
        coord: ([x, y]: [number, number]) => (horizontal ? [x / 5, y * 100 + 50] : [x * 100 + 50, 300 - y / 5]),
        size: ([x, y]: [number, number]) => (horizontal ? [x / 5, y * 100] : [x * 100, y / 5]),
      }
      return built.series[seriesIndex].renderItem({ dataIndex, coordSys: { x: 0, y: 0, width: 600, height: 300 } }, api)
    },
    [seriesIndex, dataIndex],
  )

/** The children of a drawn box, by role: the hit area, the two whiskers, the two caps, the box and the median. */
function parts(group: Shape | null) {
  const [hit, lower, upper, lowCap, highCap, box, median, mean] = group?.children ?? []
  return { hit, lower, upper, lowCap, highCap, box, median, mean }
}

test('statistics: interpolated quartiles, Tukey fences, range whiskers, summaries and the three input shapes', async ({ page }) => {
  await open(page)
  const result = await page.evaluate(() => {
    const { quantile, summarizeSamples, readSummary, buildBoxplotModel } = window.boxplotScenario.stats
    const sorted = [1, 2, 3, 4]
    return {
      // R-7: rank (n − 1) × p, interpolated between neighbours.
      quartiles: [quantile(sorted, 0.25), quantile(sorted, 0.5), quantile(sorted, 0.75)],
      single: quantile([7], 0.25),
      none: quantile([], 0.5),
      tukey: summarizeSamples([150, 175, 195, 210, 228, 240, 256, 270, 284, 298, 310, 334, 352, 371, 396, 420, 680, 905, 980, 1320, 1120]),
      range: summarizeSamples([5, 1, 3, 100, 2], { whiskers: 'range' }),
      lowOutlier: summarizeSamples([-50, 10, 11, 12, 13, 14]),
      skipped: summarizeSamples([null, 'x', 4, '6', Number.NaN]),
      empty: summarizeSamples([]),
      summary: readSummary({ min: 1, q1: 2, median: 3, q3: 4, max: 5, outliers: [9, 'x', 0], count: 40 }),
      swapped: readSummary({ min: 5, q1: 2, median: 3, q3: 4, max: 1 }),
      incomplete: readSummary({ min: 1, q1: 2, median: 3, q3: 4 }),
      model: buildBoxplotModel(
        [
          { g: 'a', v: 1, w: [10, 20, 30] },
          { g: 'b', v: [4, 5, 6], w: { min: 0, q1: 1, median: 2, q3: 3, max: 4 } },
          { g: 'a', v: 3, w: [40] },
          { g: 'b', v: 7, w: [99] },
          { g: 'c', v: null, w: 'n/a' },
        ],
        { labelField: 'g', fields: ['v', 'w'] },
      ),
    }
  })
  expect(result.quartiles).toEqual([1.75, 2.5, 3.25])
  expect(result.single).toBe(7)
  expect(result.none).toBeNaN()
  expect(result.tukey).toMatchObject({ min: 150, q1: 240, median: 310, q3: 420, max: 680, outliers: [905, 980, 1120, 1320], count: 21 })
  expect(result.tukey?.mean).toBeCloseTo(452.1, 1)
  // Under `range` the whiskers reach the extremes and nothing is an outlier.
  expect(result.range).toMatchObject({ min: 1, q1: 2, median: 3, q3: 5, max: 100, outliers: [], count: 5 })
  expect(result.lowOutlier).toMatchObject({ min: 10, outliers: [-50] })
  expect(result.skipped).toMatchObject({ min: 4, max: 6, median: 5, count: 2 })
  expect(result.empty).toBeNull()
  expect(result.summary).toEqual({ min: 1, q1: 2, median: 3, q3: 4, max: 5, outliers: [0, 9], count: 40 })
  expect(result.swapped).toMatchObject({ min: 1, max: 5 })
  expect(result.incomplete).toBeNull()

  // Regression: a count is a whole, non-negative number; a mean of huge finite samples does not overflow.
  const guarded = await page.evaluate(() => {
    const { readSummary, summarizeSamples } = window.boxplotScenario.stats
    const five = { min: 1, q1: 2, median: 3, q3: 4, max: 5 }
    return {
      negative: readSummary({ ...five, count: -3 })?.count ?? null,
      fraction: readSummary({ ...five, count: 2.5 })?.count ?? null,
      whole: readSummary({ ...five, count: '12' })?.count ?? null,
      mean: summarizeSamples([Number.MAX_VALUE, Number.MAX_VALUE, Number.MAX_VALUE])?.mean,
    }
  })
  expect(guarded).toEqual({ negative: null, fraction: null, whole: 12, mean: Number.MAX_VALUE })

  const { model } = result
  expect(model.categories).toEqual(['a', 'b', 'c'])
  // Numbers pool by label; arrays are a category's samples (pooled with the rest); a summary object is drawn as given.
  expect(model.boxes[0][0]).toMatchObject({ min: 1, median: 2, max: 3, count: 2, given: false })
  expect(model.boxes[0][1]).toMatchObject({ median: 25, count: 4 })
  expect(model.boxes[1][0]).toMatchObject({ median: 5.5, count: 4 })
  expect(model.boxes[1][1]).toMatchObject({ min: 0, median: 2, max: 4, given: true })
  expect(model.boxes[1][1]?.count).toBeUndefined()
  expect(model.boxes[2]).toEqual([null, null])
  expect(model.list).toHaveLength(4)

  // Regression: an unlabelled row is numbered by its position, but never pools with a row whose real label is that number.
  const mixed = await page.evaluate(() =>
    window.boxplotScenario.stats.buildBoxplotModel([{ g: 'x', v: 1 }, { v: 100 }, { g: '2', v: 5 }, { g: 2, v: 7 }], { labelField: 'g', fields: ['v'] }),
  )
  expect(mixed.categories).toEqual(['x', '2', '2'])
  expect(mixed.boxes.map((boxes) => boxes[0]?.count)).toEqual([1, 1, 2])
  expect(mixed.boxes[1][0]).toMatchObject({ median: 100 })
  expect(mixed.boxes[2][0]).toMatchObject({ median: 6 })
})

test('one box per label with its quartiles, whiskers and outliers, named and tabled for assistive technology', async ({ page }) => {
  const errors = watchErrors(page)
  await open(page)
  const chart = page.locator('c2-boxplot-chart')
  await expect(chart).toHaveState('ready')
  const authored = await chart.evaluate((element) => element.getAttributeNames().sort())
  expect(authored).toEqual(['label-field', 'value-suffix'])

  const boxes = await chart.evaluate((element) => (element as BoxplotElement).boxes)
  expect(boxes.map((box) => box.label)).toEqual(['api-gateway', 'auth', 'search', 'checkout', 'payments', 'inventory'])
  expect(boxes[3]).toMatchObject({ min: 150, q1: 240, median: 310, q3: 420, max: 680, outliers: [905, 980, 1120, 1320], count: 21 })

  const built = await options(page)
  expect(built.xAxis).toMatchObject({ type: 'category', data: ['api-gateway', 'auth', 'search', 'checkout', 'payments', 'inventory'] })
  // The suffix, trimmed, names the value axis.
  expect(built.yAxis).toMatchObject({ type: 'value', name: 'ms' })
  // One custom series per c2-chart-series, then the reference lines.
  expect(built.series.map((series) => [series.type, series.name])).toEqual([
    ['custom', 'p50 latency'],
    ['custom', '\u0000reference'],
  ])
  // A box per category, then the outliers.
  const [items] = await chart.evaluate((element) => {
    const box = element as BoxplotElement
    return box.projectData(box.frame, box.buildContext())
  })
  expect(items.slice(3, 4)).toEqual([[3, 150, 240, 310, 420, 680, 310]])
  expect(items).toHaveLength(6 + 2 + 1 + 3 + 4 + 1 + 0)

  // The box: a tinted rect from Q1 to Q3, whiskers out to the ends with caps half the box wide, a heavier median.
  const { hit, lower, upper, lowCap, box, median } = parts(await drawn(page, 0, 3))
  expect(hit.shape).toEqual({ x: 310, y: 0, width: 80, height: 300 })
  expect(box.shape).toEqual({ x: 330, y: 300 - 420 / 5, width: 40, height: 36 })
  expect(box.style).toMatchObject({ fill: 'rgb(199, 221, 247)', stroke: 'rgb(2, 101, 220)', lineWidth: 1.5 })
  expect(median.shape).toEqual({ x1: 330, y1: 238, x2: 370, y2: 238 })
  expect(median.style?.lineWidth).toBe(2.5)
  expect(lower.shape).toEqual({ x1: 350, y1: 270, x2: 350, y2: 252 })
  expect(upper.shape).toEqual({ x1: 350, y1: 216, x2: 350, y2: 164 })
  expect(lowCap.shape).toEqual({ x1: 340, y1: 270, x2: 360, y2: 270 })
  // An outlier: a hollow point in the series colour.
  const outlier = await drawn(page, 0, 6 + 2 + 1 + 3)
  expect(outlier).toMatchObject({
    type: 'circle',
    shape: { cx: 350, cy: 300 - 905 / 5, r: 3 },
    style: { fill: 'rgb(255, 255, 255)', stroke: 'rgb(2, 101, 220)' },
  })

  const plot = chart.locator('[part="plot"]')
  await expect(plot).toHaveAttribute('aria-label', 'Box plot of p50 latency, 6 categories')
  await expect(plot).toHaveAttribute('role', 'group')
  await expect(plot).toHaveAttribute('aria-roledescription', 'box plot')
  await expect(plot).toHaveAttribute('tabindex', '0')
  const table = chart.locator('table.boxplot-a11y')
  await expect(table.locator('thead th')).toHaveText(['Category', 'Series', 'Min', 'Q1', 'Median', 'Q3', 'Max', 'Outliers', 'n'])
  await expect(table.locator('tbody tr').nth(3).locator('th, td')).toHaveText([
    'checkout',
    'p50 latency',
    '150 ms',
    '240 ms',
    '310 ms',
    '420 ms',
    '680 ms',
    '4',
    '21',
  ])
  // A single series has nothing for a legend to tell apart.
  await expect(chart.locator('[part="legend"]')).toBeHidden()
  // Regression: a legend slotted in, even after the first render, keeps the legend's box shown.
  await chart.evaluate((element) => element.insertAdjacentHTML('beforeend', '<span slot="legend">p50 latency, per service</span>'))
  await expect(chart.locator('[part="legend"]')).toBeVisible()
  await expect(page.getByText('p50 latency, per service')).toBeVisible()
  await chart.evaluate((element) => element.querySelector('[slot="legend"]')?.remove())
  await expect(chart.locator('[part="legend"]')).toBeHidden()

  const results = await new AxeBuilder({ page }).include('c2-boxplot-chart').analyze()
  expect(results.violations).toEqual([])
  // Nothing was written on the host.
  expect(await chart.evaluate((element) => element.getAttributeNames().sort())).toEqual(authored)
  expect(errors).toEqual([])
})

test('the tooltip lists the five numbers, the outliers and the count; an outlier names its value', async ({ page }) => {
  await open(page)
  const chart = page.locator('c2-boxplot-chart')
  await expect(chart).toHaveState('ready')
  const tooltip = chart.locator('[part="tooltip"]')
  await page.evaluate(() => window.boxplotScenario.hover({ index: 3, seriesIndex: 0, px: 300, py: 120 }))
  await expect(tooltip.locator('.tooltip-title')).toHaveText('checkout')
  await expect(tooltip.locator('.tooltip-row')).toHaveText([
    /Max\s*680 ms/,
    /Q3\s*420 ms/,
    /Median\s*310 ms/,
    /Q1\s*240 ms/,
    /Min\s*150 ms/,
    /Outliers\s*4, up to 1,320 ms/,
    /Samples\s*21/,
  ])
  // The series colour marks the median row only.
  await expect(tooltip.locator('.tooltip-marker')).toHaveCount(1)
  await expect(tooltip.locator('.tooltip-row').nth(2).locator('.tooltip-marker')).toHaveCount(1)
  // The category gets the backdrop.
  const backdrop = chart.locator('.boxplot-backdrop')
  await expect(backdrop).toBeVisible()
  const [band, plot] = await Promise.all([backdrop.boundingBox(), chart.locator('[part="plot"]').boundingBox()])
  expect(band!.width).toBeGreaterThan(40)
  expect(band!.x).toBeGreaterThan(plot!.x + plot!.width / 2 - band!.width)

  const events = await page.evaluate(() => window.boxplotScenario.events.filter((event) => event.type === 'point-hover'))
  expect(events.at(-1)?.detail).toMatchObject({ index: 3, seriesIndex: 0, x: 3, y: 310, label: 'checkout' })

  await page.evaluate(() => window.boxplotScenario.hover({ index: 6 + 2 + 1 + 3 + 3, seriesIndex: 0, px: 300, py: 40 }))
  await expect(tooltip.locator('.tooltip-title')).toHaveText('checkout')
  await expect(tooltip.locator('.tooltip-row')).toHaveText([/Outlier\s*1,320 ms/])
  await page.evaluate(() => window.boxplotScenario.hover(null))
  await expect(tooltip).toBeHidden()
  await expect(backdrop).toBeHidden()
  // A reference line is not data.
  await page.evaluate(() => window.boxplotScenario.hover({ index: 0, seriesIndex: 1, px: 10, py: 10, component: 'markLine' }))
  await expect(tooltip).toBeHidden()
})

test('a real pointer over a box shows its tooltip', async ({ page }) => {
  await open(page)
  const chart = page.locator('c2-boxplot-chart')
  await expect(chart).toHaveState('ready')
  // ECharts draws on the next frame; the box's middle, from the engine's own scale.
  await page.waitForTimeout(100)
  const pixel = await chart.evaluate((element) => {
    const adapter = (element as unknown as { adapter: { convertToPixel(finder: unknown, value: number[]): [number, number] } }).adapter
    return adapter.convertToPixel({ gridIndex: 0 }, [3, 330])
  })
  const plot = (await chart.locator('[part="plot"]').boundingBox())!
  await page.mouse.move(plot.x + pixel[0], plot.y + pixel[1])
  await expect(chart.locator('[part="tooltip"] .tooltip-title')).toHaveText('checkout')
})

test('long-format rows pool their samples by label; a value that is not a number is skipped', async ({ page }) => {
  await open(page, 'long')
  const chart = page.locator('c2-boxplot-chart')
  await expect(chart).toHaveState('ready')
  const boxes = await chart.evaluate((element) => (element as BoxplotElement).boxes)
  expect(boxes.map((box) => [box.label, box.min, box.q1, box.median, box.q3, box.max, box.count])).toEqual([
    ['/cart', 100, 115, 130, 145, 160, 4],
    ['/search', 40, 55, 70, 85, 100, 4],
  ])
})

test('summary objects are drawn as given, with their outliers and count', async ({ page }) => {
  await open(page, 'summary')
  const chart = page.locator('c2-boxplot-chart')
  await expect(chart).toHaveState('ready')
  const boxes = await chart.evaluate((element) => (element as BoxplotElement).boxes)
  expect(boxes[0]).toMatchObject({ min: 150, q1: 240, median: 310, q3: 420, max: 680, outliers: [905, 1320], count: 1240, given: true })
  expect(boxes[1].outliers).toEqual([])
  await page.evaluate(() => window.boxplotScenario.hover({ index: 0, seriesIndex: 0, px: 100, py: 100 }))
  const tooltip = chart.locator('[part="tooltip"]')
  await expect(tooltip).toContainText(/Outliers\s*2, up to 1,320 ms/)
  await expect(tooltip).toContainText(/Samples\s*1,240/)
  await page.evaluate(() => window.boxplotScenario.hover({ index: 1, seriesIndex: 0, px: 100, py: 100 }))
  await expect(tooltip).not.toContainText('Outliers')
  await expect(chart.locator('table.boxplot-a11y tbody tr').nth(0).locator('td').last()).toHaveText('1,240')
})

test('several series sit side by side in their colours, with the legend; a click highlights one and dims the other', async ({ page }) => {
  await open(page, 'grouped')
  const chart = page.locator('c2-boxplot-chart')
  await expect(chart).toHaveState('ready')
  const legend = chart.locator('[part="legend-item"]')
  await expect(legend).toHaveText(['us-east', 'eu-west'])
  await expect(chart.locator('[part="plot"]')).toHaveAttribute('aria-label', 'Box plot of us-east, eu-west, 5 categories')

  // Within a 100px band the group takes 80px: two 40px slots, each box 30px wide (three quarters of its slot).
  const east = parts(await drawn(page, 0, 0))
  const west = parts(await drawn(page, 1, 0))
  expect(east.box.shape?.x).toBe(15)
  expect(east.box.shape?.width).toBe(30)
  expect(west.box.shape?.x).toBe(55)
  expect(east.box.style?.stroke).toBe('rgb(2, 101, 220)')
  expect(west.box.style?.stroke).toBe('rgb(234, 88, 12)')

  // The tooltip names the box by category and series.
  await page.evaluate(() => window.boxplotScenario.hover({ index: 2, seriesIndex: 1, px: 300, py: 120 }))
  await expect(chart.locator('[part="tooltip"] .tooltip-title')).toHaveText('checkout, eu-west')

  await chart.evaluate(async (element) => {
    const box = element as BoxplotElement
    box.handleEngineClick({ index: 2, seriesIndex: 1 })
    await box.updateComplete
  })
  expect(await chart.evaluate((element) => (element as BoxplotElement).highlighted)).toBe('west')
  expect(parts(await drawn(page, 0, 0)).box.style?.opacity).toBe(0.25)
  expect(parts(await drawn(page, 1, 0)).box.style?.opacity).toBe(1)
  // Regression: a key that names no series dims nothing.
  await chart.evaluate(async (element) => {
    const box = element as BoxplotElement
    box.highlighted = 'nope'
    await box.updateComplete
  })
  expect(parts(await drawn(page, 0, 0)).box.style?.opacity).toBe(1)
  expect(parts(await drawn(page, 1, 0)).box.style?.opacity).toBe(1)
  const clicks = await page.evaluate(() => window.boxplotScenario.events.filter((event) => event.type === 'point-click'))
  expect(clicks.at(-1)?.detail).toMatchObject({ index: 2, seriesIndex: 1, label: 'checkout' })
  await expect(chart.locator('table.boxplot-a11y tbody tr')).toHaveCount(10)
})

test('horizontal: the categories run down the left and a reference line crosses the plot with its label', async ({ page }) => {
  await open(page, 'horizontal')
  const chart = page.locator('c2-boxplot-chart')
  await expect(chart).toHaveState('ready')
  const built = await options(page)
  expect(built.yAxis).toMatchObject({ type: 'category', inverse: true })
  expect(built.xAxis).toMatchObject({ type: 'value', name: 'ms' })
  const lines = built.series[1].markLine?.data ?? []
  // The entry with no numeric value is left out.
  expect(lines).toHaveLength(1)
  expect(lines[0]).toMatchObject({
    xAxis: 500,
    lineStyle: { color: 'rgb(220, 38, 38)', type: 'dashed' },
    label: { formatter: 'SLO 500 ms', color: 'rgb(220, 38, 38)' },
  })
  // Its value reaches into the axis range, through the reference series' data.
  const data = await chart.evaluate((element) => {
    const box = element as BoxplotElement
    return box.projectData(box.frame, box.buildContext())
  })
  expect(data[1]).toEqual([[500, 0]])

  // The box lies along the value axis.
  const { box, median } = parts(await drawn(page, 0, 3))
  expect(box.shape).toEqual({ x: 48, y: 330, width: 36, height: 40 })
  expect(median.shape).toEqual({ x1: 62, y1: 330, x2: 62, y2: 370 })
})

test('keyboard: arrows walk the categories and the series, each box is announced; Enter highlights, Escape clears', async ({ page }) => {
  await open(page, 'grouped')
  const chart = page.locator('c2-boxplot-chart')
  await expect(chart).toHaveState('ready')
  const live = chart.locator('.boxplot-a11y[aria-live]')
  const plot = chart.locator('[part="plot"]')
  await plot.focus()
  await page.keyboard.press('ArrowRight')
  await expect(live).toHaveText('api-gateway, us-east: median 89 ms, quartiles 71 to 121 ms, whiskers 38 to 166 ms, 2 outliers')
  await expect(chart.locator('[part="tooltip"] .tooltip-title')).toHaveText('api-gateway, us-east')
  await expect(chart.locator('.boxplot-backdrop')).toBeVisible()
  await page.keyboard.press('ArrowDown')
  await expect(live).toContainText('api-gateway, eu-west: median')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  // The series is kept across categories.
  await expect(live).toContainText('checkout, eu-west: median 365 ms')
  await page.keyboard.press('ArrowUp')
  await expect(live).toHaveText('checkout, us-east: median 310 ms, quartiles 240 to 420 ms, whiskers 150 to 680 ms, 4 outliers')
  await page.keyboard.press('End')
  await expect(live).toContainText('inventory, us-east')
  await page.keyboard.press('Home')
  await expect(live).toContainText('api-gateway, us-east')
  await page.keyboard.press('Enter')
  await expect.poll(() => chart.evaluate((element) => (element as BoxplotElement).highlighted)).toBe('east')
  await page.keyboard.press('Escape')
  await expect.poll(() => chart.evaluate((element) => (element as BoxplotElement).highlighted)).toBeNull()
  await expect(chart.locator('[part="tooltip"]')).toBeHidden()
  await expect(live).toHaveText('')
})

test('keyboard: horizontal swaps the arrows; a single series reads without a series name', async ({ page }) => {
  await open(page, 'horizontal')
  const chart = page.locator('c2-boxplot-chart')
  await expect(chart).toHaveState('ready')
  const live = chart.locator('.boxplot-a11y[aria-live]')
  await chart.locator('[part="plot"]').focus()
  await page.keyboard.press('ArrowDown')
  await expect(live).toContainText('api-gateway: median')
  await page.keyboard.press('ArrowDown')
  await expect(live).toHaveText('auth: median 46 ms, quartiles 39 to 59 ms, whiskers 22 to 86 ms, 1 outlier')
  await page.keyboard.press('ArrowRight')
  await expect(live).toContainText('auth: median')
  await page.keyboard.press('ArrowUp')
  await expect(live).toContainText('api-gateway: median')
  // Leaving the plot clears the focus.
  await page.keyboard.press('Tab')
  await expect(live).toHaveText('')
})

test('whiskers="range" with mean="show": no outliers, a diamond at the mean, the mean in the tooltip; series inferred from arrays', async ({ page }) => {
  await open(page, 'scores')
  const chart = page.locator('c2-boxplot-chart')
  await expect(chart).toHaveState('ready')
  const boxes = await chart.evaluate((element) => (element as BoxplotElement).boxes)
  expect(boxes[1]).toMatchObject({ min: 40, max: 99, outliers: [] })
  expect(boxes[1].mean).toBeCloseTo(69.7)
  const { mean } = parts(await drawn(page, 0, 1))
  expect(mean.type).toBe('polygon')
  await page.evaluate(() => window.boxplotScenario.hover({ index: 1, seriesIndex: 0, px: 100, py: 100 }))
  await expect(chart.locator('[part="tooltip"]')).toContainText(/Mean\s*69\.7/)
  await expect(chart.locator('[part="plot"]')).toHaveAttribute('aria-label', 'Box plot of Score, 2 categories')

  // Regression: the series are inferred from every row, so a field missing from the first is still found.
  const fields = await chart.evaluate(async (element) => {
    const box = element as BoxplotElement & { resolvedSeries: { field: string; label?: string }[] }
    box.data = [
      { class: 'A', score: null, note: 'x' },
      { class: 'B', score: [1, 2, 3], retake: [4, 5, 6] },
    ]
    await box.updateComplete
    return box.resolvedSeries.map((series) => [series.field, series.label])
  })
  expect(fields).toEqual([
    ['score', 'Score'],
    ['retake', 'Retake'],
  ])
})

test('outliers="none" leaves the points out but still counts them', async ({ page }) => {
  await open(page)
  const chart = page.locator('c2-boxplot-chart')
  await expect(chart).toHaveState('ready')
  await chart.evaluate(async (element) => {
    const box = element as BoxplotElement
    box.outliers = 'none'
    await box.updateComplete
  })
  const [items] = await chart.evaluate((element) => {
    const box = element as BoxplotElement
    return box.projectData(box.frame, box.buildContext())
  })
  expect(items).toHaveLength(6)
  await page.evaluate(() => window.boxplotScenario.hover({ index: 3, seriesIndex: 0, px: 300, py: 120 }))
  await expect(chart.locator('[part="tooltip"]')).toContainText(/Outliers\s*4, up to 1,320 ms/)
})

test('no rows, or rows with no value, show the empty state; data arriving later draws', async ({ page }) => {
  await open(page, 'empty')
  const chart = page.locator('c2-boxplot-chart')
  await expect(chart.locator('[part="state"]')).toHaveText('No data')
  await chart.evaluate(async (element) => {
    const box = element as BoxplotElement
    box.data = [{ service: 'a', latency: null }, { service: 'b' }]
    await box.updateComplete
  })
  await expect(chart.locator('[part="state"]')).toHaveText('No data')
  await expect(chart.locator('table.boxplot-a11y')).toHaveCount(0)
  await chart.evaluate(async (element) => {
    const box = element as BoxplotElement
    box.data = [{ service: 'a', latency: [1, 2, 3, 4, 5] }]
    await box.updateComplete
  })
  await expect(chart).toHaveState('ready')
  await expect(chart.locator('[part="state"]')).toHaveCount(0)
  await expect(chart.locator('table.boxplot-a11y tbody tr')).toHaveCount(1)
})

test('new data with other categories redraws the axis, the boxes and the table', async ({ page }) => {
  await open(page)
  const chart = page.locator('c2-boxplot-chart')
  await expect(chart).toHaveState('ready')
  await chart.evaluate(async (element) => {
    const box = element as BoxplotElement
    box.data = [
      { service: 'x', latency: [1, 2, 3] },
      { service: 'y', latency: [4, 5, 6] },
    ]
    await box.updateComplete
  })
  expect((await options(page)).xAxis.data).toEqual(['x', 'y'])
  await expect(chart.locator('table.boxplot-a11y tbody tr')).toHaveCount(2)
  await expect(chart.locator('[part="plot"]')).toHaveAttribute('aria-label', 'Box plot of p50 latency, 2 categories')
})

test('the boxes grow from the median on first draw, and appear still under reduced motion', async ({ page }) => {
  await open(page)
  const chart = page.locator('c2-boxplot-chart')
  await expect(chart).toHaveState('ready')
  expect((await options(page)).animation).toBe(true)
  const group = await drawn(page, 0, 3)
  // The resting scale is stated, so an update landing mid-entry settles the box at full size.
  expect(group).toMatchObject({ type: 'group', originY: 238, scaleX: 1, scaleY: 1, enterFrom: { scaleY: 0 } })

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await open(page)
  await expect(page.locator('c2-boxplot-chart')).toHaveState('ready')
  expect((await options(page)).animation).toBe(false)
})

test('theming: the box width, tint, outline, median and outlier size come from the variables', async ({ page }) => {
  await open(page)
  const chart = page.locator('c2-boxplot-chart')
  await expect(chart).toHaveState('ready')
  await chart.evaluate((element) => {
    element.style.setProperty('--c2-chart__box--width', '20px')
    element.style.setProperty('--c2-chart__box--fill-opacity', '0.5')
    element.style.setProperty('--c2-chart__box--border-width', '2px')
    element.style.setProperty('--c2-chart__median--width', '4px')
    element.style.setProperty('--c2-chart__outlier--radius', '5px')
    element.style.setProperty('--c2-chart__series-1--color', '#000000')
  })
  // The palette is read through the theme probes, which a style change on the host invalidates on the next build.
  await page.evaluate(() => window.dispatchEvent(new Event('c2n-theme-change')))
  const { box, median } = parts(await drawn(page, 0, 3))
  expect(box.shape?.width).toBe(20)
  expect(box.style).toMatchObject({ fill: 'rgb(128, 128, 128)', stroke: 'rgb(0, 0, 0)', lineWidth: 2 })
  expect(median.style?.lineWidth).toBe(4)
  expect(await drawn(page, 0, 12)).toMatchObject({ shape: { r: 5 } })
  // A percentage is a share of the band, capped so neighbouring boxes keep a gap.
  await chart.evaluate((element) => element.style.setProperty('--c2-chart__box--width', '95%'))
  expect(parts(await drawn(page, 0, 3)).box.shape?.width).toBe(60)

  // Regression: a length in rem or em is resolved to pixels, not read as a bare number.
  await page.evaluate(() => (document.documentElement.style.fontSize = '10px'))
  await chart.evaluate((element) => {
    element.style.fontSize = '20px'
    element.style.setProperty('--c2-chart__box--width', '3rem')
    element.style.setProperty('--c2-chart__box--border-width', '0.2rem')
    element.style.setProperty('--c2-chart__median--width', '0.25em')
    element.style.setProperty('--c2-chart__outlier--radius', 'calc(0.5rem + 1px)')
  })
  const resolved = parts(await drawn(page, 0, 3))
  expect(resolved.box.shape?.width).toBe(30)
  expect(resolved.box.style?.lineWidth).toBe(2)
  expect(resolved.median.style?.lineWidth).toBe(5)
  expect(await drawn(page, 0, 12)).toMatchObject({ shape: { r: 6 } })
})
