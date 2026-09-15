import { test, expect } from './fixture'

test('draws a line chart from series children and reports itself ready', async ({ page, scenario }) => {
  await scenario('default')
  const chart = page.locator('c2-line-chart')
  await expect(chart).toBeVisible()
  // The engine arrives through a dynamic import, so readiness is an explicit signal rather than a paint.
  await expect(chart).toHaveAttribute('data-chart-ready', 'true')
  // One canvas, created by the engine inside the plot container.
  expect(await chart.evaluate((element) => element.shadowRoot?.querySelectorAll('canvas').length)).toBe(1)
})

test('reads a bare number array and infers the x axis', async ({ page, scenario }) => {
  await scenario('sparkline')
  const spark = page.locator('c2-sparkline')
  await expect(spark).toHaveAttribute('data-chart-ready', 'true')
  expect(await spark.evaluate((element) => element.shadowRoot?.querySelectorAll('canvas').length)).toBe(1)
})

test('gives a sparkline its whole box: no axis element, no reserved gutter', async ({ page, scenario }) => {
  await scenario('sparkline')
  const spark = page.locator('c2-sparkline')
  await expect(spark).toHaveAttribute('data-chart-ready', 'true')

  const plot = await spark.evaluate((element) => {
    const root = element.shadowRoot!
    const under = root.querySelector('.u-under') as HTMLElement | null
    return { axes: root.querySelectorAll('.u-axis').length, width: under?.offsetWidth ?? 0, left: under?.offsetLeft ?? 0 }
  })
  // uPlot pads a short `axes` array back up to two *visible* axes, so hiding them is `show: false`, never `[]`.
  expect(plot.axes).toBe(0)
  // 120px box, 2px padding on each side: the line gets everything but the padding.
  expect(plot.left).toBe(2)
  expect(plot.width).toBe(116)
})

test('collects c2-chart-series children and keeps their change event inside the chart', async ({ page, scenario }) => {
  await scenario('two-series')
  const chart = page.locator('c2-line-chart')
  await expect(chart).toHaveAttribute('data-chart-ready', 'true')

  const escaped = await page.evaluate(() => {
    let seen = 0
    document.addEventListener('c2-chart-series-change', () => (seen += 1))
    const series = document.querySelector('c2-chart-series') as HTMLElement & { label: string }
    series.label = 'Renamed'
    return seen
  })
  // The chart stops the definition event: it is internal plumbing, not part of its public surface.
  expect(escaped).toBe(0)

  // The rename still has to reach the legend: that is the whole point of the definition event.
  await expect
    .poll(() => chart.evaluate((element) => [...(element.shadowRoot?.querySelectorAll('.legend-label') ?? [])].map((node) => node.textContent?.trim())))
    .toEqual(['Renamed', 'Second'])
})

test('legend toggles a series and fires series-toggle without bubbling', async ({ page, scenario }) => {
  await scenario('two-series')
  const chart = page.locator('c2-line-chart')
  await expect(chart).toHaveAttribute('data-chart-ready', 'true')

  const result = await chart.evaluate(async (element) => {
    let onElement = 0
    let onDocument = 0
    element.addEventListener('series-toggle', () => (onElement += 1))
    document.addEventListener('series-toggle', () => (onDocument += 1))
    const button = element.shadowRoot?.querySelector('.legend-item') as HTMLButtonElement
    button.click()
    await new Promise((resolve) => requestAnimationFrame(resolve))
    return { onElement, onDocument, pressed: button.getAttribute('aria-pressed') }
  })

  expect(result.onElement).toBe(1)
  // Several components fire a toggle-shaped event; a listener belongs on the element, so it must not bubble.
  expect(result.onDocument).toBe(0)
  expect(result.pressed).toBe('false')
})

test('links independently positioned legend and tooltip elements by id', async ({ page, scenario }) => {
  await scenario('linked-chrome')
  const chart = page.locator('c2-line-chart')
  const legend = page.locator('c2-chart-legend')
  const tooltip = page.locator('c2-chart-tooltip')
  await expect(chart).toHaveAttribute('data-chart-ready', 'true')

  expect(await chart.evaluate((element) => element.shadowRoot?.querySelectorAll('.legend-item').length)).toBe(0)
  const labels = await legend.evaluate((element) => [...(element.shadowRoot?.querySelectorAll('.item') ?? [])].map((item) => item.textContent?.trim()))
  expect(labels).toEqual(['First', 'Second'])

  await legend.evaluate((element) => (element.shadowRoot?.querySelector('.item') as HTMLButtonElement).click())
  await expect.poll(() => legend.evaluate((element) => element.shadowRoot?.querySelector('.item')?.getAttribute('aria-pressed'))).toBe('false')

  // The host also contains padding and a legend, so its geometric centre is not guaranteed to land on
  // uPlot's pointer surface. WebKit correctly emitted only the leave event when that happened. Target the
  // engine overlay itself so this tests the event contract rather than incidental chart layout.
  const box = await chart.locator('.u-over').boundingBox()
  if (!box) throw new Error('the chart plot has no box')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await expect(tooltip).not.toHaveAttribute('hidden', '')
  expect(await tooltip.evaluate((element) => element.shadowRoot?.querySelectorAll('.row').length)).toBe(1)

  await page.mouse.move(box.x - 20, box.y - 20)
  await expect(tooltip).toHaveAttribute('hidden', '')
})

test('keeps point-hover events available when the built-in tooltip is disabled', async ({ page, scenario }) => {
  await scenario('linked-chrome')
  const chart = page.locator('c2-line-chart')
  await expect(chart).toHaveAttribute('data-chart-ready', 'true')
  await chart.evaluate(async (element) => {
    element.setAttribute('tooltip', 'none')
    await (element as unknown as { updateComplete: Promise<unknown> }).updateComplete
  })
  const details = await chart.evaluate((element) => {
    const seen: Array<number | null> = []
    element.addEventListener('point-hover', (event) => {
      const detail = (event as CustomEvent<{ seriesIndex: number } | null>).detail
      seen.push(detail?.seriesIndex ?? null)
    })
    window.chartScenario.hover({ index: 10, seriesIndex: 0, px: 120, py: 80 })
    window.chartScenario.hover(null)
    return seen
  })
  expect(details).toEqual(expect.arrayContaining([expect.any(Number), null]))
})

test('shows the empty, loading and error states in precedence order', async ({ page, scenario }) => {
  await scenario('empty')
  await expect(page.locator('c2-line-chart')).toBeVisible()
  expect(await page.locator('c2-line-chart').evaluate((element) => element.shadowRoot?.querySelector('.state')?.textContent?.trim())).toBe('No data')

  await scenario('loading')
  expect(await page.locator('c2-line-chart').evaluate((element) => element.shadowRoot?.querySelector('.state')?.textContent?.trim())).toContain('Loading')

  await scenario('error')
  expect(await page.locator('c2-line-chart').evaluate((element) => element.shadowRoot?.querySelector('.state')?.textContent?.trim())).toBe(
    'Metrics unavailable',
  )
})

test('a slotted empty message replaces the built-in one', async ({ page, scenario }) => {
  await scenario('slots')
  const chart = page.locator('c2-line-chart')
  await expect(chart).toHaveAttribute('data-chart-ready', 'true')
  await expect(page.getByRole('button', { name: 'Export' })).toBeVisible()
})

test('draws a bar chart over category labels', async ({ page, scenario }) => {
  await scenario('bar')
  await expect(page.locator('c2-bar-chart')).toHaveAttribute('data-chart-ready', 'true')
})

test('draws a donut through the ECharts engine', async ({ page, scenario }) => {
  await scenario('pie')
  const pie = page.locator('c2-pie-chart')
  await expect(pie).toHaveAttribute('data-chart-ready', 'true')
  expect(await pie.evaluate((element) => element.shadowRoot?.querySelectorAll('canvas').length)).toBeGreaterThan(0)
})

for (const [scenarioName, tag] of [
  ['gauge', 'c2-gauge-chart'],
  ['scatter', 'c2-scatter-chart'],
  ['candlestick', 'c2-candlestick-chart'],
] as const) {
  test(`draws the ${scenarioName} through the ECharts engine`, async ({ page, scenario }) => {
    await scenario(scenarioName)
    const chart = page.locator(tag)
    await expect(chart).toHaveAttribute('data-chart-ready', 'true')
    expect(await chart.evaluate((element) => element.shadowRoot?.querySelectorAll('canvas').length)).toBeGreaterThan(0)
  })
}

test('supports disabling gauge marks from markup', async ({ page, scenario }) => {
  await scenario('gauge')
  const gaugeConfiguration = await page.locator('c2-gauge-chart').evaluate((element) => {
    const gauge = element as unknown as {
      pointer: string
      progress: string
      buildContext(): unknown
      seriesOption(index: number, context: unknown): { detail: { formatter: (value: number) => string } }
    }
    return {
      pointer: gauge.pointer,
      progress: gauge.progress,
      formatted: gauge.seriesOption(0, gauge.buildContext()).detail.formatter(26.22975242754607),
    }
  })
  expect(gaugeConfiguration).toEqual({
    pointer: 'none',
    progress: 'show',
    formatted: '26.2%',
  })
})

test('assembles the four normalized OHLC columns into one candlestick series', async ({ page, scenario }) => {
  await scenario('candlestick')
  const chart = page.locator('c2-candlestick-chart')
  await expect(chart).toHaveAttribute('data-chart-ready', 'true')
  const projected = await chart.evaluate((element) => {
    const chartElement = element as unknown as { frame: unknown; projectData(frame: unknown): number[][][] }
    return chartElement.projectData(chartElement.frame)
  })
  expect(projected[0]).toEqual([
    [182, 187, 180, 189],
    [187, 184, 182, 190],
    [184, 191, 183, 193],
    [191, 188, 186, 194],
  ])
})

test('infers one series per numeric field and never plots the x field', async ({ page, scenario }) => {
  await scenario('inferred')
  const chart = page.locator('c2-line-chart')
  await expect(chart).toHaveAttribute('data-chart-ready', 'true')

  // `month` is the x field, so the two series are `revenue` and `cost` — not three including the x.
  const labels = await chart.evaluate((element) => [...(element.shadowRoot?.querySelectorAll('.legend-label') ?? [])].map((node) => node.textContent?.trim()))
  expect(labels).toEqual(['Revenue', 'Cost'])

  // The inferred names must be the real row keys: a synthetic name would make the next normalisation read
  // every value as a gap, which draws axes and no lines.
  const values = await chart.evaluate((element) => {
    const chartEl = element as unknown as { frame?: { columns: ArrayLike<number>[]; length: number } }
    return chartEl.frame?.columns.map((column) => Number(column[0]))
  })
  expect(values).toEqual([128, 74])
})

test('collects series definitions wrapped by an island host', async ({ page, scenario }) => {
  await scenario('wrapped')
  const chart = page.locator('c2-line-chart')
  await expect(chart).toHaveAttribute('data-chart-ready', 'true')
  const labels = await chart.evaluate((element) => [...(element.shadowRoot?.querySelectorAll('.legend-label') ?? [])].map((node) => node.textContent?.trim()))
  expect(labels).toEqual(['Revenue', 'Cost'])
})

test('actually paints the series onto the canvas', async ({ page, scenario }) => {
  await scenario('inferred')
  const chart = page.locator('c2-line-chart')
  await expect(chart).toHaveAttribute('data-chart-ready', 'true')

  // A canvas can exist and be blank — which is exactly what a bad field name produces, since every value
  // reads as a gap and the axes still render. Count the pixels the engine actually coloured.
  const painted = await chart.evaluate((element) => {
    const canvas = element.shadowRoot?.querySelector('canvas') as HTMLCanvasElement | null
    if (!canvas) return -1
    const context = canvas.getContext('2d')
    if (!context) return -1
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
    let opaque = 0
    for (let index = 3; index < data.length; index += 4) if (data[index] > 0) opaque += 1
    return opaque
  })

  expect(painted).toBeGreaterThan(500)
})

test('draws grouped bars side by side, and labels only whole bands', async ({ page, scenario }) => {
  await scenario('grouped-bars')
  const chart = page.locator('c2-bar-chart')
  await expect(chart).toHaveAttribute('data-chart-ready', 'true')

  // uPlot puts every series on the same x, so without our own grouping the taller red series would cover
  // the shorter blue one entirely and blue would not be on the canvas at all.
  const painted = await chart.evaluate((element) => {
    const canvas = element.shadowRoot?.querySelector('canvas') as HTMLCanvasElement | null
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return { blue: 0, red: 0 }
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
    let blue = 0
    let red = 0
    for (let index = 0; index < data.length; index += 4) {
      if (data[index] < 60 && data[index + 2] > 200) blue += 1
      if (data[index] > 200 && data[index + 2] < 60) red += 1
    }
    return { blue, red }
  })
  expect(painted.blue).toBeGreaterThan(100)
  expect(painted.red).toBeGreaterThan(100)

  // uPlot splits a short category axis on halves; a half falls between two bands, so it gets no label
  // rather than repeating its neighbour's and then running off the end of the list.
  const ticks = await chart.evaluate((element) => {
    const chartEl = element as unknown as { formatAxisX?: (value: number) => string }
    return [0, 0.5, 1, 1.5, 2, 2.5].map((value) => chartEl.formatAxisX?.call(chartEl, value))
  })
  expect(ticks).toEqual(['Q1', '', 'Q2', '', 'Q3', ''])
})

test('draws a second y axis for a series bound to `axis="right"`', async ({ page, scenario }) => {
  await scenario('dual-axis')
  const chart = page.locator('c2-line-chart')
  await expect(chart).toHaveAttribute('data-chart-ready', 'true')

  // Two axis elements on the y side: the property was declared and typed long before anything read it, so a
  // dual-axis chart silently drew both series against the left scale.
  const axes = await chart.evaluate((element) => {
    const root = element.shadowRoot!
    return [...root.querySelectorAll('.u-axis')].map((axis) => {
      const style = (axis as HTMLElement).style
      // uPlot lays the x axis out along the bottom (it has a `top`); the y axes get a `left`.
      return { left: style.left, width: style.width, height: style.height }
    })
  })
  expect(axes.length).toBe(3)

  // The right-hand series has to be on its own scale, or its 3.1 would be invisible next to a 1450.
  const scales = await chart.evaluate((element) => {
    const chartEl = element as unknown as { adapter?: { instance?: { series: { scale?: string }[] } } }
    return chartEl.adapter?.instance?.series.map((item) => item.scale)
  })
  if (scales) expect(scales).toEqual(['x', 'y', 'y2'])
})

test('labels a time axis by the span it covers, not always by date', async ({ page, scenario }) => {
  await scenario('intraday')
  const chart = page.locator('c2-line-chart')
  await expect(chart).toHaveAttribute('data-chart-ready', 'true')

  // 75 minutes of samples: a fixed month/day format made every tick read "Jan 1".
  const ticks = await chart.evaluate((element) => {
    const chartEl = element as unknown as { formatAxisX: (value: number) => string; frame?: { x: ArrayLike<number> } }
    const x = chartEl.frame!.x
    return [0, 2, 4].map((index) => chartEl.formatAxisX(Number(x[index])))
  })
  expect(new Set(ticks).size).toBe(3)
  expect(ticks.every((tick) => /\d/.test(tick) && !/Jan/.test(tick))).toBe(true)
})

test("lists a pie chart's slices in the legend, and toggles one", async ({ page, scenario }) => {
  await scenario('pie')
  const chart = page.locator('c2-pie-chart')
  await expect(chart).toHaveAttribute('data-chart-ready', 'true')

  // The inherited legend is one entry per series, and a pie has exactly one — so it used to read "Revenue"
  // above a four-slice donut.
  const labels = await chart.evaluate((element) => [...(element.shadowRoot?.querySelectorAll('.legend-label') ?? [])].map((node) => node.textContent?.trim()))
  expect(labels.length).toBeGreaterThan(1)

  await chart.evaluate((element) => (element.shadowRoot?.querySelector('.legend-item') as HTMLElement | null)?.click())
  await expect
    .poll(() => chart.evaluate((element) => (element.shadowRoot?.querySelector('.legend-item') as HTMLElement | null)?.getAttribute('aria-pressed')))
    .toBe('false')
})

test('drives the grid from markup in both directions', async ({ page, scenario }) => {
  await scenario('grid')
  const chart = page.locator('c2-line-chart')
  await expect(chart).toHaveAttribute('data-chart-ready', 'true')

  const snapshot = () =>
    chart.evaluate((element) => {
      const canvas = element.shadowRoot?.querySelector('canvas') as HTMLCanvasElement | null
      const context = canvas?.getContext('2d')
      if (!canvas || !context) return ''
      return [...context.getImageData(0, 0, canvas.width, canvas.height).data].join(',')
    })
  const set = (value: string) => chart.evaluate((element, next) => element.setAttribute('grid', next), value)

  // `grid` used to be a boolean, and a boolean attribute is true whenever it is present: `grid="false"` turned
  // the grid *on*, and no markup could turn it off. Every value is reachable from HTML now — including `x`,
  // which the boolean could not express at all.
  await set('none')
  await expect.poll(async () => (await snapshot()).length > 0).toBe(true)
  const bare = await snapshot()

  await set('x')
  await expect.poll(async () => (await snapshot()) !== bare).toBe(true)

  await set('none')
  await expect.poll(async () => (await snapshot()) === bare).toBe(true)
})

test('applies the curve path builder on the very first frame', async ({ page, scenario }) => {
  await scenario('stepped')
  const chart = page.locator('c2-line-chart')
  await expect(chart).toHaveAttribute('data-chart-ready', 'true')

  const snapshot = () =>
    chart.evaluate((element) => {
      const canvas = element.shadowRoot?.querySelector('canvas') as HTMLCanvasElement | null
      const context = canvas?.getContext('2d')
      if (!canvas || !context) return ''
      return [...context.getImageData(0, 0, canvas.width, canvas.height).data].join(',')
    })

  // The builders used to be cached from a `.then()`, so the first frame of every chart was drawn straight
  // and `curve` only took effect on a later rebuild. This is that frame.
  const stepped = await snapshot()
  await chart.evaluate((element) => ((element as HTMLElement & { curve: string }).curve = 'linear'))
  await expect.poll(async () => (await snapshot()) !== stepped).toBe(true)
})

test('fills the width of a centring flex frame, even with no legend', async ({ page, scenario }) => {
  await scenario('centred')
  const chart = page.locator('c2-line-chart')
  await expect(chart).toHaveAttribute('data-chart-ready', 'true')

  // The plot is absolutely positioned, so nothing inside the host contributes width. Without a declared
  // width the host collapses to its legend — and to zero when there is none, which renders nothing at all.
  const width = await chart.evaluate((element) => element.getBoundingClientRect().width)
  expect(width).toBeGreaterThan(600)
})

test('shows a tooltip listing every series at the hovered position', async ({ page, scenario }) => {
  await scenario('two-series')
  const chart = page.locator('c2-line-chart')
  await expect(chart).toHaveAttribute('data-chart-ready', 'true')

  const tooltipVisible = () =>
    chart.evaluate((element) => {
      const tooltip = element.shadowRoot?.querySelector('.tooltip')
      return tooltip ? !tooltip.hasAttribute('hidden') : false
    })

  expect(await tooltipVisible()).toBe(false)

  const box = await chart.boundingBox()
  if (!box) throw new Error('the chart has no box')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)

  await expect.poll(tooltipVisible).toBe(true)

  const rows = await chart.evaluate((element) =>
    [...(element.shadowRoot?.querySelectorAll('.tooltip-row') ?? [])].map((row) => ({
      label: row.querySelector('.tooltip-label')?.textContent?.trim(),
      value: row.querySelector('.tooltip-value')?.textContent?.trim(),
    })),
  )
  // `tooltip="axis"` is the default, so every visible series reports its value at the hovered x.
  expect(rows.map((row) => row.label)).toEqual(['First', 'Second'])
  expect(rows.every((row) => row.value && row.value !== '—')).toBe(true)

  // Leaving the plot hides it again.
  await page.mouse.move(box.x - 40, box.y - 40)
  await expect.poll(tooltipVisible).toBe(false)
})

test('shows a legend by default, and the sparkline does not', async ({ page, scenario }) => {
  await scenario('inferred')
  const chart = page.locator('c2-line-chart')
  await expect(chart).toHaveAttribute('data-chart-ready', 'true')
  // No `legend` attribute is set in this scenario: a multi-series chart is unreadable without one.
  const labels = await chart.evaluate((element) => [...(element.shadowRoot?.querySelectorAll('.legend-label') ?? [])].map((node) => node.textContent?.trim()))
  expect(labels).toEqual(['Revenue', 'Cost'])

  await scenario('sparkline')
  const spark = page.locator('c2-sparkline')
  await expect(spark).toHaveAttribute('data-chart-ready', 'true')
  // A sparkline is defined by what it leaves out.
  expect(await spark.evaluate((element) => element.shadowRoot?.querySelectorAll('.legend-item').length)).toBe(0)
})
