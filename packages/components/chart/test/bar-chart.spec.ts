import type { Locator } from '@playwright/test'
import { test, expect } from './fixture'

/** Canvas-pixel bounding box of one colour, and the box of each separate column (vertical) or row (horizontal) of it. */
interface Paint {
  count: number
  left: number
  right: number
  top: number
  bottom: number
  /** One `[start, end]` run per bar along the category axis, in canvas pixels. */
  runs: { start: number; end: number; low: number; high: number }[]
}

/**
 * Reads where the pure blue (first series) and pure red (second series) bars were painted. Bars are opaque and
 * the scenario turns the entry animation off, so the canvas is final once the chart reports ready.
 */
async function paint(chart: Locator, along: 'x' | 'y'): Promise<{ blue: Paint; red: Paint; dpr: number }> {
  return chart.evaluate((element, axis) => {
    const canvas = element.shadowRoot?.querySelector('canvas') as HTMLCanvasElement
    const context = canvas.getContext('2d')!
    const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height)
    const measure = (match: (r: number, g: number, b: number) => boolean) => {
      const box = { count: 0, left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity }
      const hits = new Map<number, { low: number; high: number }>()
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const offset = (y * width + x) * 4
          if (!match(data[offset], data[offset + 1], data[offset + 2])) continue
          box.count += 1
          box.left = Math.min(box.left, x)
          box.right = Math.max(box.right, x)
          box.top = Math.min(box.top, y)
          box.bottom = Math.max(box.bottom, y)
          const key = axis === 'x' ? x : y
          const across = axis === 'x' ? y : x
          const hit = hits.get(key)
          if (hit) {
            hit.low = Math.min(hit.low, across)
            hit.high = Math.max(hit.high, across)
          } else hits.set(key, { low: across, high: across })
        }
      }
      // Consecutive lines along the category axis belong to the same bar.
      const runs: Paint['runs'] = []
      for (const key of [...hits.keys()].sort((a, b) => a - b)) {
        const hit = hits.get(key)!
        const last = runs[runs.length - 1]
        if (last && key === last.end + 1) {
          last.end = key
          last.low = Math.min(last.low, hit.low)
          last.high = Math.max(last.high, hit.high)
        } else runs.push({ start: key, end: key, low: hit.low, high: hit.high })
      }
      return { ...box, runs }
    }
    return {
      blue: measure((r, g, b) => r < 40 && g < 40 && b > 215),
      red: measure((r, g, b) => r > 215 && g < 40 && b < 40),
      dpr: devicePixelRatio,
    }
  }, along)
}

async function ready(chart: Locator) {
  await expect(chart).toHaveAttribute('data-chart-ready', 'true')
}

test('stacks series into one bar per band, the second starting where the first ends', async ({ page, scenario }) => {
  await scenario('stacked-bars')
  const chart = page.locator('c2-bar-chart')
  await ready(chart)

  const { blue, red } = await paint(chart, 'x')
  expect(blue.runs).toHaveLength(3)
  expect(red.runs).toHaveLength(3)
  for (let band = 0; band < 3; band += 1) {
    // Same column, not side by side.
    expect(Math.abs(red.runs[band].start - blue.runs[band].start)).toBeLessThanOrEqual(1)
    expect(Math.abs(red.runs[band].end - blue.runs[band].end)).toBeLessThanOrEqual(1)
    // Red sits on top of blue: its bottom edge is blue's top edge (screen y grows downwards).
    expect(Math.abs(red.runs[band].high + 1 - blue.runs[band].low)).toBeLessThanOrEqual(2)
  }
  // The scale covers the whole stack: Q2's 25 + 90 is the tallest bar and still fits in the plot.
  expect(red.top).toBeGreaterThan(0)
})

test('re-stacks the remaining series when one is hidden', async ({ page, scenario }) => {
  await scenario('stacked-bars')
  const chart = page.locator('c2-bar-chart')
  await ready(chart)
  const before = await paint(chart, 'x')

  await chart.evaluate((element) => (element as unknown as { setSeriesVisible(index: number, visible: boolean): void }).setSeriesVisible(0, false))
  await expect.poll(async () => (await paint(chart, 'x')).blue.count).toBe(0)
  const after = await paint(chart, 'x')

  // With the bottom series gone, the top one drops onto the baseline the bottom one used to stand on.
  expect(Math.abs(after.red.bottom - before.blue.bottom)).toBeLessThanOrEqual(2)
})

test('percent stacking makes every band the same height', async ({ page, scenario }) => {
  await scenario('percent-bars')
  const chart = page.locator('c2-bar-chart')
  await ready(chart)

  const { blue, red } = await paint(chart, 'x')
  expect(red.runs).toHaveLength(3)
  const tops = red.runs.map((run) => run.low)
  const bottoms = blue.runs.map((run) => run.high)
  expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(1)
  expect(Math.max(...bottoms) - Math.min(...bottoms)).toBeLessThanOrEqual(1)
  // Q1 is 20 / 100, Q2 25 / 115: the blue shares differ even though the bars are equal.
  const heights = blue.runs.map((run) => run.high - run.low)
  expect(heights[0]).not.toBe(heights[1])
})

test('horizontal bars run rightwards from the left, first category at the top', async ({ page, scenario }) => {
  await scenario('horizontal-bars')
  const chart = page.locator('c2-bar-chart')
  await ready(chart)

  const { blue, red } = await paint(chart, 'y')
  expect(blue.runs).toHaveLength(3)
  for (let band = 0; band < 3; band += 1) {
    // Each band is a row: blue starts at the baseline, red continues from where blue ends.
    expect(Math.abs(red.runs[band].start - blue.runs[band].start)).toBeLessThanOrEqual(1)
    expect(Math.abs(red.runs[band].low - (blue.runs[band].high + 1))).toBeLessThanOrEqual(2)
    expect(blue.runs[band].high - blue.runs[band].low).toBeGreaterThan(blue.runs[band].end - blue.runs[band].start)
  }
  // The value axis starts at zero, so a bar's length is proportional to its total: Q1 is 100, Q3 is 85. A scale
  // auto-ranged like an x axis would start mid-way and exaggerate the difference.
  const baseline = blue.runs[0].low
  const ratio = (red.runs[2].high - baseline) / (red.runs[0].high - baseline)
  expect(ratio).toBeGreaterThan(0.82)
  expect(ratio).toBeLessThan(0.88)

  // Q3 (15 + 70) is the shortest, Q2 (25 + 90) the longest; Q1 comes first, at the top.
  const lengths = red.runs.map((run) => run.high)
  expect(lengths[1]).toBeGreaterThan(lengths[0])
  expect(lengths[0]).toBeGreaterThan(lengths[2])
})

test('horizontal grouped bars sit one above the other within a band', async ({ page, scenario }) => {
  await scenario('horizontal-grouped-bars')
  const chart = page.locator('c2-bar-chart')
  await ready(chart)

  const { blue, red } = await paint(chart, 'y')
  expect(blue.runs).toHaveLength(3)
  expect(red.runs).toHaveLength(3)
  for (let band = 0; band < 3; band += 1) {
    expect(red.runs[band].start).toBeGreaterThan(blue.runs[band].end)
    expect(Math.abs(red.runs[band].low - blue.runs[band].low)).toBeLessThanOrEqual(1)
  }
})

test('the hover reports the stacked segment under the pointer', async ({ page, scenario }) => {
  await scenario('stacked-bars')
  const chart = page.locator('c2-bar-chart')
  await ready(chart)
  const { blue, red, dpr } = await paint(chart, 'x')

  await chart.evaluate((element) => {
    ;(window as unknown as { hovered: number[] }).hovered = []
    element.addEventListener('point-hover', (event) => {
      const detail = (event as CustomEvent<{ seriesIndex: number } | null>).detail
      if (detail) (window as unknown as { hovered: number[] }).hovered.push(detail.seriesIndex)
    })
  })
  const canvas = await chart.evaluate((element) => {
    const rect = element.shadowRoot!.querySelector('canvas')!.getBoundingClientRect()
    return { left: rect.left, top: rect.top }
  })
  const at = async (run: Paint['runs'][number]) => {
    await page.mouse.move(canvas.left + (run.start + run.end) / 2 / dpr, canvas.top + (run.low + run.high) / 2 / dpr)
    return page.evaluate(() => {
      const hovered = (window as unknown as { hovered: number[] }).hovered
      return hovered[hovered.length - 1]
    })
  }

  await expect.poll(() => at(red.runs[1])).toBe(1)
  await expect.poll(() => at(blue.runs[1])).toBe(0)
})

test('value labels print each bar value, inside a stacked segment and past a grouped bar', async ({ page, scenario }) => {
  // The labels are canvas text, so the only way to read them is to watch what the chart asks the canvas to draw.
  await page.addInitScript(() => {
    const drawn: string[] = []
    ;(window as unknown as { drawn: string[] }).drawn = drawn
    const fillText = CanvasRenderingContext2D.prototype.fillText
    CanvasRenderingContext2D.prototype.fillText = function (text: string, x: number, y: number, maxWidth?: number) {
      drawn.push(text)
      return maxWidth === undefined ? fillText.call(this, text, x, y) : fillText.call(this, text, x, y, maxWidth)
    }
  })

  await scenario('labelled-bars')
  await ready(page.locator('c2-bar-chart'))
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { drawn: string[] }).drawn))
    .toEqual(expect.arrayContaining(['20', '25', '15', '80', '90', '70']))

  await scenario('labelled-stacked-bars')
  const chart = page.locator('c2-bar-chart')
  await ready(chart)
  await expect.poll(() => page.evaluate(() => (window as unknown as { drawn: string[] }).drawn)).toEqual(expect.arrayContaining(['80', '90', '70']))

  // A formatter replaces the text, and is handed the series' own value rather than the stacked total.
  await chart.evaluate((element) => {
    ;(window as unknown as { drawn: string[] }).drawn.length = 0
    ;(element as unknown as { formatLabel: (value: number) => string }).formatLabel = (value) => `${value} pts`
  })
  await expect.poll(() => page.evaluate(() => (window as unknown as { drawn: string[] }).drawn)).toEqual(expect.arrayContaining(['90 pts']))
})

test('names every band on the category axis', async ({ page, scenario }) => {
  await scenario('stacked-bars')
  const chart = page.locator('c2-bar-chart')
  await ready(chart)
  // The tick labels are canvas text: watch what the chart hands uPlot for them.
  const labels = await chart.evaluate(async (element) => {
    const chartEl = element as unknown as { formatAxisX(value: number): string; barWidth: number; updateComplete: Promise<boolean> }
    const seen: unknown[] = []
    const original = chartEl.formatAxisX.bind(chartEl)
    chartEl.formatAxisX = (value) => {
      const label = original(value)
      seen.push(label)
      return label
    }
    chartEl.barWidth = 0.5
    await chartEl.updateComplete
    await new Promise((resolve) => setTimeout(resolve, 300))
    return seen
  })
  expect(labels).toEqual(expect.arrayContaining(['Q1', 'Q2', 'Q3']))
  expect(labels).not.toContain('')
})
