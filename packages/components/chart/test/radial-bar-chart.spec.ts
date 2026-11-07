import AxeBuilder from '@axe-core/playwright'
import { test, expect } from './fixture'

type Datum = { name: string; value: number | '-'; itemStyle?: { color: string; opacity: number }; label?: { show: boolean; color?: string } }
interface RadialElement extends HTMLElement {
  data: unknown
  frame: unknown
  highlighted: string | null
  updateComplete: Promise<boolean>
  buildContext(): unknown
  buildOptions(context: unknown): {
    polar: { radius: [number, number] }[]
    angleAxis: { max: number; startAngle: number }[]
    radiusAxis: { data: string[]; inverse: boolean }[]
    series: { barWidth: number; z: number }[]
  }
  projectData(frame: unknown, context: unknown): Datum[][]
  handleEngineClick(detail: { index: number; seriesIndex: number }): void
  getLegendItems(): { label: string; color: string; visible: boolean; toggle(): void }[]
}

const project = (page: import('@playwright/test').Page) =>
  page.locator('c2-radial-bar-chart').evaluate((element) => {
    const chart = element as RadialElement
    return chart.projectData(chart.frame, chart.buildContext())
  })

test('one ring per row toward its goal, outermost first, in the row colours; past the goal a darker second lap', async ({ page, scenario }) => {
  await scenario('radial')
  const chart = page.locator('c2-radial-bar-chart')
  await expect(chart).toHaveState('ready')
  const [values, laps, tracks] = await project(page)
  expect(values.map((datum) => [datum.name, Number((datum.value as number).toFixed(2)), datum.itemStyle?.color])).toEqual([
    ['Move', 0.7, 'rgb(250, 17, 79)'],
    ['Exercise', 0.8, 'rgb(146, 232, 42)'],
    ['Stand', 1, 'rgb(30, 234, 239)'],
  ])
  expect(laps.map((datum) => (datum.value === '-' ? '-' : Number(datum.value.toFixed(2))))).toEqual(['-', '-', 0.3])
  expect(laps[2].itemStyle?.color).toBe('rgb(21, 164, 167)')
  expect(tracks.map((datum) => datum.value)).toEqual([1, 1, 1])
  // Each name at its ring's start, in black or white, whichever reads on the arc on top there (Stand's lap).
  const names = chart.locator('.radial-labels text')
  await expect(names).toHaveText(['Move', 'Exercise', 'Stand'])
  expect(await names.evaluateAll((texts) => texts.map((text) => text.getAttribute('fill')))).toEqual(['#18181b', '#18181b', '#18181b'])
  // Each follows its ring from twelve o'clock, the outermost highest.
  const tops = await names.evaluateAll((texts) => texts.map((text) => text.getBoundingClientRect().top))
  expect(tops[0]).toBeLessThan(tops[1])
  expect(tops[1]).toBeLessThan(tops[2])

  const options = await chart.evaluate((element) => {
    const radial = element as RadialElement
    return radial.buildOptions(radial.buildContext())
  })
  expect(options.radiusAxis[0]).toMatchObject({ data: ['Move', 'Exercise', 'Stand'], inverse: true })
  expect(options.angleAxis[0]).toMatchObject({ max: 1, startAngle: 90 })
  // The outer radius fills the plot; three 16px rings 6px apart leave the hole.
  const outer = await chart.locator('[part="plot"]').evaluate((element) => Math.min(element.clientWidth, element.clientHeight) / 2 - 2)
  expect(options.polar[0].radius).toEqual([outer - 3 * 22, outer])
  expect(options.series.map((series) => series.barWidth)).toEqual([16, 16, 16])

  // The centre slot sits in the middle of the plot, and the rings read as text.
  const plot = (await chart.locator('[part="plot"]').boundingBox())!
  const total = (await page.locator('#total').boundingBox())!
  expect(Math.abs(total.x + total.width / 2 - (plot.x + plot.width / 2))).toBeLessThan(2)
  expect(Math.abs(total.y + total.height / 2 - (plot.y + plot.height / 2))).toBeLessThan(2)
  await expect(chart.locator('.radial-a11y li')).toHaveText([
    'Move: 420 kcal / 600 kcal, 70%',
    'Exercise: 24 kcal / 30 kcal, 80%',
    'Stand: 16 kcal / 12 kcal, 130%',
  ])
  const results = await new AxeBuilder({ page }).include('c2-radial-bar-chart').analyze()
  expect(results.violations).toEqual([])
})

test('the tooltip gives the value against the goal and the share, whichever part of the ring is hovered', async ({ page, scenario }) => {
  await scenario('radial')
  const chart = page.locator('c2-radial-bar-chart')
  await expect(chart).toHaveState('ready')
  await page.evaluate(() => window.chartScenario.hover({ index: 1, seriesIndex: 2, px: 160, py: 60 }))
  await expect(chart.locator('[part="tooltip"]')).toContainText('Exercise')
  await expect(chart.locator('[part="tooltip"]')).toContainText('24 kcal / 30 kcal · 80%')
})

test('a click highlights a ring and fades the others; the ring width and gap come from the variables', async ({ page, scenario }) => {
  await scenario('radial')
  const chart = page.locator('c2-radial-bar-chart')
  await expect(chart).toHaveState('ready')
  await chart.evaluate(async (element) => {
    const radial = element as RadialElement
    radial.handleEngineClick({ index: 0, seriesIndex: 2 })
    await radial.updateComplete
  })
  expect(await chart.evaluate((element) => (element as RadialElement).highlighted)).toBe('Move')
  const [values, , tracks] = await project(page)
  expect(values.map((datum) => datum.itemStyle?.opacity)).toEqual([1, 0.25, 0.25])
  await expect(chart.locator('.radial-labels text').nth(1)).toHaveAttribute('opacity', '0.25')
  expect(tracks.map((datum) => datum.itemStyle?.opacity)).toEqual([1, 0.25, 0.25])

  const sized = await chart.evaluate((element) => {
    const radial = element as RadialElement
    radial.style.setProperty('--c2-chart__ring--width', '10px')
    radial.style.setProperty('--c2-chart__ring--gap', '2px')
    const options = radial.buildOptions(radial.buildContext())
    // Rings wider than the box allows narrow to keep a hole.
    radial.style.setProperty('--c2-chart__ring--width', '80px')
    const narrowed = radial.buildOptions(radial.buildContext())
    return { width: options.series[0].barWidth, radius: options.polar[0].radius, narrowed: narrowed.series[0].barWidth, hole: narrowed.polar[0].radius[0] }
  })
  expect(sized.width).toBe(10)
  const outer = await chart.locator('[part="plot"]').evaluate((element) => Math.min(element.clientWidth, element.clientHeight) / 2 - 2)
  expect(sized.radius).toEqual([outer - 36, outer])
  expect(sized.narrowed).toBeLessThan(80)
  // A fifth of the radius stays open.
  expect(sized.hole).toBeCloseTo(outer / 5, 0)
})

test('sweep="270" opens a dial at the bottom; the legend lists the rings and hides one; a ring without a value draws nothing', async ({ page, scenario }) => {
  await scenario('radial-dial')
  const chart = page.locator('c2-radial-bar-chart')
  await expect(chart).toHaveState('ready')
  const options = await chart.evaluate((element) => {
    const radial = element as RadialElement
    return radial.buildOptions(radial.buildContext())
  })
  expect(options.angleAxis[0].max).toBeCloseTo(360 / 270)
  // Starts at the bottom left (225° clockwise from twelve), so the gap is centred at the bottom.
  expect(options.angleAxis[0].startAngle).toBe(90 - 225)
  const [values] = await project(page)
  expect(values.map((datum) => datum.value)).toEqual([0.92, 0.64, 0.24, '-'])
  // labels="none".
  await expect(chart.locator('.radial-labels text')).toHaveCount(0)

  const legend = chart.locator('[part="legend"]')
  await expect(legend).toContainText('Housing')
  await expect(legend).toContainText('Leisure')
  await chart.evaluate((element) => (element as RadialElement).getLegendItems()[1].toggle())
  const [hidden, , tracks] = await project(page)
  expect(hidden[1].value).toBe('-')
  expect(tracks[1].value).toBe('-')
})

test('regression: new data with another ring count redraws every ring and the text list', async ({ page, scenario }) => {
  await scenario('radial')
  const chart = page.locator('c2-radial-bar-chart')
  await expect(chart).toHaveState('ready')
  await chart.evaluate(async (element) => {
    const radial = element as RadialElement
    radial.data = [
      { ring: 'Sales', value: 128, goal: 150 },
      { ring: 'Support', value: 96, goal: 90 },
      { ring: 'Product', value: 41, goal: 60 },
      { ring: 'Design', value: 18, goal: 30 },
    ]
    await radial.updateComplete
  })
  await expect(chart.locator('.radial-a11y li')).toHaveCount(4)
  const options = await chart.evaluate((element) => {
    const radial = element as RadialElement
    return radial.buildOptions(radial.buildContext())
  })
  expect(options.radiusAxis[0].data).toEqual(['Sales', 'Support', 'Product', 'Design'])
})

test('regressions: any CSS colour shades its lap, a rem ring width is read in pixels, a ring with no label highlights on click', async ({ page, scenario }) => {
  await scenario('radial')
  const chart = page.locator('c2-radial-bar-chart')
  await expect(chart).toHaveState('ready')
  const result = await chart.evaluate(async (element) => {
    const radial = element as RadialElement
    radial.style.setProperty('--c2-chart__ring--width', '1.25rem')
    radial.data = [
      { ring: 'Short', value: 18, goal: 12, color: '#ff0' },
      { ring: 'Named', value: 5, goal: 10, color: 'red' },
    ]
    await radial.updateComplete
    const [values, laps] = radial.projectData(radial.frame, radial.buildContext())
    const width = radial.buildOptions(radial.buildContext()).series[0].barWidth
    return { values: values.map((datum) => datum.itemStyle?.color), lap: laps[0].itemStyle?.color, width }
  })
  expect(result.values).toEqual(['rgb(255, 255, 0)', 'rgb(255, 0, 0)'])
  expect(result.lap).toBe('rgb(179, 179, 0)')
  expect(result.width).toBe(20)

  await chart.evaluate(async (element) => {
    const radial = element as RadialElement & { labelField: string }
    radial.labelField = ''
    radial.data = [{ value: 40 }, { value: 70 }]
    await radial.updateComplete
    radial.handleEngineClick({ index: 1, seriesIndex: 0 })
    await radial.updateComplete
  })
  expect(await chart.evaluate((element) => (element as RadialElement).highlighted)).toBe('2')
})
