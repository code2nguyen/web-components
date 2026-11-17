import AxeBuilder from '@axe-core/playwright'
import type { Locator, Page } from '@playwright/test'
import { expect } from '../../../../tests/component-fixture'
import { test } from '../../../../tests/fixture'
// Pulls in the `window.histogramScenario` declaration the scenario page installs.
import './histogram-scenario-api'

type Bin = { from: number; to: number; counts: number[] }
interface HistogramElement extends HTMLElement {
  bins: Bin[]
  data: unknown
  binWidth: number
  binCount: number
  binStart?: number
  binEnd?: number
  overlay: string
  percentiles?: number[]
}

async function open(page: Page, scenario = 'latency'): Promise<Locator> {
  await page.goto(`/packages/components/chart/test/histogram-scenarios.html?scenario=${scenario}`)
  await expect(page.locator('main')).toHaveAttribute('data-ready', 'true')
  return page.locator('c2-histogram-chart')
}

/** The columns of the canvas holding a pure colour, grouped into runs of neighbouring columns: one run per drawn bar. */
async function runs(chart: Locator, match: 'blue' | 'red' | 'green' | 'magenta'): Promise<{ start: number; end: number; top: number }[]> {
  return chart.evaluate((element, colour) => {
    const canvas = element.shadowRoot?.querySelector('canvas') as HTMLCanvasElement
    const { data, width, height } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height)
    const test = {
      blue: (r: number, g: number, b: number) => r < 40 && g < 40 && b > 215,
      red: (r: number, g: number, b: number) => r > 215 && g < 40 && b < 40,
      green: (r: number, g: number, b: number) => r < 60 && g > 200 && b < 60,
      magenta: (r: number, g: number, b: number) => r > 200 && g < 60 && b > 200,
    }[colour]
    const tops = new Map<number, number>()
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4
        if (test(data[offset], data[offset + 1], data[offset + 2]) && !tops.has(x)) tops.set(x, y)
      }
    }
    const found: { start: number; end: number; top: number }[] = []
    for (const x of [...tops.keys()].sort((a, b) => a - b)) {
      const last = found[found.length - 1]
      if (last && x === last.end + 1) {
        last.end = x
        last.top = Math.min(last.top, tops.get(x)!)
      } else found.push({ start: x, end: x, top: tops.get(x)! })
    }
    return found
  }, match)
}

test.describe('binning', () => {
  test('follows Sturges on a nice width, includes the top edge, and counts edge samples in the upper bin', async ({ page }) => {
    await open(page)
    const result = await page.evaluate(() => {
      const { binHistogram, niceStep } = window.histogramScenario.bins
      const model = binHistogram([[3.2, 12, 20, 20, 39, 40, 97]])
      const tidy = binHistogram([[0.1, 0.2, 0.3, 0.3, 0.4]], { width: 0.1 })
      return {
        edges: model.edges,
        counts: model.bins.map((bin) => bin.counts[0]),
        tidy: tidy.bins.map((bin) => [bin.from, bin.counts[0]]),
        steps: [niceStep(97, 4), niceStep(10, 4), niceStep(0, 4), niceStep(0.9, 9)],
      }
    })
    // 7 samples: ceil(log2 7) + 1 = 4 bins wanted, 97 / 4 rounds up to a step of 25.
    expect(result.edges).toEqual([0, 25, 50, 75, 100])
    expect(result.counts).toEqual([4, 2, 0, 1])
    // (0.3 - 0.1) / 0.1 is 1.999…; 0.3 still lands in the bin that starts at 0.3, and the last bin includes 0.4.
    expect(result.tidy).toEqual([
      [0.1, 1],
      [0.2, 1],
      [0.3, 3],
    ])
    expect(result.steps).toEqual([25, 2.5, 1, 0.1])
  })

  test('shares bins across series, honours an explicit range and caps a tiny width', async ({ page }) => {
    await open(page)
    const result = await page.evaluate(() => {
      const { binHistogram, histogramPercentile } = window.histogramScenario.bins
      const shared = binHistogram(
        [
          [1, 2, 3],
          [8, 9],
        ],
        { width: 5 },
      )
      const clipped = binHistogram([[-5, 0, 4, 10, 11, 30]], { start: 0, end: 10, width: 5 })
      const capped = binHistogram([[0, 1e6]], { width: 0.001 })
      const one = binHistogram([[5, 5, 5]])
      return {
        shared: shared.bins.map((bin) => [bin.from, ...bin.counts]),
        clipped: [clipped.edges, clipped.binned, clipped.bins.map((bin) => bin.counts[0])],
        capped: capped.bins.length,
        one: [one.edges, one.bins[0].counts[0]],
        empty: binHistogram([[], []]).bins.length,
        median: histogramPercentile(shared, 0, 50),
        p90: histogramPercentile(binHistogram([[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]]), 0, 90),
        none: histogramPercentile(binHistogram([[]]), 0, 50),
      }
    })
    expect(result.shared).toEqual([
      [0, 3, 0],
      [5, 0, 2],
    ])
    // 10 sits on the closing edge and counts; -5, 11 and 30 are outside.
    expect(result.clipped).toEqual([[0, 5, 10], [3], [2, 1]])
    expect(result.capped).toBeLessThanOrEqual(1000)
    expect(result.one).toEqual([[5, 6], 3])
    expect(result.empty).toBe(0)
    expect(result.median).toBe(2)
    // R-7: rank 0.9 × 9 = 8.1, between 9 and 10.
    expect(result.p90).toBeCloseTo(9.1)
    expect(result.none).toBeNaN()
  })

  test('the density integrates to the binned count and the cumulative share ends at 100', async ({ page }) => {
    await open(page)
    const result = await page.evaluate(async () => {
      const { binHistogram } = window.histogramScenario.bins
      const { histogramDensity, histogramCumulative } = await window.histogramScenario.overlay()
      const samples = Array.from({ length: 400 }, (_value, index) => 50 + 10 * Math.sin(index) + (index % 17))
      const model = binHistogram([samples], { start: 0, end: 120, width: 10 })
      const curve = histogramDensity(model, 0)
      let area = 0
      for (let index = 1; index < curve.length; index += 1) area += ((curve[index][1] + curve[index - 1][1]) / 2) * (curve[index][0] - curve[index - 1][0])
      return { area: area / model.step, cumulative: histogramCumulative(model, 0), flat: histogramDensity(binHistogram([[4, 4, 4]]), 0) }
    })
    // Counts per bin width, integrated over x and divided by the width, is the number of samples.
    expect(result.area).toBeGreaterThan(390)
    expect(result.area).toBeLessThan(410)
    expect(result.cumulative[0]).toBe(0)
    expect(result.cumulative.at(-1)).toBe(100)
    expect(result.flat).toEqual([])
  })
})

test('draws one touching bar per non-empty bin, with ticks on the bin edges', async ({ page }) => {
  const chart = await open(page)
  await expect(chart).toHaveState('ready')
  const bins = await chart.evaluate((element) => (element as HistogramElement).bins)
  expect(bins.length).toBeGreaterThan(4)
  expect(bins.every((bin) => bin.to - bin.from === 50 && bin.from % 50 === 0)).toBe(true)
  expect(bins.reduce((sum, bin) => sum + bin.counts[0], 0)).toBe(200)

  const drawn = await runs(chart, 'blue')
  // Bars that hold samples, side by side: the gap between neighbours is the 1px stroke at most a few pixels wide.
  expect(drawn.length).toBe(bins.filter((bin) => bin.counts[0] > 0).length)
  for (let index = 1; index < drawn.length; index += 1) expect(drawn[index].start - drawn[index - 1].end).toBeLessThanOrEqual(4)

  // The tallest bin draws the tallest bar.
  const tallest = bins.reduce((best, bin, index) => (bin.counts[0] > bins[best].counts[0] ? index : best), 0)
  const firstFilled = bins.findIndex((bin) => bin.counts[0] > 0)
  const highest = drawn.reduce((best, run, index) => (run.top < drawn[best].top ? index : best), 0)
  expect(highest).toBe(tallest - firstFilled)
})

test('names each bin by its range in the tooltip, the events and the hidden table', async ({ page }) => {
  const chart = await open(page)
  await expect(chart).toHaveState('ready')
  const bins = await chart.evaluate((element) => (element as HistogramElement).bins)
  const index = bins.findIndex((bin) => bin.from === 300)

  await page.evaluate((at) => window.histogramScenario.hover({ index: at, seriesIndex: 0, px: 200, py: 100 }), index)
  const tooltip = await page.evaluate(
    () =>
      [...window.histogramScenario.events].reverse().find((event) => event.type === 'tooltip-change' && event.detail)?.detail as {
        formattedX: string
        bin: Bin
        entries: { formatted: string }[]
      },
  )
  expect(tooltip.formattedX).toBe('300 to 350')
  expect(tooltip.bin).toEqual(bins[index])
  expect(tooltip.entries[0].formatted).toBe(String(bins[index].counts[0]))
  const point = await page.evaluate(
    () => [...window.histogramScenario.events].reverse().find((event) => event.type === 'point-hover' && event.detail)?.detail as { label: string; y: number },
  )
  expect(point).toMatchObject({ label: '300 to 350', y: bins[index].counts[0] })

  const table = chart.locator('.a11y-table')
  await expect(table.locator('thead th').first()).toHaveText('Bin')
  await expect(table.locator('tbody th').nth(index)).toHaveText('300 to 350')
  await expect(table.locator('caption')).toHaveText(`Histogram of Latency, ${bins.length} bins`)
  // One series needs no legend.
  await expect(chart.locator('.legend-item')).toHaveCount(0)
})

test('loads the overlay on demand: a density curve over the bars', async ({ page }) => {
  const chart = await open(page, 'density')
  await expect(chart).toHaveState('ready')
  await expect.poll(async () => (await runs(chart, 'green')).length).toBeGreaterThan(0)
  const green = await runs(chart, 'green')
  const blue = await runs(chart, 'blue')
  // The curve spans the bars, from the first to the last.
  expect(green[0].start).toBeLessThanOrEqual(blue[0].start + 20)
  expect(green.at(-1)!.end).toBeGreaterThanOrEqual(blue.at(-1)!.end - 20)
  await expect(chart.locator('.a11y-table caption')).toContainText('with a density curve')
})

test('draws the cumulative share against its own 0–100% axis', async ({ page }) => {
  const chart = await open(page, 'cumulative')
  await expect(chart).toHaveState('ready')
  await expect.poll(async () => (await runs(chart, 'green')).length).toBeGreaterThan(0)
  const axes = await chart.evaluate((element) => element.shadowRoot!.querySelectorAll('.u-axis').length)
  expect(axes).toBe(3)
  // The line climbs: it ends higher on the canvas than it starts.
  const ends = await chart.evaluate((element) => {
    const canvas = element.shadowRoot?.querySelector('canvas') as HTMLCanvasElement
    const { data, width, height } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height)
    const points: [number, number][] = []
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4
        if (data[offset] < 60 && data[offset + 1] > 200 && data[offset + 2] < 60) points.push([x, y])
      }
    }
    points.sort((a, b) => a[0] - b[0])
    return { first: points[0][1], last: points[points.length - 1][1] }
  })
  expect(ends.last).toBeLessThan(ends.first)
  await expect(chart.locator('.a11y-table caption')).toContainText('with a cumulative share line')
})

test('marks percentiles with labelled rules and names them in the summary', async ({ page }) => {
  const chart = await open(page, 'percentiles')
  await expect(chart).toHaveState('ready')
  await expect.poll(async () => (await runs(chart, 'magenta')).length).toBeGreaterThanOrEqual(2)
  const values = await page.evaluate(() => {
    const element = document.querySelector('c2-histogram-chart') as HistogramElement
    const { binHistogram, histogramPercentile } = window.histogramScenario.bins
    const samples = element.data as number[]
    const model = binHistogram([samples])
    return [histogramPercentile(model, 0, 50), histogramPercentile(model, 0, 90)]
  })
  const caption = chart.locator('.a11y-table caption')
  await expect(caption).toContainText(`Latency: p50 ${values[0]}, p90 ${new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format(values[1])}`)
  // The p50 rule sits left of the p90 one.
  const marks = await runs(chart, 'magenta')
  expect(marks[0].start).toBeLessThan(marks.at(-1)!.start)
})

test('several series share the bins, grouped with a legend or stacked', async ({ page }) => {
  let chart = await open(page, 'grouped')
  await expect(chart).toHaveState('ready')
  const bins = await chart.evaluate((element) => (element as HistogramElement).bins)
  expect(bins.every((bin) => bin.counts.length === 2)).toBe(true)
  expect(bins.reduce((sum, bin) => sum + bin.counts[1], 0)).toBe(200)
  const blue = await runs(chart, 'blue')
  const red = await runs(chart, 'red')
  // Side by side: the west series sits right of the east one, shifted by its 80 ms.
  expect(red[0].start).toBeGreaterThan(blue[0].start)
  await expect(chart.locator('.legend')).toContainText('us-east')

  chart = await open(page, 'stacked')
  await expect(chart).toHaveState('ready')
  expect(await chart.evaluate((element) => (element as HistogramElement).bins.every((bin) => bin.counts.length === 2))).toBe(true)
  const stackedBlue = await runs(chart, 'blue')
  const stackedRed = await runs(chart, 'red')
  // Stacked: a bin holding both series draws them in the same columns.
  const shared = stackedRed.find((run) => stackedBlue.some((other) => Math.abs(other.start - run.start) <= 2))
  expect(shared).toBeDefined()
})

test('reads one sample per row, skipping what is not a number', async ({ page }) => {
  const chart = await open(page, 'long')
  await expect(chart).toHaveState('ready')
  const bins = await chart.evaluate((element) => (element as HistogramElement).bins.map((bin) => [bin.from, bin.counts[0]]))
  expect(bins).toEqual([
    [60, 1],
    [80, 1],
    [100, 1],
    [120, 2],
  ])
})

test('re-bins when the bin attributes change', async ({ page }) => {
  const chart = await open(page)
  await expect(chart).toHaveState('ready')
  await chart.evaluate((element) => element.setAttribute('bin-width', '100'))
  await expect.poll(() => chart.evaluate((element) => (element as HistogramElement).bins.every((bin) => bin.to - bin.from === 100))).toBe(true)
  await chart.evaluate((element) => {
    element.removeAttribute('bin-width')
    element.setAttribute('bin-count', '4')
    element.setAttribute('bin-start', '200')
    element.setAttribute('bin-end', '400')
  })
  await expect
    .poll(() => chart.evaluate((element) => (element as HistogramElement).bins.map((bin) => [bin.from, bin.to])))
    .toEqual([
      [200, 250],
      [250, 300],
      [300, 350],
      [350, 400],
    ])
  await expect.poll(async () => (await runs(chart, 'blue')).length).toBe(4)
})

test('a data source supplies the samples and each pushed point adds one', async ({ page }) => {
  const chart = await open(page, 'source')
  await expect(chart).toHaveState('ready')
  await expect.poll(() => chart.evaluate((element) => (element as HistogramElement).bins.map((bin) => bin.counts[0]))).toEqual([2, 2, 1])
  await page.evaluate(() => {
    const push = (window as unknown as { push: (value: number) => void }).push
    push(150)
    push(450)
  })
  await expect
    .poll(() => chart.evaluate((element) => (element as HistogramElement).bins.map((bin) => [bin.from, bin.counts[0]])))
    .toEqual([
      [100, 3],
      [200, 2],
      [300, 1],
      [400, 1],
    ])
  // New data replaces the pushed samples too.
  await chart.evaluate((element) => ((element as HistogramElement).data = [10, 20]))
  await expect.poll(() => chart.evaluate((element) => (element as HistogramElement).bins.map((bin) => bin.counts[0]).reduce((a, b) => a + b, 0))).toBe(2)
})

test('shows the empty state without samples', async ({ page }) => {
  const chart = await open(page, 'empty')
  await expect(chart.locator('[part="state"]')).toHaveText('No data')
})

test('follows the nearest lang: the bins and the summary in French', async ({ page }) => {
  const chart = await open(page, 'french')
  await expect(chart).toHaveState('ready')
  const table = chart.locator('.a11y-table')
  await expect(table.locator('thead th').first()).toHaveText('Classe')
  await expect(table.locator('tbody th').first()).toContainText(/^de .+ à .+$/)
  await expect(table.locator('caption')).toContainText(/Histogramme de Latency, \d+ classes\. Latency : p50 : \d+/)
})

test('lays the bins up the left edge when horizontal', async ({ page }) => {
  const chart = await open(page, 'horizontal')
  await expect(chart).toHaveState('ready')
  const extents = await chart.evaluate((element) => {
    const canvas = element.shadowRoot?.querySelector('canvas') as HTMLCanvasElement
    const { data, width, height } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height)
    let rows = 0
    let columns = 0
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4
        if (data[offset] < 40 && data[offset + 1] < 40 && data[offset + 2] > 215) {
          rows = Math.max(rows, y)
          columns = Math.max(columns, x)
        }
      }
    }
    return { rows, columns }
  })
  expect(extents.rows).toBeGreaterThan(0)
  expect(extents.columns).toBeGreaterThan(0)
})

test('has no axe violations', async ({ page }) => {
  await open(page, 'percentiles')
  const results = await new AxeBuilder({ page }).include('c2-histogram-chart').analyze()
  expect(results.violations).toEqual([])
})
