/**
 * Scenario page for the chart suite.
 *
 * Charts load their engine through a dynamic `import()`, so `updateComplete` resolves long before
 * anything is drawn. Every scenario therefore waits for each chart's `chart-ready` before flagging the
 * page, and the specs additionally assert `data-chart-ready` on the element itself.
 *
 * The page also counts engine calls, which is what lets the perf spec assert the init/update split
 * without measuring wall-clock time.
 */
import '../src/line-chart'
import '../src/area-chart'
import '../src/bar-chart'
import '../src/sparkline'
import '../src/pie-chart'
import '../src/gauge-chart'
import '../src/radar-chart'
import '../src/scatter-chart'
import '../src/candlestick-chart'
import '../src/chart-series'
import '../src/chart-legend'
import '../src/chart-tooltip'
import type { ChartAdapter, ChartAdapterEvents } from '../src/chart-adapter'
import type { ChartBase } from '../src/chart-base'

import type { EngineCounts } from './scenario-api'

const counts: EngineCounts = { created: 0, setData: 0, setOptions: 0, resize: 0 }
let adapterEvents: ChartAdapterEvents | undefined

/**
 * Wraps the adapter an element creates so every engine call is counted. Patching the prototype keeps the
 * production code free of test hooks.
 */
function instrument(element: ChartBase): void {
  const target = element as unknown as { createAdapter(): Promise<ChartAdapter> }
  const original = target.createAdapter.bind(target)
  target.createAdapter = async () => {
    const adapter = await original()
    counts.created += 1
    const create = adapter.create.bind(adapter)
    adapter.create = (host, options, data, events) => {
      adapterEvents = events
      return create(host, options, data, events)
    }
    const setData = adapter.setData.bind(adapter)
    adapter.setData = (data) => {
      counts.setData += 1
      setData(data)
    }
    const setOptions = adapter.setOptions.bind(adapter)
    adapter.setOptions = (options, mode) => {
      counts.setOptions += 1
      setOptions(options, mode)
    }
    const resize = adapter.resize.bind(adapter)
    adapter.resize = (width, height) => {
      counts.resize += 1
      resize(width, height)
    }
    return adapter
  }
}

function series(count: number, length: number): Record<string, number>[] {
  return Array.from({ length }, (_, index) => {
    const row: Record<string, number> = { t: index }
    for (let s = 0; s < count; s += 1) row[`s${s}`] = Math.sin((index + s * 10) / 8) * 50 + 60 + s * 12
    return row
  })
}

const main = document.querySelector('main') as HTMLElement
const params = new URLSearchParams(location.search)
const scenario = params.get('scenario') ?? 'default'

/** Resolves once every chart on the page has drawn, or immediately when there are none. */
function whenDrawn(elements: Element[]): Promise<unknown> {
  return Promise.all(
    elements.map(
      (element) =>
        new Promise<void>((resolve) => {
          if (element.hasAttribute('data-chart-ready')) return resolve()
          element.addEventListener('chart-ready', () => resolve(), { once: true })
          // An empty, loading or error chart never draws; it is still a finished scenario.
          element.addEventListener('chart-error', () => resolve(), { once: true })
          setTimeout(resolve, 3000)
        }),
    ),
  )
}

function build(): void {
  switch (scenario) {
    case 'two-series':
      main.innerHTML = `
        <c2-line-chart id="chart" x-field="t" legend="bottom">
          <c2-chart-series field="s0" label="First"></c2-chart-series>
          <c2-chart-series field="s1" label="Second"></c2-chart-series>
        </c2-line-chart>`
      break
    case 'linked-chrome':
      main.innerHTML = `
        <c2-line-chart id="linked-chart" x-field="t">
          <c2-chart-series field="s0" label="First"></c2-chart-series>
          <c2-chart-series field="s1" label="Second"></c2-chart-series>
        </c2-line-chart>
        <c2-chart-legend for="linked-chart"></c2-chart-legend>
        <c2-chart-tooltip for="linked-chart" position="inline"></c2-chart-tooltip>`
      break
    case 'empty':
      main.innerHTML = `<c2-line-chart id="chart" data="[]"></c2-line-chart>`
      break
    case 'loading':
      main.innerHTML = `<c2-line-chart id="chart" loading></c2-line-chart>`
      break
    case 'error':
      main.innerHTML = `<c2-line-chart id="chart" error="Metrics unavailable"></c2-line-chart>`
      break
    case 'slots':
      main.innerHTML = `
        <c2-line-chart id="chart" x-field="t" legend="bottom">
          <c2-chart-series field="s0" label="First"></c2-chart-series>
          <span slot="empty">Nothing here</span>
          <div slot="actions"><button type="button">Export</button></div>
        </c2-line-chart>`
      break
    case 'sparkline':
      main.innerHTML = `<c2-sparkline id="chart" data="[1, 4, 2, 8, 5, 12]"></c2-sparkline>`
      break
    case 'bar':
      main.innerHTML = `
        <c2-bar-chart id="chart" label-field="team" x-type="category">
          <c2-chart-series field="shipped" label="Shipped"></c2-chart-series>
        </c2-bar-chart>`
      break
    case 'rounded-bar':
      main.innerHTML = `
        <c2-bar-chart id="chart" style="--c2-chart__bar--border-radius:0.5" label-field="team" x-type="category">
          <c2-chart-series field="shipped" label="Shipped"></c2-chart-series>
        </c2-bar-chart>`
      break
    case 'grouped-bars':
      // The first series is smaller than the second in every band: if the two were drawn on the same x
      // rather than side by side, the second would cover the first completely and its colour would vanish.
      main.innerHTML = `
        <c2-bar-chart id="chart" label-field="quarter" x-type="category" legend="none">
          <c2-chart-series field="small" label="Small" color="#0000ff"></c2-chart-series>
          <c2-chart-series field="large" label="Large" color="#ff0000"></c2-chart-series>
        </c2-bar-chart>`
      break
    case 'dual-axis':
      // Two quantities three orders of magnitude apart: on one scale the small one is a flat line.
      main.innerHTML = `
        <c2-line-chart id="chart" x-field="t" legend="none">
          <c2-chart-series field="revenue" label="Revenue"></c2-chart-series>
          <c2-chart-series field="rate" label="Rate" axis="right"></c2-chart-series>
        </c2-line-chart>`
      break
    case 'intraday':
      main.innerHTML = `<c2-line-chart id="chart" x-type="time" x-field="at" legend="none"><c2-chart-series field="v"></c2-chart-series></c2-line-chart>`
      break
    case 'pie':
      main.innerHTML = `
        <c2-pie-chart id="chart" label-field="channel" inner-radius="0.5" labels="outside" label-content="percent">
          <c2-chart-series field="revenue"></c2-chart-series>
        </c2-pie-chart>`
      break
    case 'gauge':
      main.innerHTML = `
        <c2-gauge-chart id="chart" label-field="metric" max="100" pointer="none" marks="none" precision="1" value-suffix="%">
          <c2-chart-series field="value" label="Attainment"></c2-chart-series>
        </c2-gauge-chart>`
      break
    case 'radar':
      main.innerHTML = `
        <c2-radar-chart id="chart" label-field="metric" max="100" shape="circle" points="none">
          <c2-chart-series field="current" label="Current"></c2-chart-series>
          <c2-chart-series field="target" label="Target"></c2-chart-series>
        </c2-radar-chart>`
      break
    case 'scatter':
      main.innerHTML = `
        <c2-scatter-chart id="chart" x-field="risk" symbol-size="14">
          <c2-chart-series field="return" label="Portfolio"></c2-chart-series>
        </c2-scatter-chart>`
      break
    case 'candlestick':
      main.innerHTML = `<c2-candlestick-chart id="chart" label-field="date"></c2-candlestick-chart>`
      break
    case 'inferred':
      // No series children at all: the chart must work out what to plot from the rows themselves.
      main.innerHTML = `<c2-line-chart id="chart" x-field="month"></c2-line-chart>`
      break
    case 'grid':
      // The scenario page loads no theme, so the grid colour is set here: without one the lines paint nothing
      // and the test could not tell `grid="y"` from `grid="none"`.
      main.innerHTML = `
        <c2-line-chart id="chart" style="--c2-chart__grid--color:#ff0000" x-field="month" legend="none">
          <c2-chart-series field="revenue"></c2-chart-series>
        </c2-line-chart>`
      break
    case 'stepped':
      // The path builder has to be in place for the very first frame, or this draws as a plain line.
      main.innerHTML = `
        <c2-line-chart id="chart" x-field="month" curve="step" legend="none">
          <c2-chart-series field="revenue" label="Revenue"></c2-chart-series>
        </c2-line-chart>`
      break
    case 'wrapped':
      // Mimics the docs site, where every element of an example is its own Astro island, so each
      // definition reaches the chart wrapped in one or more hosts rather than as a direct child.
      main.innerHTML = `
        <c2-line-chart id="chart" x-field="month" legend="bottom">
          <astro-island><c2-chart-series field="revenue" label="Revenue"></c2-chart-series></astro-island>
          <astro-island><c2-chart-series field="cost" label="Cost"></c2-chart-series></astro-island>
        </c2-line-chart>`
      break
    case 'centred':
      // The docs site centres every example in a flex frame, which makes the chart a flex item. The plot
      // is absolutely positioned and contributes no intrinsic width, so a chart that does not claim one
      // collapses to its legend — and with no legend, to nothing at all.
      main.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:center;width:900px">
          <c2-line-chart id="chart" x-field="month" legend="none"></c2-line-chart>
        </div>`
      break
    case 'deferred-layout':
      // Mirrors an island inside a responsive app shell: the chart connects while its container has no width,
      // then becomes measurable after the surrounding layout settles.
      main.innerHTML = `
        <div id="deferred-layout" style="width:0">
          <c2-line-chart id="chart" x-field="month" legend="none"></c2-line-chart>
        </div>`
      break
    case 'perf':
      main.innerHTML = `
        <c2-line-chart id="chart" x-field="t">
          <c2-chart-series field="s0"></c2-chart-series>
        </c2-line-chart>`
      break
    default:
      main.innerHTML = `
        <c2-line-chart id="chart" x-field="t">
          <c2-chart-series field="s0" label="First"></c2-chart-series>
        </c2-line-chart>`
  }

  const chart = main.querySelector(
    'c2-line-chart, c2-area-chart, c2-bar-chart, c2-sparkline, c2-pie-chart, c2-gauge-chart, c2-radar-chart, c2-scatter-chart, c2-candlestick-chart',
  ) as ChartBase | null
  if (!chart) return
  instrument(chart as unknown as ChartBase)

  if (scenario === 'bar' || scenario === 'rounded-bar') {
    chart.data = [
      { team: 'Core', shipped: 18 },
      { team: 'Web', shipped: 24 },
      { team: 'Infra', shipped: 11 },
    ]
  } else if (scenario === 'pie') {
    chart.data = [
      { channel: 'Direct', revenue: 4200 },
      { channel: 'Search', revenue: 3100 },
      { channel: 'Social', revenue: 1800 },
    ]
  } else if (scenario === 'gauge') {
    chart.data = [{ metric: 'Target', value: 78 }]
  } else if (scenario === 'radar') {
    chart.data = [
      { metric: 'Quality', current: 82, target: 90 },
      { metric: 'Speed', current: 74, target: 85 },
      { metric: 'Reliability', current: 91, target: 88 },
      { metric: 'Efficiency', current: 68, target: 80 },
      { metric: 'Coverage', current: 77, target: 84 },
    ]
  } else if (scenario === 'scatter') {
    chart.data = [
      { risk: 8, return: 6.2 },
      { risk: 12, return: 9.1 },
      { risk: 18, return: 11.8 },
      { risk: 23, return: 8.7 },
    ]
  } else if (scenario === 'candlestick') {
    chart.data = [
      { date: 'Mon', open: 182, close: 187, low: 180, high: 189 },
      { date: 'Tue', open: 187, close: 184, low: 182, high: 190 },
      { date: 'Wed', open: 184, close: 191, low: 183, high: 193 },
      { date: 'Thu', open: 191, close: 188, low: 186, high: 194 },
    ]
  } else if (scenario === 'dual-axis') {
    chart.data = [
      { t: 1, revenue: 1200, rate: 3.1 },
      { t: 2, revenue: 1450, rate: 3.4 },
      { t: 3, revenue: 1310, rate: 2.9 },
    ]
  } else if (scenario === 'intraday') {
    const base = Date.UTC(2024, 0, 1, 9)
    chart.data = Array.from({ length: 6 }, (_, index) => ({ at: base + index * 900_000, v: 10 + index }))
  } else if (scenario === 'grouped-bars') {
    chart.data = [
      { quarter: 'Q1', small: 20, large: 80 },
      { quarter: 'Q2', small: 25, large: 90 },
      { quarter: 'Q3', small: 15, large: 70 },
    ]
  } else if (scenario === 'grid' || scenario === 'stepped') {
    chart.data = [
      { month: 1, revenue: 20 },
      { month: 2, revenue: 60 },
      { month: 3, revenue: 40 },
    ]
  } else if (scenario === 'inferred' || scenario === 'wrapped' || scenario === 'centred' || scenario === 'deferred-layout') {
    chart.data = [
      { month: 1, revenue: 128, cost: 74 },
      { month: 2, revenue: 141, cost: 79 },
      { month: 3, revenue: 132, cost: 81 },
    ]
  } else if (scenario === 'perf') {
    chart.data = series(1, 100)
  } else if (!['empty', 'loading', 'error', 'sparkline'].includes(scenario)) {
    chart.data = series(2, 40)
  }

  if (scenario === 'deferred-layout') {
    requestAnimationFrame(() => {
      const container = document.querySelector<HTMLElement>('#deferred-layout')
      if (container) container.style.width = '900px'
    })
  }

  window.chartScenario = {
    counts: () => ({ ...counts }),
    append: (count: number) => {
      for (let index = 0; index < count; index += 1) {
        chart.appendPoint(1000 + index, [Math.random() * 100, Math.random() * 100])
      }
    },
    setData: (points: number) => {
      chart.data = series(1, points)
    },
    hover: (detail) => adapterEvents?.hover(detail),
    element: () => chart,
  }
}

build()

void whenDrawn(
  Array.from(
    main.querySelectorAll('c2-line-chart, c2-area-chart, c2-bar-chart, c2-sparkline, c2-pie-chart, c2-gauge-chart, c2-scatter-chart, c2-candlestick-chart'),
  ),
).then(() => {
  main.dataset.ready = 'true'
  document.documentElement.dataset.modulesReady = 'true'
})
