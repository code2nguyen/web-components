import { test, expect } from './fixture'
import { niceScale } from '../src/chart-scale'
import { layoutPyramid, pyramidShapes, readableTextOn, roundedPolygonPath, spreadLabels } from '../src/pyramid-layout'

test('the chart family resolves first-paint theme probes without scheduling a second Lit update', async ({ page, scenario }) => {
  const warnings: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'warning' && message.text().includes('scheduled an update')) warnings.push(message.text())
  })

  await scenario('family')
  const charts = page.locator(
    'c2-line-chart, c2-area-chart, c2-bar-chart, c2-sparkline, c2-pie-chart, c2-gauge-chart, c2-radar-chart, c2-pyramid-chart, c2-scatter-chart, c2-candlestick-chart',
  )
  await expect(charts).toHaveCount(10)
  await expect.poll(() => charts.evaluateAll((elements) => elements.every((element) => element.matches(':state(ready)')))).toBe(true)
  expect(warnings.filter((warning) => warning.includes('c2-') && warning.includes('chart'))).toEqual([])

  const color = await page.locator('c2-line-chart').evaluate((element) => {
    const chart = element as unknown as { buildContext(): { theme: { color: string } } }
    return chart.buildContext().theme.color
  })
  expect(color).toBe('rgb(1, 2, 3)')
})

test('a runtime theme signal invalidates once and refreshes engine options', async ({ page, scenario }) => {
  await scenario('family')
  const chart = page.locator('c2-line-chart')
  await expect(chart).toHaveState('ready')
  const result = await chart.evaluate(async (element) => {
    const subject = element as unknown as {
      adapter: { setOptions(options: unknown, mode?: string): void }
      buildContext(): { theme: { color: string } }
      updateComplete: Promise<boolean>
    }
    const original = subject.adapter.setOptions.bind(subject.adapter)
    let calls = 0
    subject.adapter.setOptions = (options, mode) => {
      calls += 1
      original(options, mode)
    }
    element.style.setProperty('--c2-chart--color', 'rgb(9, 8, 7)')
    element.style.setProperty('--c2-chart__series-1--color', 'rgb(6, 5, 4)')
    window.dispatchEvent(new Event('c2n-theme-change'))
    await subject.updateComplete
    await new Promise((resolve) => requestAnimationFrame(resolve))
    const marker = element.shadowRoot?.querySelector('.legend-marker')
    return { calls, color: subject.buildContext().theme.color, legendColor: marker ? getComputedStyle(marker).backgroundColor : '' }
  })
  expect(result).toEqual({ calls: 1, color: 'rgb(9, 8, 7)', legendColor: 'rgb(6, 5, 4)' })
})

test('resolves relative font sizes and applies the axis-specific size in both engines', async ({ page, scenario }) => {
  await scenario('family')
  const result = await page.evaluate(async () => {
    document.documentElement.style.fontSize = '10px'
    const line = document.querySelector('c2-line-chart') as unknown as {
      style: CSSStyleDeclaration
      updateComplete: Promise<boolean>
      buildContext(): { theme: { fontSize: number; axisFontSize: number } }
      buildOptions(context: unknown): { axes: { font?: string }[] }
    }
    const scatter = document.querySelector('c2-scatter-chart') as unknown as {
      style: CSSStyleDeclaration
      updateComplete: Promise<boolean>
      buildContext(): unknown
      buildOptions(context: unknown): { xAxis: { axisLabel: { fontSize: number } } }
    }
    for (const chart of [line, scatter]) {
      chart.style.setProperty('--c2-chart--font-size', '1rem')
      chart.style.setProperty('--c2-chart__axis--font-size', '1.5rem')
    }
    window.dispatchEvent(new Event('c2n-theme-change'))
    await Promise.all([line.updateComplete, scatter.updateComplete])

    const lineContext = line.buildContext()
    const scatterContext = scatter.buildContext()
    return {
      fontSize: lineContext.theme.fontSize,
      axisFontSize: lineContext.theme.axisFontSize,
      uplotAxisFont: line.buildOptions(lineContext).axes[0].font,
      echartsAxisFontSize: scatter.buildOptions(scatterContext).xAxis.axisLabel.fontSize,
    }
  })

  expect(result).toEqual({ fontSize: 10, axisFontSize: 15, uplotAxisFont: '15px system-ui, sans-serif', echartsAxisFontSize: 15 })
})

test('chart public parts expose actions, shared state, legend, and tooltip regions', async ({ page, scenario }) => {
  await scenario('slots')
  await page.addStyleTag({
    content:
      'c2-line-chart::part(actions){background:rgb(1,2,3)}c2-line-chart::part(state){background:rgb(4,5,6)}c2-line-chart::part(legend){background:rgb(7,8,9)}c2-line-chart::part(tooltip){background:rgb(10,11,12)}c2-line-chart > *{color:rgb(13,14,15)}',
  })
  const chart = page.locator('c2-line-chart')
  for (const [part, color] of [
    ['actions', 'rgb(1, 2, 3)'],
    ['legend', 'rgb(7, 8, 9)'],
    ['tooltip', 'rgb(10, 11, 12)'],
  ] as const) {
    await expect(chart.locator(`[part="${part}"]`)).toHaveCSS('background-color', color)
  }
  await expect(chart.locator('[slot="actions"]')).toHaveCSS('color', 'rgb(13, 14, 15)')

  await scenario('empty')
  await page.addStyleTag({ content: 'c2-line-chart::part(state){background:rgb(4,5,6)}' })
  await expect(page.locator('c2-line-chart').locator('[part="state"]')).toHaveCSS('background-color', 'rgb(4, 5, 6)')
})

test('draws a line chart from series children and reports itself ready', async ({ page, scenario }) => {
  await scenario('default')
  const chart = page.locator('c2-line-chart')
  await expect(chart).toBeVisible()
  // The engine arrives through a dynamic import, so readiness is an explicit signal rather than a paint.
  await expect(chart).toHaveState('ready')
  await expect(chart).toHaveState('engine-uplot')
  // A reflected default is not written onto the host (it would fail SSR hydration), so it is read as a property.
  await expect(chart).toHaveJSProperty('animation', 'auto')
  // One canvas, created by the engine inside the plot container.
  expect(await chart.evaluate((element) => element.shadowRoot?.querySelectorAll('canvas').length)).toBe(1)
})

test('readiness and the engine are custom states: the host gains no attribute, and they clear on disconnect', async ({ page, scenario }) => {
  await scenario('default')
  const chart = page.locator('c2-line-chart')
  const authored = await chart.evaluate((element) => element.getAttributeNames().sort())
  await expect(chart).toHaveState('ready')
  await expect(chart).not.toHaveState('engine-echarts')
  expect(await chart.evaluate((element) => element.getAttributeNames().sort())).toEqual(authored)
  expect(authored).not.toContain('data-chart-ready')
  // The uPlot reveal still keys off the engine state.
  const reveal = await chart.evaluate((element) => getComputedStyle(element.shadowRoot!.querySelector('.u-under')!).animationName)
  expect(reveal).toBe('c2-chart-plot-reveal')

  const states = await chart.evaluate((element) => {
    const parent = element.parentNode!
    element.remove()
    const detached = [':state(ready)', ':state(engine-uplot)'].map((state) => element.matches(state))
    parent.append(element)
    return detached
  })
  expect(states).toEqual([false, false])
  // Reconnected, it draws again and says so the same way.
  await expect(chart).toHaveState('ready')
  await expect(chart).toHaveState('engine-uplot')
})

for (const tag of ['c2-line-chart', 'c2-bar-chart'])
  test(`${tag} names its x ticks after the label field instead of printing the x value`, async ({ page, scenario }) => {
    await scenario('family')
    const chart = page.locator(tag)
    await expect(chart).toHaveState('ready')
    type Subject = HTMLElement & { data: unknown; xField: string; labelField: string; formatAxisX(value: number): string }
    // The frame is rebuilt after the update that changes the data or its fields, so read the ticks until it lands.
    const ticks = () => chart.evaluate((element) => [2021, 2021.5, 2022].map((value) => (element as Subject).formatAxisX(value)))

    await chart.evaluate((element) => {
      const subject = element as Subject
      subject.xField = 'year'
      subject.data = [
        { year: 2021, revenue: 1 },
        { year: 2022, revenue: 2 },
      ]
    })
    await expect.poll(ticks).toEqual(['2,021', '2,021.5', '2,022'])

    await chart.evaluate((element) => {
      ;(element as Subject).labelField = 'year'
    })
    await expect.poll(ticks).toEqual(['2021', '', '2022'])
  })

test('reads a bare number array and infers the x axis', async ({ page, scenario }) => {
  await scenario('sparkline')
  const spark = page.locator('c2-sparkline')
  await expect(spark).toHaveState('ready')
  expect(await spark.evaluate((element) => element.shadowRoot?.querySelectorAll('canvas').length)).toBe(1)
})

test('gives a sparkline its whole box: no axis element, no reserved gutter', async ({ page, scenario }) => {
  await scenario('sparkline')
  const spark = page.locator('c2-sparkline')
  await expect(spark).toHaveState('ready')

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
  await expect(chart).toHaveState('ready')

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
  await expect(chart).toHaveState('ready')

  const result = await chart.evaluate(async (element) => {
    element.setAttribute('legend-action', 'toggle')
    await (element as unknown as { updateComplete: Promise<boolean> }).updateComplete
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
  await expect(chart).toHaveState('ready')
  const tooltipAttributes = await tooltip.evaluate((element) => element.getAttributeNames().sort())
  expect(tooltipAttributes).not.toContain('hidden')
  await expect(tooltip).toBeHidden()

  expect(await chart.evaluate((element) => element.shadowRoot?.querySelectorAll('.legend-item').length)).toBe(0)
  const labels = await legend.evaluate((element) => [...(element.shadowRoot?.querySelectorAll('.item') ?? [])].map((item) => item.textContent?.trim()))
  expect(labels).toEqual(['First', 'Second'])

  await chart.evaluate(async (element) => {
    element.setAttribute('legend-action', 'toggle')
    await (element as unknown as { updateComplete: Promise<boolean> }).updateComplete
  })
  await legend.evaluate((element) => (element.shadowRoot?.querySelector('.item') as HTMLButtonElement).click())
  await expect.poll(() => legend.evaluate((element) => element.shadowRoot?.querySelector('.item')?.getAttribute('aria-pressed'))).toBe('false')

  // The host also contains padding and a legend, so its geometric centre is not guaranteed to land on
  // uPlot's pointer surface. WebKit correctly emitted only the leave event when that happened. Target the
  // engine overlay itself so this tests the event contract rather than incidental chart layout.
  const box = await chart.locator('.u-over').boundingBox()
  if (!box) throw new Error('the chart plot has no box')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await expect(tooltip).toHaveState('open')
  await expect(tooltip).toBeVisible()
  expect(await tooltip.evaluate((element) => element.shadowRoot?.querySelectorAll('.row').length)).toBe(1)

  await page.mouse.move(box.x - 20, box.y - 20)
  await expect(tooltip).not.toHaveState('open')
  await expect(tooltip).toBeHidden()
  // Shown and hidden through a custom state: the host never gains a `hidden` attribute. (A floating tooltip's
  // `left`/`top` are written while the reader hovers, which is after the page is live.)
  expect(
    await tooltip.evaluate((element) =>
      element
        .getAttributeNames()
        .filter((name) => name !== 'style')
        .sort(),
    ),
  ).toEqual(tooltipAttributes)
})

test('keeps point-hover events available when the built-in tooltip is disabled', async ({ page, scenario }) => {
  await scenario('linked-chrome')
  const chart = page.locator('c2-line-chart')
  await expect(chart).toHaveState('ready')
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
  await expect(chart).toHaveState('ready')
  await expect(page.getByRole('button', { name: 'Export' })).toBeVisible()
})

test('draws a bar chart over category labels', async ({ page, scenario }) => {
  await scenario('bar')
  await expect(page.locator('c2-bar-chart')).toHaveState('ready')
})

test('reads the bar radius token and gives rounded bars their own path builder', async ({ page, scenario }) => {
  await scenario('rounded-bar')
  const chart = page.locator('c2-bar-chart')
  await expect(chart).toHaveState('ready')

  const result = await chart.evaluate((element) => {
    const bar = element as unknown as {
      buildContext(): { series: unknown[]; theme: { barRadius: number } }
      seriesStyle(series: unknown, index: number, context: unknown): { paths?: unknown }
    }
    const context = bar.buildContext()
    const rounded = bar.seriesStyle(context.series[0], 0, context).paths
    const square = bar.seriesStyle(context.series[0], 0, { ...context, theme: { ...context.theme, barRadius: 0 } }).paths
    return { radius: context.theme.barRadius, distinctBuilder: rounded !== square }
  })

  expect(result).toEqual({ radius: 0.5, distinctBuilder: true })
})

test('draws a donut through the ECharts engine', async ({ page, scenario }) => {
  await scenario('pie')
  const pie = page.locator('c2-pie-chart')
  await expect(pie).toHaveState('ready')
  expect(await pie.evaluate((element) => element.shadowRoot?.querySelectorAll('canvas').length)).toBeGreaterThan(0)
})

for (const [scenarioName, tag] of [
  ['gauge', 'c2-gauge-chart'],
  ['radar', 'c2-radar-chart'],
  ['pyramid', 'c2-pyramid-chart'],
  ['butterfly', 'c2-butterfly-chart'],
  ['scatter', 'c2-scatter-chart'],
  ['candlestick', 'c2-candlestick-chart'],
] as const) {
  test(`draws the ${scenarioName} through the ECharts engine`, async ({ page, scenario }) => {
    await scenario(scenarioName)
    const chart = page.locator(tag)
    await expect(chart).toHaveState('ready')
    expect(await chart.evaluate((element) => element.shadowRoot?.querySelectorAll('canvas').length)).toBeGreaterThan(0)
  })
}

test('fits the scatter axes to the data and themes the vertical grid lines', async ({ page, scenario }) => {
  await scenario('scatter')
  const scatter = page.locator('c2-scatter-chart')
  await expect(scatter).toHaveState('ready')
  const result = await scatter.evaluate(async (element) => {
    const chart = element as unknown as {
      style: CSSStyleDeclaration
      updateComplete: Promise<boolean>
      buildContext(): { theme: { gridColor: string } }
      buildOptions(context: unknown): Record<'xAxis' | 'yAxis', { scale?: boolean; splitLine?: { lineStyle?: { color?: string } } }>
    }
    chart.style.setProperty('--c2-chart__grid--color', 'rgb(1, 2, 3)')
    window.dispatchEvent(new Event('c2n-theme-change'))
    await chart.updateComplete
    const context = chart.buildContext()
    const { xAxis, yAxis } = chart.buildOptions(context)
    return { grid: context.theme.gridColor, x: [xAxis.scale, xAxis.splitLine?.lineStyle?.color], y: [yAxis.scale, yAxis.splitLine?.lineStyle?.color] }
  })
  expect(result).toEqual({ grid: 'rgb(1, 2, 3)', x: [true, 'rgb(1, 2, 3)'], y: [true, 'rgb(1, 2, 3)'] })
})

test('builds radar indicators and one profile per declared series', async ({ page, scenario }) => {
  await scenario('radar')
  const radar = page.locator('c2-radar-chart')
  await expect(radar).toHaveState('ready')
  await expect(radar).toHaveState('engine-echarts')

  const configuration = await radar.evaluate((element) => {
    const chart = element as unknown as {
      animation: string
      frame: unknown
      buildContext(): unknown
      buildOptions(context: unknown): {
        animationDurationUpdate: number
        radar: { shape: string; indicator: { name: string; min: number; max: number }[] }
      }
      projectData(frame: unknown, context: unknown): { name: string; value: (number | null)[] }[][]
    }
    const context = chart.buildContext()
    const options = chart.buildOptions(context)
    return {
      animation: chart.animation,
      animationDurationUpdate: options.animationDurationUpdate,
      radar: options.radar,
      data: chart.projectData(chart.frame, context),
    }
  })

  expect(configuration.animation).toBe('auto')
  expect(configuration.animationDurationUpdate).toBe(0)
  expect(configuration.radar.shape).toBe('circle')
  expect(configuration.radar.indicator).toEqual([
    { name: 'Quality', min: 0, max: 100 },
    { name: 'Speed', min: 0, max: 100 },
    { name: 'Reliability', min: 0, max: 100 },
    { name: 'Efficiency', min: 0, max: 100 },
    { name: 'Coverage', min: 0, max: 100 },
  ])
  expect(configuration.data).toEqual([[{ name: 'Current', value: [82, 74, 91, 68, 77] }], [{ name: 'Target', value: [90, 85, 88, 80, 84] }]])
})

test('supports disabling gauge marks from markup', async ({ page, scenario }) => {
  await scenario('gauge')
  const gaugeConfiguration = await page.locator('c2-gauge-chart').evaluate((element) => {
    const gauge = element as unknown as {
      pointer: string
      progress: string
      marks: string
      buildContext(): unknown
      seriesOption(
        index: number,
        context: unknown,
      ): {
        axisTick: { show: boolean }
        splitLine: { show: boolean }
        title: { offsetCenter: [number, string] }
        detail: { offsetCenter: [number, string]; formatter: (value: number) => string }
      }
    }
    const options = gauge.seriesOption(0, gauge.buildContext())
    return {
      pointer: gauge.pointer,
      progress: gauge.progress,
      marks: gauge.marks,
      axisTick: options.axisTick.show,
      splitLine: options.splitLine.show,
      titleOffset: options.title.offsetCenter,
      detailOffset: options.detail.offsetCenter,
      formatted: options.detail.formatter(26.22975242754607),
    }
  })
  expect(gaugeConfiguration).toEqual({
    pointer: 'none',
    progress: 'show',
    marks: 'none',
    axisTick: false,
    splitLine: false,
    titleOffset: [0, '25%'],
    detailOffset: [0, '-3%'],
    formatted: '26.2%',
  })
})

test('assembles the four normalized OHLC columns into one candlestick series', async ({ page, scenario }) => {
  await scenario('candlestick')
  const chart = page.locator('c2-candlestick-chart')
  await expect(chart).toHaveState('ready')
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
  await expect(chart).toHaveState('ready')

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
  await expect(chart).toHaveState('ready')
  const labels = await chart.evaluate((element) => [...(element.shadowRoot?.querySelectorAll('.legend-label') ?? [])].map((node) => node.textContent?.trim()))
  expect(labels).toEqual(['Revenue', 'Cost'])
})

test('actually paints the series onto the canvas', async ({ page, scenario }) => {
  await scenario('inferred')
  const chart = page.locator('c2-line-chart')
  await expect(chart).toHaveState('ready')

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
  await expect(chart).toHaveState('ready')

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
  await expect(chart).toHaveState('ready')

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
  await expect(chart).toHaveState('ready')

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
  await expect(chart).toHaveState('ready')

  // The inherited legend is one entry per series, and a pie has exactly one — so it used to read "Revenue"
  // above a four-slice donut.
  const labels = await chart.evaluate((element) => [...(element.shadowRoot?.querySelectorAll('.legend-label') ?? [])].map((node) => node.textContent?.trim()))
  expect(labels.length).toBeGreaterThan(1)

  await chart.evaluate(async (element) => {
    element.setAttribute('legend-action', 'toggle')
    await (element as unknown as { updateComplete: Promise<boolean> }).updateComplete
  })
  await chart.evaluate((element) => (element.shadowRoot?.querySelector('.legend-item') as HTMLElement | null)?.click())
  await expect
    .poll(() => chart.evaluate((element) => (element.shadowRoot?.querySelector('.legend-item') as HTMLElement | null)?.getAttribute('aria-pressed')))
    .toBe('false')
})

test('configures pie label content from markup', async ({ page, scenario }) => {
  await scenario('pie')
  const chart = page.locator('c2-pie-chart')
  await expect(chart).toHaveState('ready')

  const label = await chart.evaluate((element) => {
    const pie = element as unknown as {
      labels: string
      labelContent: string
      buildContext(): unknown
      seriesOption(index: number, context: unknown): { label: { show: boolean; position: string; formatter: string } }
    }
    const option = pie.seriesOption(0, pie.buildContext()).label
    return { labels: pie.labels, content: pie.labelContent, ...option }
  })

  expect(label).toMatchObject({ labels: 'outside', content: 'percent', show: true, position: 'outside', formatter: '{d}%' })
})

test('lays pyramid levels out by area, height, width or rank', () => {
  const values = [4870, 42, 1260, 318]
  const area = layoutPyramid(values, { sizing: 'area', sort: 'ascending' })
  // Smallest at the apex, and each level's share of the triangle's area is its share of the total.
  expect(area.map((level) => level.index)).toEqual([1, 3, 2, 0])
  const total = values.reduce((sum, value) => sum + value, 0)
  let cumulative = 0
  for (const level of area) {
    cumulative += level.value
    expect(level.depth).toBeCloseTo(level === area[area.length - 1] ? 1 : Math.sqrt(cumulative / total), 10)
  }
  expect(area.reduce((sum, level) => sum + (level.height ?? 0), 0)).toBeCloseTo(1, 10)

  const height = layoutPyramid(values, { sizing: 'height', sort: 'descending' })
  expect(height.map((level) => level.index)).toEqual([0, 2, 3, 1])
  expect(height[0].height).toBeCloseTo(4870 / total, 10)

  expect(layoutPyramid(values, { sizing: 'equal', sort: 'none' }).map((level) => [level.index, level.depth])).toEqual([
    [0, 0.25],
    [1, 0.5],
    [2, 0.75],
    [3, 1],
  ])

  // A width-sized pyramid is always ordered by value, so the sort is not honoured, and every level is one height.
  const width = layoutPyramid(values, { sizing: 'width', sort: 'descending' })
  expect(width.map((level) => level.index)).toEqual([1, 3, 2, 0])
  expect(width.every((level) => level.height === undefined)).toBe(true)
  expect(width[3].depth).toBe(1)

  // A flat top: with the apex as wide as the base, area and height are the same thing.
  const flat = layoutPyramid([1, 3], { sizing: 'area', sort: 'none', apexRatio: 1 })
  expect(flat[0].depth).toBeCloseTo(0.25, 10)

  // Empty, zero, negative and excluded rows are not drawn.
  expect(layoutPyramid([5, 0, -2, null, 3], { sizing: 'area', sort: 'none', exclude: new Set([4]) }).map((level) => level.index)).toEqual([0])
  expect(layoutPyramid([], { sizing: 'area', sort: 'ascending' })).toEqual([])
})

test('spreads pyramid labels apart and keeps them inside the plot', () => {
  // Three labels wanted almost on top of each other near the start, one far down: the first three are pushed apart.
  expect(spreadLabels([10, 12, 14, 200], [16, 16, 16, 16], 0, 240)).toEqual([10, 26, 42, 200])
  // Input order is kept, whatever order the centres come in.
  expect(spreadLabels([200, 12, 10], [16, 16, 16], 0, 240)).toEqual([200, 26, 10])
  // A crowd at the end is pulled back inside, dragging its neighbours along.
  expect(spreadLabels([230, 235, 238], [16, 16, 16], 0, 240)).toEqual([200, 216, 232])
})

test('picks a readable inside label colour against each level', () => {
  expect(readableTextOn('rgb(94, 234, 212)')).toBe('#18181b')
  expect(readableTextOn('rgb(15, 118, 110)')).toBe('#ffffff')
  expect(readableTextOn('#0265dc')).toBe('#ffffff')
  expect(readableTextOn('not a colour')).toBe('#ffffff')
})

test('outlines pyramid levels in pixels, for every apex, alignment and width', () => {
  const levels = layoutPyramid([1, 3], { sizing: 'area', sort: 'none' })
  const box = { x: 0, y: 0, width: 200, height: 100 }
  const top = pyramidShapes(levels, box, { apex: 'top', align: 'center', gap: 0, minSize: 0, maxSize: 200 })
  // The first level is a triangle at the top (its apex-side edge has no width), the second the trapezoid below it.
  expect(top[0].points).toEqual([
    [100, 0],
    [100, 0],
    [150, 50],
    [50, 50],
  ])
  expect(top[1].points).toEqual([
    [50, 50],
    [150, 50],
    [200, 100],
    [0, 100],
  ])
  expect(top[1]).toMatchObject({ centre: [100, 75], thickness: 50, width: 150, sides: [25, 175] })

  // Upside down, aligned to the end, with a gap: the point is at the bottom right and the levels are 10px apart.
  const bottom = pyramidShapes(levels, box, { apex: 'bottom', align: 'end', gap: 10, minSize: 0, maxSize: 200 })
  expect(bottom[0].points[0]).toEqual([200, 100])
  expect(bottom[1].points[0][1] - bottom[0].points[2][1]).toBe(-10)

  // On its side, pointing left, with a flat 40px apex.
  const left = pyramidShapes(levels, { x: 0, y: 0, width: 100, height: 200 }, { apex: 'left', align: 'center', gap: 0, minSize: 40, maxSize: 200 })
  expect(left[0].points.slice(0, 2)).toEqual([
    [0, 80],
    [0, 120],
  ])
  expect(left[1].points[2]).toEqual([100, 200])
})

test('rounds every corner of a level, and merges the corners of a point', () => {
  const square: [number, number][] = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
  ]
  expect(roundedPolygonPath(square, 0)).toBe('M0 0L10 0L10 10L0 10Z')
  expect(roundedPolygonPath(square, 2)).toBe('M0 2Q0 0 2 0L8 0Q10 0 10 2L10 8Q10 10 8 10L2 10Q0 10 0 8Z')
  // A radius longer than half a side is cut back to half of it.
  expect(roundedPolygonPath(square, 50)).toBe('M0 5Q0 0 5 0L5 0Q10 0 10 5L10 5Q10 10 5 10L5 10Q0 10 0 5Z')
  // An apex level's two top corners coincide: it is drawn as a rounded triangle, with three curves.
  const triangle = roundedPolygonPath(
    [
      [5, 0],
      [5, 0],
      [10, 10],
      [0, 10],
    ],
    2,
  )
  expect(triangle.match(/Q/g)).toHaveLength(3)
  expect(roundedPolygonPath([[0, 0]], 2)).toBe('')
})

test('draws pyramid levels as rounded paths in the layout order', async ({ page, scenario }) => {
  await scenario('pyramid')
  const chart = page.locator('c2-pyramid-chart')
  await expect(chart).toHaveState('ready')
  await expect(chart).toHaveState('engine-echarts')

  const read = (style: string) =>
    chart.evaluate((element, nextStyle) => {
      type Item = { children: { type: string; shape?: { pathData?: string }; style: { fill?: string } }[] } | null
      const pyramid = element as unknown as {
        frame: unknown
        buildContext(): { width: number; height: number }
        buildOptions(context: unknown): { series: { type: string; renderItem(params: { dataIndex: number }, api: object): Item }[] }
        projectData(frame: unknown, context: unknown): { name: string }[][]
        levelGeometry(width: number, height: number): { radius: number; shapes: { points: [number, number][] }[] }
      }
      element.setAttribute('style', nextStyle)
      const context = pyramid.buildContext()
      const [data] = pyramid.projectData(pyramid.frame, context)
      const series = pyramid.buildOptions(context).series
      const api = { getWidth: () => context.width, getHeight: () => context.height }
      const item = series[0].renderItem({ dataIndex: 3 }, api)
      const geometry = pyramid.levelGeometry(context.width, context.height)
      return {
        names: data.map((datum) => datum.name),
        types: series.map((entry) => entry.type),
        path: item?.children[0].shape?.pathData ?? '',
        radius: geometry.radius,
        // Each level's apex-side edge is the base-side edge of the level before it.
        stacked: geometry.shapes.every((shape, index) => index === 0 || shape.points[0][1] === geometry.shapes[index - 1].points[3][1]),
      }
    }, style)

  const rounded = await read('')
  expect(rounded.names).toEqual(['Enterprise', 'Business', 'Team', 'Starter'])
  expect(rounded.types).toEqual(['custom', 'custom'])
  expect(rounded.radius).toBe(4)
  expect(rounded.path).toMatch(/^M[\d. ]+Q/)
  expect(rounded.stacked).toBe(true)

  const sharp = await read('--c2-chart__level--border-radius: 0')
  expect(sharp.radius).toBe(0)
  expect(sharp.path).not.toContain('Q')
})

test('draws outside pyramid labels with their own series, spread clear of each other', async ({ page, scenario }) => {
  await scenario('pyramid')
  const chart = page.locator('c2-pyramid-chart')
  await expect(chart).toHaveState('ready')

  const result = await chart.evaluate((element) => {
    type Item = { children: { type: string; style: { text?: string; y?: number } }[] } | null
    const pyramid = element as unknown as {
      frame: unknown
      labels: string
      buildContext(): { width: number; height: number }
      buildOptions(context: unknown): { series: { type: string; renderItem(params: { dataIndex: number }, api: object): Item }[] }
      projectData(frame: unknown, context: unknown): unknown[][]
    }
    const read = () => {
      const context = pyramid.buildContext()
      const api = { getWidth: () => context.width, getHeight: () => context.height }
      const projected = pyramid.projectData(pyramid.frame, context)
      const series = pyramid.buildOptions(context).series
      const outside = series[1] ? projected[1].map((_, index) => series[1].renderItem({ dataIndex: index }, api)?.children[1].style) : []
      const inside = projected[0].map((_, index) => series[0].renderItem({ dataIndex: index }, api)?.children[1]?.style.text)
      return { series: series.length, outside, inside }
    }
    const outside = read()
    pyramid.labels = 'inside'
    const inside = read()
    return { outside, inside }
  })

  expect(result.outside.series).toBe(2)
  expect(result.outside.outside.map((label) => label?.text)).toEqual(['Enterprise · 42', 'Business · 318', 'Team · 1,260', 'Starter · 4,870'])
  const ys = result.outside.outside.map((label) => label?.y ?? 0)
  for (let index = 1; index < ys.length; index += 1) expect(ys[index] - ys[index - 1]).toBeGreaterThanOrEqual(12 * 1.35 - 0.001)
  expect(result.outside.inside).toEqual([undefined, undefined, undefined, undefined])
  // Inside, the apex level is too small to hold its text, so it is left to the tooltip.
  expect(result.inside.series).toBe(1)
  expect(result.inside.inside[0]).toBeUndefined()
  expect(result.inside.inside[3]).toBe('Starter · 4,870')
})

test('lays a pyramid on its side or upside down, and moves it across its axis', async ({ page, scenario }) => {
  await scenario('pyramid')
  const chart = page.locator('c2-pyramid-chart')
  await expect(chart).toHaveState('ready')

  const apexAt = (apex: string, style: string) =>
    chart.evaluate(
      (element, [nextApex, nextStyle]) => {
        const pyramid = element as unknown as {
          apex: string
          frame: unknown
          buildContext(): { width: number; height: number }
          projectData(frame: unknown, context: unknown): unknown
          levelGeometry(width: number, height: number): { shapes: { points: [number, number][] }[] }
        }
        pyramid.apex = nextApex
        element.setAttribute('style', nextStyle)
        const context = pyramid.buildContext()
        pyramid.projectData(pyramid.frame, context)
        const [x, y] = pyramid.levelGeometry(context.width, context.height).shapes[0].points[0]
        return { x: x / context.width, y: y / context.height }
      },
      [apex, style],
    )

  const round = (point: { x: number; y: number }) => ({ x: Math.round(point.x * 10) / 10, y: Math.round(point.y * 10) / 10 })
  // Labels sit to the right, so a centred upright pyramid's point is left of the middle, at the top.
  const top = round(await apexAt('top', ''))
  expect(top.y).toBe(0)
  expect(top.x).toBeLessThan(0.5)
  expect(round(await apexAt('bottom', '')).y).toBe(1)
  expect(round(await apexAt('start', '')).x).toBe(0)
  expect(round(await apexAt('end', '')).x).toBe(1)
  expect(round(await apexAt('start', 'direction: rtl')).x).toBe(1)
  // Aligned to the end, the labels move to the start side and the pyramid's right edge meets the plot's.
  expect((await apexAt('top', '--c2-chart__level--align: end')).x).toBeGreaterThan(0.9)
})

test('reports the clicked pyramid level by its data row', async ({ page, scenario }) => {
  await scenario('pyramid')
  const chart = page.locator('c2-pyramid-chart')
  await expect(chart).toHaveState('ready')

  // The base level is the widest and the easiest to hit: aim for its middle.
  const target = await chart.evaluate((element) => {
    const pyramid = element as unknown as {
      getPlotBounds(): DOMRect
      buildContext(): { width: number; height: number }
      levelGeometry(width: number, height: number): { shapes: { centre: [number, number] }[] }
    }
    const bounds = pyramid.getPlotBounds()
    const context = pyramid.buildContext()
    const shapes = pyramid.levelGeometry(context.width, context.height).shapes
    const [x, y] = shapes[shapes.length - 1].centre
    return { x: bounds.left + x, y: bounds.top + y }
  })
  await chart.evaluate((element) => {
    const events: unknown[] = []
    ;(element as unknown as { pointEvents: unknown[] }).pointEvents = events
    for (const type of ['point-hover', 'point-click']) element.addEventListener(type, (event) => events.push([type, (event as CustomEvent).detail]))
  })
  const events = () => chart.evaluate((element) => (element as unknown as { pointEvents: [string, unknown][] }).pointEvents)
  // The entry animation is still growing the levels, so hover until the base answers before clicking it.
  await expect
    .poll(async () => {
      await page.mouse.move(target.x, target.y)
      return (await events()).some(([type]) => type === 'point-hover')
    })
    .toBe(true)
  await page.mouse.click(target.x, target.y)
  // Starter is drawn last, at index 3; the events name its row, which is the first.
  await expect.poll(async () => (await events()).find(([type]) => type === 'point-click')?.[1]).toMatchObject({ index: 0, label: 'Starter', y: 4870 })
  expect((await events()).find(([type]) => type === 'point-hover')?.[1]).toMatchObject({ index: 0, label: 'Starter' })
  // A click on a level highlights it, as a click on a pie slice does.
  await expect.poll(() => chart.evaluate((element) => (element as unknown as { highlighted: string | null }).highlighted)).toBe('Starter')
})

test("lists a pyramid's levels in the legend, and highlights one by default", async ({ page, scenario }) => {
  await scenario('pyramid')
  const chart = page.locator('c2-pyramid-chart')
  await expect(chart).toHaveState('ready')

  const labels = await chart.evaluate((element) => [...(element.shadowRoot?.querySelectorAll('.legend-label') ?? [])].map((node) => node.textContent?.trim()))
  expect(labels).toEqual(['Starter', 'Enterprise', 'Team', 'Business'])

  await chart.locator('.legend-item').first().click()
  await expect.poll(() => chart.evaluate((element) => (element as unknown as { highlighted: string | null }).highlighted)).toBe('Starter')

  const opacities = await chart.evaluate((element) => {
    const pyramid = element as unknown as {
      frame: unknown
      buildContext(): unknown
      projectData(frame: unknown, context: unknown): { name: string; itemStyle: { opacity?: number } }[][]
    }
    const [data] = pyramid.projectData(pyramid.frame, pyramid.buildContext())
    return Object.fromEntries(data.map((datum) => [datum.name, datum.itemStyle.opacity ?? 1]))
  })
  // Every level is still drawn; only the others fade back.
  expect(opacities).toEqual({ Enterprise: 0.25, Business: 0.25, Team: 0.25, Starter: 1 })
})

test('with legend-action="toggle", hiding a pyramid level lays the rest out again', async ({ page, scenario }) => {
  await scenario('pyramid')
  const chart = page.locator('c2-pyramid-chart')
  await expect(chart).toHaveState('ready')
  await chart.evaluate((element) => element.setAttribute('legend-action', 'toggle'))

  await chart.locator('.legend-item').first().click()
  await expect(chart.locator('.legend-item').first()).toHaveAttribute('aria-pressed', 'false')

  const drawn = await chart.evaluate((element) => {
    const pyramid = element as unknown as {
      frame: unknown
      buildContext(): { width: number; height: number }
      projectData(frame: unknown, context: unknown): { name: string }[][]
      levelGeometry(width: number, height: number): { shapes: { points: [number, number][] }[] }
    }
    const context = pyramid.buildContext()
    const [data] = pyramid.projectData(pyramid.frame, context)
    const shapes = pyramid.levelGeometry(context.width, context.height).shapes
    const base = shapes[shapes.length - 1].points
    return { names: data.map((datum) => datum.name), baseWidth: base[2][0] - base[3][0], plotWidth: context.width }
  })
  expect(drawn.names).toEqual(['Enterprise', 'Business', 'Team'])
  // Team is the new base, as wide as the pyramid can be, so the three remaining levels still fill the triangle.
  expect(drawn.baseWidth).toBeGreaterThan(drawn.plotWidth * 0.3)
})

test("rounds a butterfly chart's shared scale to whole, even steps", () => {
  expect(niceScale(2950)).toEqual({ max: 3000, step: 1000 })
  expect(niceScale(3100)).toEqual({ max: 4000, step: 2000 })
  expect(niceScale(1100)).toEqual({ max: 1500, step: 500 })
  expect(niceScale(71)).toEqual({ max: 75, step: 25 })
  expect(niceScale(88)).toEqual({ max: 100, step: 50 })
  expect(niceScale(3000)).toEqual({ max: 3000, step: 1000 })
  expect(niceScale(0)).toEqual({ max: 1, step: 0.5 })
})

test('draws a butterfly chart as two mirrored plots on one scale, with the categories in the gutter', async ({ page, scenario }) => {
  await scenario('butterfly')
  const chart = page.locator('c2-butterfly-chart')
  await expect(chart).toHaveState('ready')
  await expect(chart).toHaveState('engine-echarts')

  const read = (style: string) =>
    chart.evaluate((element, nextStyle) => {
      type Axis = { inverse?: boolean; max: number; interval: number; gridIndex: number }
      type Category = { data: string[]; inverse: boolean; axisLabel: { show: boolean; margin?: number } }
      type Grid = { left: number; right: number }
      type Series = { type: string; xAxisIndex: number; itemStyle: { borderRadius: number[] } }
      const subject = element as unknown as {
        themeController: { invalidate(): void }
        buildContext(): { width: number }
        buildOptions(context: unknown): { grid: Grid[]; xAxis: Axis[]; yAxis: Category[]; series: Series[] }
      }
      element.setAttribute('style', nextStyle)
      // The bar radius is part of the cached theme, which a page's own theme signal refreshes.
      subject.themeController.invalidate()
      const context = subject.buildContext()
      const options = subject.buildOptions(context)
      return {
        width: context.width,
        grids: options.grid.map((grid) => [grid.left, grid.right]),
        inverse: options.xAxis.map((axis) => axis.inverse),
        max: options.xAxis.map((axis) => [axis.max, axis.interval]),
        categories: options.yAxis[0].data,
        labelled: options.yAxis.map((axis) => axis.axisLabel.show),
        margin: options.yAxis.find((axis) => axis.axisLabel.show)?.axisLabel.margin,
        series: options.series.map((series) => [series.type, series.xAxisIndex]),
        radius: options.series.map((series) => series.itemStyle.borderRadius.map((corner) => corner > 0)),
      }
    }, style)

  const ltr = await read('--c2-chart__bar--border-radius: 0.5')
  // The first series is the start side: on the left, its axis mirrored so it grows from the gutter outwards.
  expect(ltr.inverse).toEqual([true, false])
  expect(ltr.grids[0][0]).toBeLessThan(ltr.grids[1][0])
  // Both sides share one scale, rounded to even steps: the largest value is 2,950.
  expect(ltr.max).toEqual([
    [3000, 1000],
    [3000, 1000],
  ])
  expect(ltr.categories).toEqual(['60+', '40–59', '20–39', '0–19'])
  // Only the left plot's category axis is labelled, from its inner edge into the middle of the 56px gutter.
  expect(ltr.labelled).toEqual([true, false])
  expect(ltr.margin).toBe(28)
  expect(ltr.series).toEqual([
    ['bar', 0],
    ['bar', 1],
  ])
  // Each bar rounds its value end, away from the gutter.
  expect(ltr.radius).toEqual([
    [true, false, false, true],
    [false, true, true, false],
  ])

  // In a right-to-left page the start side is on the right.
  const rtl = await read('direction: rtl; --c2-chart__bar--border-radius: 0.5; --c2-chart__gutter--width: 80px')
  expect(rtl.inverse).toEqual([false, true])
  expect(rtl.grids[0][0]).toBeGreaterThan(rtl.grids[1][0])
  expect(rtl.labelled).toEqual([false, true])
  expect(rtl.margin).toBe(40)
  expect(rtl.radius[0]).toEqual([false, true, true, false])
})

test('rescales both sides of a butterfly chart when only the data changes', async ({ page, scenario }) => {
  await scenario('butterfly')
  const chart = page.locator('c2-butterfly-chart')
  await expect(chart).toHaveState('ready')
  const update = (rows: unknown[]) =>
    chart.evaluate(async (element, next) => {
      const subject = element as unknown as { updateData(rows: unknown[]): void; updateComplete: Promise<boolean> }
      subject.updateData(next)
      await subject.updateComplete
    }, rows)
  const rebuilds = () => page.evaluate(() => window.chartScenario.counts().setOptions)
  const before = await rebuilds()
  // The data path skips the option rebuild: a change within the scale must not ask for one, a change of scale must.
  await update([
    { age: 'young', men: 2400, women: 2900 },
    { age: 'old', men: 1200, women: 1900 },
  ])
  expect(await rebuilds()).toBe(before)
  await update([
    { age: 'young', men: 12, women: 9100 },
    { age: 'old', men: 40, women: 30 },
  ])
  await expect.poll(rebuilds).toBe(before + 1)
  const max = await chart.evaluate((element) => {
    const subject = element as unknown as { buildContext(): unknown; buildOptions(context: unknown): { xAxis: { max: number }[] } }
    return subject.buildOptions(subject.buildContext()).xAxis.map((axis) => axis.max)
  })
  expect(max).toEqual([10000, 10000])
})

test('a butterfly chart asks for two series, and draws only the first two of more', async ({ page, scenario }) => {
  await scenario('empty')
  const warnings: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'warning' && message.text().includes('c2-butterfly-chart')) warnings.push(message.text())
  })
  await page.evaluate(() => {
    const main = document.querySelector('main') as HTMLElement
    main.innerHTML = `
      <c2-butterfly-chart id="one" label-field="t"><c2-chart-series field="a"></c2-chart-series></c2-butterfly-chart>
      <c2-butterfly-chart id="three" label-field="t">
        <c2-chart-series field="a"></c2-chart-series><c2-chart-series field="b"></c2-chart-series><c2-chart-series field="c"></c2-chart-series>
      </c2-butterfly-chart>`
    for (const element of main.querySelectorAll<HTMLElement & { data: unknown }>('c2-butterfly-chart')) {
      element.data = [
        { t: 'x', a: 1, b: 2, c: 3 },
        { t: 'y', a: 4, b: 5, c: 6 },
      ]
    }
  })
  const one = page.locator('#one')
  await expect
    .poll(() => one.evaluate((element) => element.shadowRoot?.querySelector('.state')?.textContent?.trim()))
    .toBe('A butterfly chart needs two series, one for each side.')
  await expect(one).not.toHaveState('ready')

  const three = page.locator('#three')
  await expect(three).toHaveState('ready')
  const drawn = await three.evaluate((element) => {
    const subject = element as unknown as { buildContext(): unknown; buildOptions(context: unknown): { series: unknown[] }; getLegendItems(): unknown[] }
    return { series: subject.buildOptions(subject.buildContext()).series.length, legend: subject.getLegendItems().length }
  })
  expect(drawn).toEqual({ series: 2, legend: 2 })
  expect(warnings).toHaveLength(1)
})

test('drives the grid from markup in both directions', async ({ page, scenario }) => {
  await scenario('grid')
  const chart = page.locator('c2-line-chart')
  await expect(chart).toHaveState('ready')

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
  await expect(chart).toHaveState('ready')

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
  await expect(chart).toHaveState('ready')

  // The plot is absolutely positioned, so nothing inside the host contributes width. Without a declared
  // width the host collapses to its legend — and to zero when there is none, which renders nothing at all.
  const width = await chart.evaluate((element) => element.getBoundingClientRect().width)
  expect(width).toBeGreaterThan(600)
})

test('draws after a zero-width app shell becomes measurable', async ({ page, scenario }) => {
  await scenario('deferred-layout')
  const chart = page.locator('c2-line-chart')
  await expect(chart).toHaveState('ready')
  expect(await chart.evaluate((element) => element.shadowRoot?.querySelectorAll('canvas').length)).toBe(1)
})

test('shows a tooltip listing every series at the hovered position', async ({ page, scenario }) => {
  await scenario('two-series')
  const chart = page.locator('c2-line-chart')
  await expect(chart).toHaveState('ready')

  const tooltipVisible = () =>
    chart.evaluate((element) => {
      const tooltip = element.shadowRoot?.querySelector('.tooltip')
      return tooltip?.matches(':popover-open') ?? false
    })

  expect(await tooltipVisible()).toBe(false)

  const box = await chart.boundingBox()
  if (!box) throw new Error('the chart has no box')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)

  await expect.poll(tooltipVisible).toBe(true)

  const placement = await chart.evaluate((element) => {
    const tooltipElement = element.shadowRoot?.querySelector('.tooltip')
    const tooltip = tooltipElement?.getBoundingClientRect()
    return tooltip
      ? { top: tooltip.top, right: tooltip.right, bottom: tooltip.bottom, left: tooltip.left, popover: tooltipElement?.getAttribute('popover') }
      : null
  })
  expect(placement?.popover).toBe('manual')
  expect(placement?.top).toBeGreaterThanOrEqual(0)
  expect(placement?.left).toBeGreaterThanOrEqual(0)
  expect(placement?.right).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth))
  expect(placement?.bottom).toBeLessThanOrEqual(await page.evaluate(() => window.innerHeight))

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
  await expect(chart).toHaveState('ready')
  // No `legend` attribute is set in this scenario: a multi-series chart is unreadable without one.
  const labels = await chart.evaluate((element) => [...(element.shadowRoot?.querySelectorAll('.legend-label') ?? [])].map((node) => node.textContent?.trim()))
  expect(labels).toEqual(['Revenue', 'Cost'])

  await scenario('sparkline')
  const spark = page.locator('c2-sparkline')
  await expect(spark).toHaveState('ready')
  // A sparkline is defined by what it leaves out.
  expect(await spark.evaluate((element) => element.shadowRoot?.querySelectorAll('.legend-item').length)).toBe(0)
})

test('reads declared series on the first update, before any slotchange', async ({ page, scenario }) => {
  await scenario('default')
  const labels = await page.evaluate(async () => {
    const chart = document.createElement('c2-line-chart') as HTMLElement & { resolvedSeries: { label?: string }[]; updateComplete: Promise<boolean> }
    chart.innerHTML = '<c2-chart-series field="s0" label="Declared"></c2-chart-series>'
    ;(chart as unknown as { data: unknown }).data = [{ t: 0, s0: 1, s1: 2 }]
    document.querySelector('main')?.append(chart)
    await chart.updateComplete
    // Read synchronously after the first update: a slotchange would only arrive in a later task.
    return chart.resolvedSeries.map((series) => series.label)
  })
  expect(labels).toEqual(['Declared'])
})

test('a chart tooltip can be created with createElement, which rejects an element that writes its own attributes', async ({ page, scenario }) => {
  await scenario('default')
  const result = await page.evaluate(() => {
    const tooltip = document.createElement('c2-chart-tooltip')
    document.body.append(tooltip)
    return { attributes: tooltip.getAttributeNames(), display: getComputedStyle(tooltip).display }
  })
  expect(result).toEqual({ attributes: [], display: 'none' })
})
