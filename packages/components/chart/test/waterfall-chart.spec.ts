import AxeBuilder from '@axe-core/playwright'
import { test, expect } from './fixture'

type Step = { label: string; kind: string; value: number; start: number; end: number; row: number }
type Child = { type: string; shape?: Record<string, number>; style?: { fill?: string; text?: string; opacity?: number } }

interface WaterfallElement extends HTMLElement {
  data: unknown
  steps: Step[]
  highlighted: string | null
  valueLabels: boolean
  legendAction: string
  updateComplete: Promise<boolean>
  buildContext(): unknown
  seriesOption(index: number, context: unknown): { renderItem(params: { dataIndex: number }, api: unknown): { children: Child[] } | null }
  coordinateSystem(context: unknown): { xAxis: { data: string[] } }
  projectData(frame: unknown, context: unknown): number[][][]
  frame: unknown
  getLegendItems(): { label: string; key: string; visible: boolean; toggle(): void }[]
  appendPoint(x: number, values: readonly (number | null)[]): void
  series?: unknown
}

test('bridges the running total through the steps, with totals and an opening balance', async ({ page, scenario }) => {
  await scenario('waterfall')
  const chart = page.locator('c2-waterfall-chart')
  await expect(chart).toHaveState('ready')

  const steps = await chart.evaluate((element) => (element as WaterfallElement).steps.map((step) => [step.label, step.kind, step.start, step.end, step.row]))
  // The opening total sets the level; "Pending" has no value and draws nothing; `total-label` closes the bridge.
  expect(steps).toEqual([
    ['Revenue', 'total', 0, 420, 0],
    ['Cost of sales', 'decrease', 420, 240, 1],
    ['Services', 'increase', 240, 275, 2],
    ['Gross profit', 'total', 0, 275, 3],
    ['Operating expenses', 'decrease', 275, 180, 4],
    ['Tax', 'decrease', 180, 140, 6],
    ['Net income', 'total', 0, 140, -1],
  ])
})

test('hands the engine one bar per step on a category axis, with connectors only where the total carries on', async ({ page, scenario }) => {
  await scenario('waterfall')
  const chart = page.locator('c2-waterfall-chart')
  await expect(chart).toHaveState('ready')

  const drawn = await chart.evaluate(async (element) => {
    const waterfall = element as WaterfallElement
    // Maps an x index to the middle of a 100px band and a value to a y measured up from 500px.
    const stub = { coord: (p: number[]) => [p[0] * 100 + 50, 500 - p[1]], size: () => [100, 0] }
    const context = waterfall.buildContext()
    const option = waterfall.seriesOption(0, context)
    const kinds = (index: number) => option.renderItem({ dataIndex: index }, stub)?.children.map((child) => child.type)
    const first = kinds(0)
    const labels = waterfall.coordinateSystem(context).xAxis.data
    const data = waterfall.projectData(waterfall.frame, context)[0]
    // A second opening balance at another level: the bar before it has no connector into it.
    waterfall.data = [
      { item: 'Q1', amount: 100, total: true },
      { item: 'Change', amount: 20 },
      { item: 'Q2 restated', amount: 300, total: true },
    ]
    await waterfall.updateComplete
    const reset = waterfall.seriesOption(0, waterfall.buildContext())
    return {
      labels,
      data,
      first,
      beforeReset: reset.renderItem({ dataIndex: 1 }, stub)?.children.map((child) => child.type),
    }
  })
  expect(drawn.labels).toEqual(['Revenue', 'Cost of sales', 'Services', 'Gross profit', 'Operating expenses', 'Tax', 'Net income'])
  expect(drawn.data[1]).toEqual([1, 420, 240])
  expect(drawn.first).toEqual(['rect', 'line'])
  expect(drawn.beforeReset).toEqual(['rect'])
})

test('colours rises, falls and totals, prints signed labels and lists the three kinds in the legend', async ({ page, scenario }) => {
  await scenario('waterfall')
  const chart = page.locator('c2-waterfall-chart')
  await expect(chart).toHaveState('ready')

  const result = await chart.evaluate(async (element) => {
    const waterfall = element as WaterfallElement
    waterfall.valueLabels = true
    await waterfall.updateComplete
    const stub = { coord: (p: number[]) => [p[0] * 100 + 50, 500 - p[1]], size: () => [100, 0] }
    const option = waterfall.seriesOption(0, waterfall.buildContext())
    const bar = (index: number) => option.renderItem({ dataIndex: index }, stub)?.children ?? []
    return {
      fills: [0, 1, 2].map((index) => bar(index).find((child) => child.type === 'rect')?.style?.fill),
      texts: [0, 1, 2].map((index) => bar(index).find((child) => child.type === 'text')?.style?.text),
      legend: waterfall.getLegendItems().map((item) => item.label),
    }
  })
  // Series colour for a total, --c2-chart__negative--color for a fall, --c2-chart__positive--color for a rise.
  expect(result.fills).toEqual(['rgb(2, 101, 220)', 'rgb(220, 38, 38)', 'rgb(22, 163, 74)'])
  expect(result.texts).toEqual(['420', '-180', '+35'])
  expect(result.legend).toEqual(['Increase', 'Decrease', 'Total'])
})

test('highlights a kind from the legend, and hides it in toggle mode while the total still counts it', async ({ page, scenario }) => {
  await scenario('waterfall')
  const chart = page.locator('c2-waterfall-chart')
  await expect(chart).toHaveState('ready')

  const result = await chart.evaluate(async (element) => {
    const waterfall = element as WaterfallElement
    const stub = { coord: (p: number[]) => [p[0] * 100 + 50, 500 - p[1]], size: () => [100, 0] }
    const rect = (index: number) =>
      waterfall
        .seriesOption(0, waterfall.buildContext())
        .renderItem({ dataIndex: index }, stub)
        ?.children.find((child) => child.type === 'rect')
    waterfall
      .getLegendItems()
      .find((item) => item.key === 'decrease')
      ?.toggle()
    await waterfall.updateComplete
    const highlighted = [waterfall.highlighted, rect(1)?.style?.opacity, rect(2)?.style?.opacity]
    waterfall.highlighted = null
    waterfall.legendAction = 'toggle'
    await waterfall.updateComplete
    waterfall
      .getLegendItems()
      .find((item) => item.key === 'decrease')
      ?.toggle()
    await waterfall.updateComplete
    return { highlighted, hiddenFall: rect(1), rise: rect(2)?.type, closing: waterfall.steps.at(-1)?.end }
  })
  expect(result.highlighted).toEqual(['decrease', 1, 0.25])
  expect(result.hiddenFall).toBeUndefined()
  expect(result.rise).toBe('rect')
  expect(result.closing).toBe(140)
})

test('describes a hovered bar with its change and running total, and fires point events for it', async ({ page, scenario }) => {
  await scenario('waterfall')
  const chart = page.locator('c2-waterfall-chart')
  await expect(chart).toHaveState('ready')

  const seen = await chart.evaluate((element) => {
    const out: unknown[] = []
    element.addEventListener('tooltip-change', (event) => {
      const detail = (event as CustomEvent).detail as { formattedX: string; entries: { series: { label: string }; formatted: string }[] } | null
      out.push(detail ? [detail.formattedX, ...detail.entries.map((entry) => `${entry.series.label}=${entry.formatted}`)] : null)
    })
    element.addEventListener('point-hover', (event) => {
      const detail = (event as CustomEvent).detail as { label: string; y: number } | null
      if (detail) out.push(`point:${detail.label}:${detail.y}`)
    })
    window.chartScenario.hover({ index: 1, seriesIndex: 0, px: 40, py: 40 })
    window.chartScenario.hover({ index: 6, seriesIndex: 0, px: 60, py: 60 })
    window.chartScenario.hover(null)
    return out
  })
  expect(seen).toEqual([
    ['Cost of sales', 'Amount=-180', 'Running total=240'],
    'point:Cost of sales:-180',
    ['Net income', 'Total=140'],
    'point:Net income:140',
    null,
  ])
})

test('names the plot and lists every step in a table for screen readers, with no axe violations', async ({ page, scenario }) => {
  await scenario('waterfall')
  const chart = page.locator('c2-waterfall-chart')
  await expect(chart).toHaveState('ready')

  await expect(chart.locator('.plot')).toHaveAttribute('aria-label', 'Waterfall chart of Amount, 7 bars')
  const rows = chart.locator('table.waterfall-a11y tbody tr')
  await expect(rows).toHaveCount(7)
  await expect(rows.nth(1)).toHaveText(/Cost of sales\s*-180\s*240/)
  await expect(rows.nth(3)).toHaveText(/Gross profit\s*Total\s*275/)

  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(results.violations).toEqual([])
})

test('reads one inferred series, never a numeric total flag, and draws steps appended without a rebuild', async ({ page, scenario }) => {
  await scenario('waterfall')
  const chart = page.locator('c2-waterfall-chart')
  await expect(chart).toHaveState('ready')

  const result = await chart.evaluate(async (element) => {
    const waterfall = element as WaterfallElement
    waterfall.querySelector('c2-chart-series')?.remove()
    // `total` is numeric here and comes first, so it would be inferred as the value without the guard.
    waterfall.data = [
      { item: 'Open', total: 1, amount: 100 },
      { item: 'Sales', total: 0, amount: 40 },
    ]
    await waterfall.updateComplete
    const inferred = waterfall.steps.map((step) => [step.label, step.end])
    waterfall.appendPoint(2, [-15])
    const stub = { coord: (p: number[]) => [p[0] * 100 + 50, 500 - p[1]], size: () => [100, 0] }
    const option = waterfall.seriesOption(0, waterfall.buildContext())
    return { inferred, appended: waterfall.steps.at(-2)?.end, drawn: option.renderItem({ dataIndex: 2 }, stub)?.children[0]?.type }
  })
  // The total row with a value opens the bridge at 100; the appended -15 lands before the closing total.
  expect(result.inferred).toEqual([
    ['Open', 100],
    ['Sales', 140],
    ['Net income', 140],
  ])
  expect(result.appended).toBe(125)
  expect(result.drawn).toBe('rect')
})
