import { test, expect } from './fixture'

/**
 * The legend and tooltip contract every chart shares: both are replaceable through a slot, and a legend click
 * either hides a series (`legend-action="toggle"`, the default) or highlights it (`legend-action="highlight"`).
 * Each chart type is built here with its own minimal data, so a type that forgets the shared plumbing fails alone.
 */
interface Case {
  tag: string
  attributes: string
  series: string
  data: unknown
  /** The two legend keys, in order: series fields, a pie's slice labels or a pyramid's levels, an overlap chart's set keys. */
  keys: string[]
  /** The engine hover that shows the tooltip. */
  hover: { index: number; seriesIndex: number }
  /** What a click on `click` highlights, or `null` when the chart has nothing to set apart. */
  clickKey: string | null
  click: { index: number; seriesIndex: number }
  /** How a dimmed series shows up in the options, or `null` for a single-series chart with nothing to dim. */
  dim: 'uplot' | 'echarts' | 'pie' | 'overlap' | null
}

const rows = [
  { t: 1, s0: 10, s1: 20 },
  { t: 2, s0: 14, s1: 18 },
  { t: 3, s0: 12, s1: 24 },
]
const two = '<c2-chart-series field="s0" label="First"></c2-chart-series><c2-chart-series field="s1" label="Second"></c2-chart-series>'
const overlapRows = [
  { sets: ['a'], size: 10 },
  { sets: ['b'], size: 8 },
  { sets: ['a', 'b'], size: 3 },
]

const cases: Case[] = [
  {
    tag: 'c2-line-chart',
    attributes: 'x-field="t"',
    series: two,
    data: rows,
    keys: ['s0', 's1'],
    hover: { index: 0, seriesIndex: 0 },
    clickKey: 's1',
    click: { index: 1, seriesIndex: 1 },
    dim: 'uplot',
  },
  {
    tag: 'c2-area-chart',
    attributes: 'x-field="t"',
    series: two,
    data: rows,
    keys: ['s0', 's1'],
    hover: { index: 0, seriesIndex: 0 },
    clickKey: 's1',
    click: { index: 1, seriesIndex: 1 },
    dim: 'uplot',
  },
  {
    tag: 'c2-bar-chart',
    attributes: 'x-field="t"',
    series: two,
    data: rows,
    keys: ['s0', 's1'],
    hover: { index: 0, seriesIndex: 0 },
    clickKey: 's1',
    click: { index: 1, seriesIndex: 1 },
    dim: 'uplot',
  },
  {
    tag: 'c2-scatter-chart',
    attributes: 'x-field="t"',
    series: two,
    data: rows,
    keys: ['s0', 's1'],
    hover: { index: 0, seriesIndex: 0 },
    clickKey: 's1',
    click: { index: 1, seriesIndex: 1 },
    dim: 'echarts',
  },
  {
    tag: 'c2-radar-chart',
    attributes: 'label-field="t"',
    series: two,
    data: rows,
    keys: ['s0', 's1'],
    hover: { index: 0, seriesIndex: 0 },
    clickKey: 's1',
    click: { index: 1, seriesIndex: 1 },
    dim: 'echarts',
  },
  {
    tag: 'c2-pie-chart',
    attributes: 'label-field="t"',
    series: '<c2-chart-series field="s0"></c2-chart-series>',
    data: [
      { t: 'North', s0: 10 },
      { t: 'South', s0: 6 },
    ],
    keys: ['North', 'South'],
    hover: { index: 0, seriesIndex: 0 },
    clickKey: 'South',
    click: { index: 1, seriesIndex: 0 },
    dim: 'pie',
  },
  {
    tag: 'c2-pyramid-chart',
    // Data order from the apex, so the engine's datum order is the rows' and the dimmed levels read like slices.
    attributes: 'label-field="t" sort="none"',
    series: '<c2-chart-series field="s0"></c2-chart-series>',
    data: [
      { t: 'North', s0: 10 },
      { t: 'South', s0: 6 },
    ],
    keys: ['North', 'South'],
    hover: { index: 0, seriesIndex: 0 },
    clickKey: 'South',
    click: { index: 1, seriesIndex: 0 },
    dim: 'pie',
  },
  {
    tag: 'c2-gauge-chart',
    attributes: 'label-field="t" max="100"',
    series: '<c2-chart-series field="s0" label="Score"></c2-chart-series>',
    data: [{ t: 'Now', s0: 64 }],
    keys: ['s0'],
    hover: { index: 0, seriesIndex: 0 },
    clickKey: null,
    click: { index: 0, seriesIndex: 0 },
    dim: null,
  },
  {
    tag: 'c2-candlestick-chart',
    attributes: 'label-field="date"',
    series: '',
    data: [
      { date: 'Mon', open: 1, close: 2, low: 0, high: 3 },
      { date: 'Tue', open: 2, close: 1, low: 0, high: 3 },
    ],
    keys: ['open'],
    hover: { index: 0, seriesIndex: 0 },
    clickKey: null,
    click: { index: 1, seriesIndex: 0 },
    dim: null,
  },
  {
    tag: 'c2-overlap-chart',
    attributes: '',
    series: '<c2-chart-series field="a" label="A"></c2-chart-series><c2-chart-series field="b" label="B"></c2-chart-series>',
    data: overlapRows,
    keys: ['a', 'b'],
    hover: { index: 0, seriesIndex: 1 },
    // A region is not a series; an overlap chart highlights a set from its name (see overlap-chart.spec.ts).
    clickKey: null,
    click: { index: 0, seriesIndex: 1 },
    dim: 'overlap',
  },
]

async function mount(page: import('@playwright/test').Page, item: Case, extra: string, inner = ''): Promise<void> {
  await page.evaluate(
    ({ item, extra, inner }) => {
      const main = document.querySelector('main') as HTMLElement
      main.innerHTML = `<${item.tag} id="subject" ${item.attributes} ${extra}>${item.series}${inner}</${item.tag}>`
      ;(main.firstElementChild as HTMLElement & { data: unknown }).data = item.data
    },
    { item, extra, inner },
  )
  await expect(page.locator('#subject')).toHaveAttribute('data-chart-ready', 'true')
}

for (const item of cases) {
  test(`${item.tag}: the legend and tooltip slots replace the built-in ones`, async ({ page, scenario }) => {
    await scenario('empty')
    await mount(
      page,
      item,
      'legend="bottom"',
      '<div slot="legend" class="custom-legend">My legend</div><div slot="tooltip" class="custom-tooltip">My tooltip</div>',
    )
    const chart = page.locator('#subject')
    await expect(chart.locator('.custom-legend')).toBeVisible()
    // The generated entries are the slot's fallback, so assigned content hides them.
    await expect(chart.locator('.legend-item')).toHaveCount(item.keys.length)
    await expect(chart.locator('.legend-item').first()).toBeHidden()

    await chart.evaluate((element, hover) => {
      ;(element as unknown as { handleEngineHover(detail: object): void }).handleEngineHover({ ...hover, px: 20, py: 20 })
    }, item.hover)
    await expect(chart.locator('.custom-tooltip')).toBeVisible()
    // Slotted content stays in the light DOM; what matters is that the chart's tooltip bubble is open around it.
    await expect.poll(() => chart.evaluate((element) => element.shadowRoot?.querySelector('.tooltip')?.matches(':popover-open'))).toBe(true)
  })

  test(`${item.tag}: legend-action="highlight" emphasises the clicked entry instead of hiding it`, async ({ page, scenario }) => {
    await scenario('empty')
    await mount(page, item, 'legend="bottom" legend-action="highlight"')
    const chart = page.locator('#subject')
    const events = await chart.evaluate((element) => {
      const seen: (string | null)[] = []
      element.addEventListener('series-highlight', (event) => seen.push((event as CustomEvent<{ key: string | null }>).detail.key))
      element.addEventListener('series-toggle', () => seen.push('TOGGLED'))
      ;(window as unknown as { seen: (string | null)[] }).seen = seen
      return seen
    })
    expect(events).toEqual([])

    const entries = chart.locator('.legend-item')
    await entries.first().click()
    await expect.poll(() => chart.evaluate((element) => (element as unknown as { highlighted: string | null }).highlighted)).toBe(item.keys[0])
    await expect(entries.first()).toHaveAttribute('aria-pressed', 'true')
    if (item.keys.length > 1) {
      await expect(entries.nth(1)).toHaveAttribute('aria-pressed', 'false')
      await expect(entries.nth(1)).toHaveClass(/legend-item--dimmed/)
    }
    // Nothing was hidden: every entry is still visible.
    expect(
      await chart.evaluate((element) => (element as unknown as { getLegendItems(): { visible: boolean }[] }).getLegendItems().every((entry) => entry.visible)),
    ).toBe(true)

    if (item.dim) {
      const dimmed = await chart.evaluate((element, kind) => {
        type Subject = {
          buildOptions(context: unknown): Record<string, unknown>
          buildContext(): unknown
          projectData(frame: unknown, context: unknown): unknown
          frame: unknown
        }
        const subject = element as unknown as Subject
        const context = subject.buildContext()
        if (kind === 'pie') {
          const data = subject.projectData(subject.frame, context) as { itemStyle?: { opacity?: number } }[][]
          return [data[0][0].itemStyle?.opacity ?? 1, data[0][1].itemStyle?.opacity ?? 1]
        }
        if (kind === 'overlap') {
          type Item = { children: { style: { fillOpacity?: number } }[] }
          const series = (subject.buildOptions(context) as { series: { renderItem(p: object, api: object): Item }[] }).series
          const api = { getWidth: () => 640, getHeight: () => 320 }
          return [0, 1].map((index) => series[0].renderItem({ dataIndex: index }, api).children[0].style.fillOpacity ?? 1)
        }
        const series = (subject.buildOptions(context) as { series: Record<string, { opacity?: number } | number | undefined>[] }).series
        if (kind === 'uplot') return [(series[1].alpha as number | undefined) ?? 1, (series[2].alpha as number | undefined) ?? 1]
        return [
          (series[0].itemStyle as { opacity?: number } | undefined)?.opacity ?? 1,
          (series[1].itemStyle as { opacity?: number } | undefined)?.opacity ?? 1,
        ]
      }, item.dim)
      expect(dimmed[1]).toBeLessThan(dimmed[0])
    }

    await entries.first().click()
    await expect.poll(() => chart.evaluate((element) => (element as unknown as { highlighted: string | null }).highlighted)).toBeNull()
    expect(await page.evaluate(() => (window as unknown as { seen: (string | null)[] }).seen)).toEqual([item.keys[0], null])
  })
}

for (const item of cases) {
  test(`${item.tag}: clicking a series in the plot highlights it, and clicking it again clears it`, async ({ page, scenario }) => {
    await scenario('empty')
    await mount(page, item, '')
    const chart = page.locator('#subject')
    const click = () =>
      chart.evaluate((element, click) => {
        ;(element as unknown as { handleEngineClick(detail: object): void }).handleEngineClick(click)
        return (element as unknown as { highlighted: string | null }).highlighted
      }, item.click)
    expect(await click()).toBe(item.clickKey)
    expect(await click()).toBeNull()
    // A listener that cancels point-click keeps the highlight as it is.
    await chart.evaluate((element) => element.addEventListener('point-click', (event) => event.preventDefault()))
    expect(await click()).toBeNull()
  })
}

test('a real click on a uPlot chart fires point-click and highlights the clicked series', async ({ page, scenario }) => {
  await scenario('empty')
  await mount(page, cases[0], '')
  const chart = page.locator('#subject')
  await chart.evaluate((element) => {
    const clicks: number[] = []
    element.addEventListener('point-click', (event) => clicks.push((event as CustomEvent<{ seriesIndex: number }>).detail.seriesIndex))
    ;(window as unknown as { clicks: number[] }).clicks = clicks
  })
  const box = await chart.locator('.plot').boundingBox()
  if (!box) throw new Error('the plot has no box')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 3 })
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await expect.poll(() => page.evaluate(() => (window as unknown as { clicks: number[] }).clicks.length)).toBe(1)
  const [seriesIndex] = await page.evaluate(() => (window as unknown as { clicks: number[] }).clicks)
  expect(await chart.evaluate((element) => (element as unknown as { highlighted: string | null }).highlighted)).toBe(['s0', 's1'][seriesIndex])
})

test('the release of a drag-to-zoom is not reported as a click', async ({ page, scenario }) => {
  await scenario('empty')
  await mount(page, cases[0], 'zoom')
  const chart = page.locator('#subject')
  await chart.evaluate((element) => {
    const clicks: number[] = []
    element.addEventListener('point-click', () => clicks.push(1))
    ;(window as unknown as { clicks: number[] }).clicks = clicks
  })
  const box = await chart.locator('.plot').boundingBox()
  if (!box) throw new Error('the plot has no box')
  await page.mouse.move(box.x + box.width / 3, box.y + box.height / 2, { steps: 3 })
  await page.mouse.down()
  await page.mouse.move(box.x + (box.width * 2) / 3, box.y + box.height / 2, { steps: 4 })
  await page.mouse.up()
  expect(await page.evaluate(() => (window as unknown as { clicks: number[] }).clicks)).toEqual([])
  expect(await chart.evaluate((element) => (element as unknown as { highlighted: string | null }).highlighted)).toBeNull()
})

test("a linked c2-chart-legend follows the chart's legend-action", async ({ page, scenario }) => {
  await scenario('empty')
  await page.evaluate((rows) => {
    const main = document.querySelector('main') as HTMLElement
    main.innerHTML = `
      <c2-line-chart id="subject" x-field="t" legend-action="highlight">
        <c2-chart-series field="s0" label="First"></c2-chart-series><c2-chart-series field="s1" label="Second"></c2-chart-series>
      </c2-line-chart>
      <c2-chart-legend for="subject"></c2-chart-legend>`
    ;(main.firstElementChild as HTMLElement & { data: unknown }).data = rows
  }, rows)
  const chart = page.locator('#subject')
  await expect(chart).toHaveAttribute('data-chart-ready', 'true')
  const legend = page.locator('c2-chart-legend')
  await legend.locator('.item').nth(1).click()
  await expect.poll(() => chart.evaluate((element) => (element as unknown as { highlighted: string | null }).highlighted)).toBe('s1')
  await expect(legend.locator('.item').nth(1)).toHaveAttribute('aria-pressed', 'true')
  await expect(legend.locator('.item').first()).toHaveClass(/item--dimmed/)
})

test('the default legend-action is highlight, and toggle still hides the clicked series', async ({ page, scenario }) => {
  await scenario('empty')
  await mount(page, cases[0], '')
  const chart = page.locator('#subject')
  await chart.locator('.legend-item').first().click()
  await expect.poll(() => chart.evaluate((element) => (element as unknown as { highlighted: string | null }).highlighted)).toBe('s0')
  await chart.locator('.legend-item').first().click()
  await chart.evaluate(async (element) => {
    element.setAttribute('legend-action', 'toggle')
    await (element as unknown as { updateComplete: Promise<boolean> }).updateComplete
  })
  await chart.locator('.legend-item').first().click()
  await expect(chart.locator('.legend-item').first()).toHaveAttribute('aria-pressed', 'false')
  await expect(chart.locator('.legend-item').first()).toHaveClass(/legend-item--dimmed/)
  expect(await chart.evaluate((element) => (element as unknown as { highlighted: string | null }).highlighted)).toBeNull()
})

test('on an area chart a click inside a fill picks that area, whichever band it is', async ({ page, scenario }) => {
  await scenario('empty')
  const rows = [
    { t: 1, s0: 10, s1: 20, s2: 30 },
    { t: 2, s0: 12, s1: 22, s2: 32 },
    { t: 3, s0: 11, s1: 21, s2: 31 },
  ]
  await page.evaluate((rows) => {
    const main = document.querySelector('main') as HTMLElement
    main.innerHTML =
      '<c2-area-chart id="subject" x-field="t" y-min="0" y-max="40"><c2-chart-series field="s0"></c2-chart-series><c2-chart-series field="s1"></c2-chart-series><c2-chart-series field="s2"></c2-chart-series></c2-area-chart>'
    ;(main.firstElementChild as HTMLElement & { data: unknown }).data = rows
  }, rows)
  const chart = page.locator('#subject')
  await expect(chart).toHaveAttribute('data-chart-ready', 'true')
  const over = await chart.locator('.u-over').boundingBox()
  if (!over) throw new Error('no plot overlay')
  const picked: (string | null)[] = []
  // At the middle x the lines sit at 11, 21 and 31 on a 0–40 scale; click halfway into each band.
  for (const value of [5, 16, 26]) {
    const x = over.x + over.width / 2
    const y = over.y + over.height * (1 - value / 40)
    await page.mouse.move(x, y, { steps: 2 })
    await page.mouse.click(x, y)
    picked.push(await chart.evaluate((element) => (element as unknown as { highlighted: string | null }).highlighted))
    await chart.evaluate((element) => (element as unknown as { highlight(key: null): void }).highlight(null))
  }
  expect(picked).toEqual(['s0', 's1', 's2'])
})

test('the cursor finds the right series on an auto-ranged chart too', async ({ page, scenario }) => {
  await scenario('empty')
  await page.evaluate(() => {
    const main = document.querySelector('main') as HTMLElement
    main.innerHTML =
      '<c2-area-chart id="subject" x-field="t" curve="smooth"><c2-chart-series field="s0"></c2-chart-series><c2-chart-series field="s1"></c2-chart-series><c2-chart-series field="s2"></c2-chart-series></c2-area-chart>'
    ;(main.firstElementChild as HTMLElement & { data: unknown }).data = [
      { t: 1, s0: 10, s1: 40, s2: 70 },
      { t: 2, s0: 12, s1: 42, s2: 72 },
      { t: 3, s0: 11, s1: 41, s2: 71 },
    ]
  })
  const chart = page.locator('#subject')
  await expect(chart).toHaveAttribute('data-chart-ready', 'true')
  await chart.evaluate((element) => {
    const seen: string[] = []
    element.addEventListener('point-hover', (event) => {
      const detail = (event as CustomEvent<{ series: { field: string } } | null>).detail
      if (detail) seen.push(detail.series.field)
    })
    ;(window as unknown as { seen: string[] }).seen = seen
  })
  const over = await chart.locator('.u-over').boundingBox()
  if (!over) throw new Error('no plot overlay')
  const at = async (fraction: number) => {
    await page.mouse.move(over.x + over.width / 2, over.y + over.height * fraction, { steps: 2 })
    return page.evaluate(() => (window as unknown as { seen: string[] }).seen.at(-1))
  }
  // Near the bottom is inside only the lowest fill; near the top, above every line, the nearest is the highest.
  expect(await at(0.97)).toBe('s0')
  expect(await at(0.03)).toBe('s2')
})
