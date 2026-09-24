import { test, expect } from './fixture'

/**
 * Cost assertions, never wall-clock: these hold on any machine, so they can fail the build.
 *
 * Together they are the executable statement of the package's central claim — that data and presentation
 * travel separate paths, and that a realtime tick costs one engine redraw and no DOM.
 */

test('a hundred thousand points cost the same DOM as a hundred', async ({ page, scenario }) => {
  await scenario('perf')
  const chart = page.locator('c2-line-chart')
  await expect(chart).toHaveAttribute('data-chart-ready', 'true')

  const small = await chart.evaluate((element) => element.shadowRoot?.querySelectorAll('*').length ?? 0)

  await page.evaluate(() => window.chartScenario.setData(100_000))
  await page.waitForFunction(() => window.chartScenario.counts().setData > 0)

  const huge = await chart.evaluate((element) => element.shadowRoot?.querySelectorAll('*').length ?? 0)

  // A regression that renders per-point DOM — an SVG engine, a stray repeat() — fails right here.
  expect(huge).toBe(small)
  expect(await chart.evaluate((element) => element.shadowRoot?.querySelectorAll('canvas').length)).toBe(1)
})

test('streaming appends redraw without ever rebuilding the engine or its options', async ({ page, scenario }) => {
  await scenario('perf')
  await expect(page.locator('c2-line-chart')).toHaveAttribute('data-chart-ready', 'true')

  const before = await page.evaluate(() => window.chartScenario.counts())
  await page.evaluate(() => window.chartScenario.append(100))
  const after = await page.evaluate(() => window.chartScenario.counts())

  // One instance for the life of the element…
  expect(after.created).toBe(before.created)
  // …no option rebuilds, which under uPlot would mean a destroy and reconstruct per tick…
  expect(after.setOptions).toBe(before.setOptions)
  // …and one data push per append.
  expect(after.setData - before.setData).toBe(100)
})

test('a data change never rebuilds options, and a presentation change does', async ({ page, scenario }) => {
  await scenario('perf')
  await expect(page.locator('c2-line-chart')).toHaveAttribute('data-chart-ready', 'true')

  const start = await page.evaluate(() => window.chartScenario.counts())

  await page.evaluate(() => window.chartScenario.setData(200))
  await page.waitForFunction((n) => window.chartScenario.counts().setData > n, start.setData)
  const afterData = await page.evaluate(() => window.chartScenario.counts())
  expect(afterData.setOptions).toBe(start.setOptions)

  await page.evaluate(() => {
    const chart = window.chartScenario.element() as unknown as { curve: string }
    chart.curve = 'smooth'
  })
  await page.waitForFunction((n) => window.chartScenario.counts().setOptions > n, afterData.setOptions)
  const afterPresentation = await page.evaluate(() => window.chartScenario.counts())
  expect(afterPresentation.setOptions).toBeGreaterThan(afterData.setOptions)
})

test('the tooltip is one reused node, not a node per hovered point', async ({ page, scenario }) => {
  await scenario('default')
  const chart = page.locator('c2-line-chart')
  await expect(chart).toHaveAttribute('data-chart-ready', 'true')

  const count = () => chart.evaluate((element) => element.shadowRoot?.querySelectorAll('*').length ?? 0)
  const box = await chart.boundingBox()
  if (!box) throw new Error('the chart has no box')

  // Start in the middle of the plot: the left axis gutter is not part of it, and a cursor there
  // reports no datum.
  const startX = box.x + box.width / 2
  await page.mouse.move(startX, box.y + box.height / 2)
  await expect.poll(() => chart.evaluate((element) => element.shadowRoot?.querySelector('.tooltip')?.matches(':popover-open') ?? false)).toBe(true)
  const showing = await count()

  // From there it must be reused: twenty more positions, across many data points, allocate nothing.
  for (let step = 1; step < 20; step += 1) {
    await page.mouse.move(startX - step * 12, box.y + box.height / 2)
  }

  expect(await count()).toBe(showing)
})

test('hovering never rebuilds the engine or its options', async ({ page, scenario }) => {
  await scenario('perf')
  const chart = page.locator('c2-line-chart')
  await expect(chart).toHaveAttribute('data-chart-ready', 'true')

  const before = await page.evaluate(() => window.chartScenario.counts())

  const box = await chart.boundingBox()
  if (!box) throw new Error('the chart has no box')
  for (let step = 0; step < 30; step += 1) {
    await page.mouse.move(box.x + 60 + step * 12, box.y + box.height / 2)
  }

  const after = await page.evaluate(() => window.chartScenario.counts())

  // The hover state is a reactive property, so treating every non-data change as a presentation change
  // sends a mouse move through `setOptions` — which under uPlot destroys and reconstructs the chart on
  // every pixel, and resets the cursor so the tooltip can never appear.
  expect(after.setOptions).toBe(before.setOptions)
  expect(after.created).toBe(before.created)
  expect(after.setData).toBe(before.setData)
})
