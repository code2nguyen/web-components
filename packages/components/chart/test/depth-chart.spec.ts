import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect } from '../../../../tests/component-fixture'
import { test } from '../../../../tests/fixture'
// Pulls in the `window.depthScenario` declaration the scenario page installs.
import './depth-scenario-api'

async function open(page: Page, scenario = 'book'): Promise<void> {
  await page.goto(`/packages/components/chart/test/depth-scenarios.html?scenario=${scenario}`)
  await expect(page.locator('main')).toHaveAttribute('data-ready', 'true')
}

/** The members of the element the specs read; the engine view and its options are protected on the class. */
interface DepthInternals extends HTMLElement {
  bids: unknown
  asks: unknown
  range: number
  unit: string
  visibleRange: { min: number; max: number }
  updateComplete: Promise<boolean>
  projectData(): [number[], (number | null)[], (number | null)[]]
}

test('sorts, merges and sums each side outward from the best price', async ({ page }) => {
  await open(page)
  const book = await page.evaluate(() => {
    const { buildDepthBook } = window.depthScenario.model
    const result = buildDepthBook(
      [
        ['99.0', '1.50'],
        ['100.0', '2.00'],
        ['98.0', '4.00'],
        ['99.0', '0.50'],
        ['97.5', '0'],
        ['oops', '1'],
      ],
      [
        { price: 101, size: 1 },
        { price: '102', size: '3' },
      ],
    )
    return result
  })
  expect(book.bids.map((level) => [level.price, level.size, level.cumulative, level.notional])).toEqual([
    [100, 2, 2, 200],
    [99, 2, 4, 398],
    [98, 4, 8, 790],
  ])
  expect(book.asks.map((level) => [level.price, level.cumulative])).toEqual([
    [101, 1],
    [102, 4],
  ])
  expect([book.bestBid, book.bestAsk, book.mid, book.priceDecimals, book.sizeDecimals]).toEqual([100, 101, 100.5, 1, 2])
})

test('answers how deep a side is at a price and what a market order that far fills at', async ({ page }) => {
  await open(page)
  const result = await page.evaluate(() => {
    const { buildDepthBook, depthAt, depthReadout, mirrorReadout } = window.depthScenario.model
    const book = buildDepthBook(
      [
        [100, 2],
        [99, 2],
        [98, 4],
      ],
      [
        [101, 1],
        [102, 3],
      ],
    )
    const at = depthAt(book, 'bid', 98.5)
    return {
      // 98.5 reaches the 100 and 99 levels; above the best bid nothing is reached; past the last ask it is all of them.
      at: at?.cumulative,
      none: depthAt(book, 'bid', 100.2),
      allAsks: depthAt(book, 'ask', 500)?.cumulative,
      readout: at ? depthReadout(book, 'bid', 98.5, at) : undefined,
      mirror: mirrorReadout(book, 'bid', 99),
      override: buildDepthBook([[100, 1]], [[101, 1]], 100.2).mid,
      oneSided: buildDepthBook([[100, 1]], []).mid,
    }
  })
  expect(result.at).toBe(4)
  expect(result.none).toBeUndefined()
  expect(result.allAsks).toBe(4)
  expect(result.readout?.averagePrice).toBeCloseTo(99.5)
  expect(result.readout?.impact).toBeCloseTo((99.5 - 100.5) / 100.5)
  // 99 is 1.5 below the mid; 1.5 above it is 102, which reaches both ask levels.
  expect(result.mirror).toMatchObject({ side: 'ask', price: 102, cumulative: 4 })
  expect(result.override).toBe(100.2)
  expect(result.oneSided).toBe(100)
})

test('draws both sides out to the window edges, with the mid price at zero between them', async ({ page }) => {
  await open(page)
  const chart = page.locator('c2-depth-chart')
  await expect(chart).toHaveState('ready')
  const view = await chart.evaluate((element) => {
    const depth = element as DepthInternals
    const [x, bids, asks] = depth.projectData()
    return { x: Array.from(x), bids, asks, window: depth.visibleRange }
  })
  expect(view.window.min).toBeCloseTo(95.475)
  expect(view.window.max).toBeCloseTo(105.525)
  expect(view.x.map((value) => Math.round(value * 1000) / 1000)).toEqual([95.475, 98, 99, 100, 100.5, 101, 102, 103, 105.525])
  expect(view.bids).toEqual([8, 8, 4, 2, 0, null, null, null, null])
  expect(view.asks).toEqual([null, null, null, null, 0, 1, 4, 6.25, 6.25])
})

test('sums notional in the quote unit', async ({ page }) => {
  await open(page, 'quote')
  const chart = page.locator('c2-depth-chart')
  await expect(chart).toHaveState('ready')
  const asks = await chart.evaluate((element) => (element as DepthInternals).projectData()[2])
  expect(asks).toEqual([null, null, null, null, 0, 101, 407, 638.75, 638.75])
})

test('a new book redraws through setData without rebuilding the chart', async ({ page }) => {
  await open(page)
  const chart = page.locator('c2-depth-chart')
  await expect(chart).toHaveState('ready')
  const result = await chart.evaluate(async (element) => {
    const depth = element as DepthInternals
    const before = window.depthScenario.counts()
    depth.bids = [
      [100.2, 1],
      [99, 5],
    ]
    depth.asks = [[100.8, 2]]
    await depth.updateComplete
    await new Promise(requestAnimationFrame)
    const after = window.depthScenario.counts()
    const [x, bids] = depth.projectData()
    return { setData: after.setData - before.setData, setOptions: after.setOptions - before.setOptions, mid: x[bids.indexOf(0)] }
  })
  expect(result).toEqual({ setData: 1, setOptions: 0, mid: 100.5 })
})

test('hovering a level shows its readout and marks the same distance on the other side', async ({ page }) => {
  await open(page)
  const chart = page.locator('c2-depth-chart')
  await expect(chart).toHaveState('ready')
  // Index 2 is the 99.0 bid level.
  await page.evaluate(() => window.depthScenario.hover({ index: 2, seriesIndex: 0, px: 200, py: 200 }))
  const tooltip = chart.locator('.tooltip')
  await expect(tooltip).toContainText('Bid · 99.0')
  await expect(tooltip).toContainText('4.00 BTC')
  await expect(tooltip).toContainText('398 USD')
  await expect(tooltip).toContainText('99.5')
  await expect(tooltip).toContainText('-0.995%')
  await expect(tooltip).toContainText('Asks at same distance')
  const mirror = chart.locator('[part="mirror-marker"]')
  await expect(mirror).toBeVisible()
  const detail = await page.evaluate(() => window.depthScenario.events.filter((event) => event.type === 'tooltip-change').at(-1)?.detail)
  expect(detail).toMatchObject({ formattedX: '99.0', readout: { side: 'bid', cumulative: 4 }, mirror: { side: 'ask', price: 102, cumulative: 4 } })

  // The mid point between the sides describes the spread instead.
  await page.evaluate(() => window.depthScenario.hover({ index: 4, seriesIndex: 0, px: 300, py: 200 }))
  await expect(tooltip).toContainText('Spread')
  await expect(mirror).toBeHidden()
  await page.evaluate(() => window.depthScenario.hover(null))
  await expect(tooltip).toBeHidden()
})

test('a click fires price-select with the readout, and picks nothing between the sides', async ({ page }) => {
  await open(page)
  const chart = page.locator('c2-depth-chart')
  await expect(chart).toHaveState('ready')
  const selected = await page.evaluate(() => {
    const api = window.depthScenario
    api.hover({ index: 6, seriesIndex: 1, px: 400, py: 200 })
    api.click({ index: 6, seriesIndex: 1 })
    api.click({ index: 4, seriesIndex: 0 })
    return api.events.filter((event) => event.type === 'price-select').map((event) => event.detail)
  })
  expect(selected).toHaveLength(1)
  expect(selected[0]).toMatchObject({ price: 102, side: 'ask', cumulative: 4, notional: 407 })
  expect((selected[0] as { averagePrice: number }).averagePrice).toBeCloseTo(101.75)
})

test('the plot is one tab stop: arrows walk the levels, Enter picks one, plus and minus zoom', async ({ page }) => {
  await open(page)
  const chart = page.locator('c2-depth-chart')
  await expect(chart).toHaveState('ready')
  const plot = chart.locator('[part="plot"]')
  await plot.focus()
  await expect(plot).toHaveAttribute('aria-label', /Spread 1\.0\. Within 5% of the mid price: bids 8\.00 BTC, asks 6\.25 BTC/)
  await expect(plot).toHaveAttribute('aria-roledescription', 'depth chart')

  // From the mid, the first ArrowLeft lands on the best bid.
  await page.keyboard.press('ArrowLeft')
  await expect(chart.locator('.tooltip')).toContainText('Bid · 100.0')
  await expect(chart.locator('[part="focus-marker"]')).toBeVisible()
  await expect(chart.locator('.depth-a11y')).toHaveText('Bid 100.0: total 2.00 BTC, price impact -0.498%')
  await page.keyboard.press('Enter')

  await page.keyboard.press('+')
  await expect.poll(() => chart.evaluate((element) => (element as DepthInternals).range)).toBe(0.02)
  await page.keyboard.press('-')
  await page.keyboard.press('-')
  await expect.poll(() => chart.evaluate((element) => (element as DepthInternals).range)).toBe(0.1)

  const events = await page.evaluate(() => window.depthScenario.events.filter((event) => event.type !== 'tooltip-change'))
  expect(events[0]).toMatchObject({ type: 'price-select', detail: { price: 100, side: 'bid' } })
  expect(events.filter((event) => event.type === 'range-change')).toHaveLength(3)
  expect((events[1].detail as { min: number }).min).toBeCloseTo(100.5 * 0.98)

  await page.keyboard.press('Escape')
  await expect(chart.locator('[part="focus-marker"]')).toBeHidden()
})

test('draws, redraws and zooms without page errors', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  for (const scenario of ['book', 'quote']) {
    await open(page, scenario)
    const chart = page.locator('c2-depth-chart')
    await expect(chart).toHaveState('ready')
    await chart.evaluate(async (element) => {
      const depth = element as DepthInternals
      depth.range = 0.005
      await depth.updateComplete
      depth.bids = [[100, 1]]
      depth.asks = []
      await depth.updateComplete
      await new Promise(requestAnimationFrame)
    })
  }
  expect(errors).toEqual([])
})

test('an explicit mid past the best ask starts the ask curve at the depth behind it', async ({ page }) => {
  await open(page)
  const asks = await page.evaluate(() => {
    const { buildDepthBook, depthSeries, depthWindow } = window.depthScenario.model
    const book = buildDepthBook(
      [[99, 1]],
      [
        [100, 2],
        [101, 3],
      ],
      100.5,
    )
    return depthSeries(book, depthWindow(book, 0.05), 'base').asks
  })
  // Points: bid edge, 99, mid 100.5, 101, ask edge. The 100 ask lies behind the mid, so the curve starts at 2 there.
  expect(asks).toEqual([null, null, 2, 5, 5])
})

test('mid and range changes redraw through setData, and keyboard focus stays on its price', async ({ page }) => {
  await open(page)
  const chart = page.locator('c2-depth-chart')
  await expect(chart).toHaveState('ready')
  await chart.locator('[part="plot"]').focus()
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowLeft')
  await expect(chart.locator('.tooltip')).toContainText('Bid · 99.0')
  const result = await chart.evaluate(async (element) => {
    const depth = element as DepthInternals & { mid?: number }
    const before = window.depthScenario.counts()
    depth.mid = 100.4
    depth.range = 0.04
    await depth.updateComplete
    // A new book with a level added near the touch shifts every index; focus must stay on 99.0.
    depth.bids = [
      [100.2, 1],
      [100, 2],
      [99, 2],
      [98, 4],
    ]
    await depth.updateComplete
    await new Promise(requestAnimationFrame)
    const after = window.depthScenario.counts()
    return { setOptions: after.setOptions - before.setOptions, window: depth.visibleRange }
  })
  expect(result.setOptions).toBe(0)
  expect(result.window.min).toBeCloseTo(100.4 * 0.96)
  await expect(chart.locator('.tooltip')).toContainText('Bid · 99.0')
  await expect(chart.locator('.tooltip')).toContainText('5.00 BTC')
})

test('an empty book shows the empty state', async ({ page }) => {
  await open(page, 'empty')
  await expect(page.locator('c2-depth-chart').locator('[part="state"]')).toHaveText('No data')
})

test('has no axe violations', async ({ page }) => {
  await open(page)
  await expect(page.locator('c2-depth-chart')).toHaveState('ready')
  const results = await new AxeBuilder({ page }).include('c2-depth-chart').analyze()
  expect(results.violations).toEqual([])
})
