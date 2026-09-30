import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { test } from '../../../../tests/fixture'
// Pulls in the `window.bubbleScenario` declaration the scenario page installs.
import './bubble-scenario-api'

async function open(page: Page, scenario = 'grouped'): Promise<void> {
  await page.goto(`/packages/components/chart/test/bubble-scenarios.html?scenario=${scenario}`)
  await expect(page.locator('main')).toHaveAttribute('data-ready', 'true')
}

/** The members of the element the specs read; all of them are protected or internal on the class. */
interface BubbleInternals {
  frame: unknown
  resolvedSeries: { field: string; label?: string; color?: string }[]
  buildContext(): unknown
  buildOptions(context: unknown): {
    xAxis: { type: string; name?: string }
    yAxis: { type: string; name?: string }
    series: { name: string; itemStyle: { color: string; borderColor: string } }[]
  }
  projectData(frame: unknown): [number, number, number | null, number, number][][]
}

test('groups one-row-per-point data by series-field, in the order the groups first appear', async ({ page }) => {
  await open(page)
  const chart = page.locator('c2-bubble-chart')
  await expect(chart).toHaveAttribute('data-chart-engine', 'echarts')

  const result = await chart.evaluate((element) => {
    const bubble = element as unknown as BubbleInternals
    const options = bubble.buildOptions(bubble.buildContext())
    return {
      series: bubble.resolvedSeries.map((series) => series.field),
      names: options.series.map((series) => series.name),
      // Row indices each series draws, largest bubble first.
      rows: bubble.projectData(bubble.frame).map((points) => points.map((point) => point[3])),
      xAxis: options.xAxis.type,
    }
  })

  // Nowhere (row 5) has gdp 0, which a log axis cannot place.
  expect(result).toEqual({ series: ['Africa', 'Asia', 'Americas'], names: ['Africa', 'Asia', 'Americas'], rows: [[3, 0], [1, 4], [2]], xAxis: 'log' })
})

test('sizes bubbles by area between the minimum and maximum size variables', async ({ page }) => {
  await open(page)
  const chart = page.locator('c2-bubble-chart')
  await expect(chart).toHaveAttribute('data-chart-ready', 'true')

  const diameters = await chart.evaluate(async (element) => {
    const bubble = element as unknown as BubbleInternals & { updateComplete: Promise<boolean>; sizeMax?: number }
    const read = () =>
      Object.fromEntries(
        bubble
          .projectData(bubble.frame)
          .flat()
          .map((point) => [point[3], Math.round(point[4] * 10) / 10]),
      )
    const before = read()
    element.style.setProperty('--c2-chart__bubble--max-size', '100px')
    element.style.setProperty('--c2-chart__bubble--min-size', '20px')
    const after = read()
    // Pinning the domain to four times India's population halves India's diameter.
    bubble.sizeMax = 1429 * 4
    await bubble.updateComplete
    return { before, after, pinned: read()[1] }
  })

  // India holds the largest size, so it draws at the maximum; Brazil at √(216 / 1429) of it.
  expect(diameters.before[1]).toBe(64)
  expect(diameters.before[2]).toBeCloseTo(64 * Math.sqrt(216 / 1429), 1)
  expect(diameters.after[1]).toBe(100)
  // Kenya's area-proportional diameter (19.6px) is below the new minimum.
  expect(diameters.after[0]).toBe(20)
  expect(diameters.pinned).toBe(50)
})

test('reports the hovered row, not its draw position, with its label and size', async ({ page }) => {
  await open(page)
  const chart = page.locator('c2-bubble-chart')
  await expect(chart).toHaveAttribute('data-chart-ready', 'true')

  const detail = await chart.evaluate(async (element) => {
    const tooltip = new Promise<{ label?: string; size?: number | null; formattedSize?: string; formattedX: string; entries: { formatted: string }[] }>(
      (resolve) => element.addEventListener('tooltip-change', (event) => resolve((event as CustomEvent).detail), { once: true }),
    )
    const point = new Promise<{ index: number; size?: number | null; label?: string }>((resolve) =>
      element.addEventListener('point-click', (event) => resolve((event as CustomEvent).detail), { once: true }),
    )
    // Draw index 1 of the Asia series is Japan (row 4): India draws first because it is larger.
    window.bubbleScenario.hover({ index: 1, seriesIndex: 1, px: 100, py: 80 })
    window.bubbleScenario.click({ index: 0, seriesIndex: 0 })
    const [hovered, clicked] = await Promise.all([tooltip, point])
    return { hovered: { ...hovered, entries: hovered.entries.map((entry) => entry.formatted) }, clicked }
  })

  expect(detail.hovered).toMatchObject({ label: 'Japan', size: 124, formattedSize: '124', formattedX: '33,830', entries: ['84.7'] })
  // Draw index 0 of Africa is Nigeria (row 3), the larger of its two bubbles.
  expect(detail.clicked).toMatchObject({ index: 3, label: 'Nigeria', size: 224 })
  await expect(chart.locator('.tooltip-title')).toHaveText('Japan')
  await expect(chart.locator('.tooltip-subtitle')).toHaveText('Asia')
})

test('reads one column per series, sharing the size column', async ({ page }) => {
  await open(page, 'wide')
  const chart = page.locator('c2-bubble-chart')
  await expect(chart).toHaveAttribute('data-chart-ready', 'true')

  const result = await chart.evaluate((element) => {
    const bubble = element as unknown as BubbleInternals
    const options = bubble.buildOptions(bubble.buildContext())
    return {
      points: bubble.projectData(bubble.frame).map((points) => points.map((point) => [point[0], point[1], point[2]])),
      axes: [options.xAxis.type, options.xAxis.name, options.yAxis.name],
    }
  })

  // The last bonds row has no size and draws at the minimum, after the sized one.
  expect(result.points).toEqual([
    [
      [5, 3.6, 640],
      [9, 4.1, null],
    ],
    [
      [16, 8.2, 900],
      [23, 9.6, 225],
    ],
  ])
  expect(result.axes).toEqual(['value', 'Volatility', 'Return'])
})

test('lets a declared series relabel, recolour and limit the groups', async ({ page }) => {
  await open(page, 'declared')
  const chart = page.locator('c2-bubble-chart')
  await expect(chart).toHaveAttribute('data-chart-ready', 'true')

  const result = await chart.evaluate((element) => {
    const bubble = element as unknown as BubbleInternals
    const options = bubble.buildOptions(bubble.buildContext())
    return { names: options.series.map((series) => series.name), border: options.series[0].itemStyle.borderColor, fill: options.series[0].itemStyle.color }
  })

  expect(result).toEqual({ names: ['Asia Pacific'], border: '#ff0000', fill: 'rgba(255, 0, 0, 0.5)' })
  await expect(chart.locator('.legend-item')).toHaveCount(1)
})

test('ends the legend with a size key that follows the data', async ({ page }) => {
  await open(page)
  const chart = page.locator('c2-bubble-chart')
  await expect(chart).toHaveAttribute('data-chart-ready', 'true')
  const key = chart.locator('[part="size-legend"] svg')
  await expect(key).toHaveAttribute('aria-label', 'Population: 1.4K, 360, 89')

  // A data-only update takes the fast path that skips Lit; the key must still move with the new sizes.
  await chart.evaluate((element) => {
    const bubble = element as unknown as { data: unknown[] }
    bubble.data = [
      { country: 'A', region: 'Africa', gdp: 1000, life: 60, pop: 8000 },
      { country: 'B', region: 'Africa', gdp: 2000, life: 65, pop: 100 },
    ]
  })
  await expect(key).toHaveAttribute('aria-label', 'Population: 8K, 2K, 500')

  await chart.evaluate((element) => element.setAttribute('size-legend', 'none'))
  await expect(chart.locator('[part="size-legend"]')).toHaveCount(0)
})

test('shows the error state when series-field has no y-field', async ({ page }) => {
  await open(page, 'invalid')
  await expect(page.locator('c2-bubble-chart [part="state"]')).toHaveText('series-field needs a y-field to read the values from.')
})

test('has no automated accessibility violations', async ({ page }) => {
  await open(page)
  await expect(page.locator('c2-bubble-chart')).toHaveAttribute('data-chart-ready', 'true')
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(results.violations).toEqual([])
})

test('draws bubble labels in the chart text colour unless their own variable is set', async ({ page }) => {
  await open(page)
  const chart = page.locator('c2-bubble-chart')
  await expect(chart).toHaveAttribute('data-chart-ready', 'true')
  const colors = await chart.evaluate((element) => {
    const bubble = element as unknown as BubbleInternals & { bubbleStyle(): { labelColor: string } }
    element.style.setProperty('--c2-chart--color', 'rgb(1, 2, 3)')
    const inherited = bubble.bubbleStyle().labelColor
    element.style.setProperty('--c2-chart__bubble-label--color', 'rgb(4, 5, 6)')
    return [inherited, bubble.bubbleStyle().labelColor]
  })
  // The dark theme switches --c2-chart--color, so a label that followed a fixed colour would vanish on a dark card.
  expect(colors).toEqual(['rgb(1, 2, 3)', 'rgb(4, 5, 6)'])
})
