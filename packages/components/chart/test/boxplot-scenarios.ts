/** Scenario page for the box plot suite: one case per input shape and layout, with service latency samples. */
import '../src/boxplot-chart'
import * as stats from '../src/boxplot-stats'
import type { ChartAdapter, ChartAdapterEvents } from '../src/chart-adapter'
import type { BoxplotChart } from '../src/boxplot-chart'
import './boxplot-scenario-api'

let adapterEvents: ChartAdapterEvents | undefined

/** Captures the engine callbacks, so a spec can hover a box by index without aiming a pointer at a canvas. */
function instrument(element: BoxplotChart): void {
  const target = element as unknown as { createAdapter(): Promise<ChartAdapter> }
  const original = target.createAdapter.bind(target)
  target.createAdapter = async () => {
    const adapter = await original()
    const create = adapter.create.bind(adapter)
    adapter.create = (host, options, data, events) => {
      adapterEvents = events
      return create(host, options, data, events)
    }
    return adapter
  }
}

/** p50 latency samples per service, in ms. Checkout: Q1 240, median 310, Q3 420, whiskers 150–680, four outliers. */
const LATENCY: Record<string, number[]> = {
  'api-gateway': [38, 52, 60, 66, 70, 74, 78, 82, 86, 92, 98, 104, 112, 124, 140, 166, 240, 270],
  auth: [22, 30, 34, 38, 40, 42, 44, 46, 48, 52, 56, 62, 72, 86, 132],
  search: [96, 130, 150, 168, 180, 196, 214, 230, 250, 270, 276, 300, 340, 440, 610, 655, 700],
  checkout: [150, 175, 195, 210, 228, 240, 256, 270, 284, 298, 310, 334, 352, 371, 396, 420, 680, 905, 980, 1120, 1320],
  payments: [118, 150, 180, 190, 205, 218, 228, 240, 260, 282, 292, 330, 380, 446, 688],
  inventory: [44, 60, 70, 74, 80, 88, 94, 100, 110, 122, 128, 150, 180, 198],
}

const SAMPLES = Object.entries(LATENCY).map(([service, latency]) => ({ service, latency }))

/** The same services in two regions; eu-west runs a little slower. */
const REGIONS = Object.entries(LATENCY)
  .filter(([service]) => service !== 'auth')
  .map(([service, latency]) => ({ service, east: latency, west: latency.map((value) => Math.round(value * 1.12 + 18)) }))

/** One row per request: rows with the same label pool their samples. */
const LONG = [
  { route: '/cart', ms: 120 },
  { route: '/search', ms: 80 },
  { route: '/cart', ms: 140 },
  { route: '/cart', ms: 100 },
  { route: '/search', ms: 60 },
  { route: '/cart', ms: 160 },
  { route: '/search', ms: 100 },
  { route: '/search', ms: 40 },
  { route: '/cart', ms: 'n/a' },
]

/** Percentiles as a metrics backend returns them: no samples, drawn as given. */
const SUMMARIES = [
  { service: 'checkout', p: { min: 150, q1: 240, median: 310, q3: 420, max: 680, outliers: [905, 1320], count: 1240 } },
  { service: 'search', p: { min: 96, q1: 168, median: 214, q3: 276, max: 440, count: 980 } },
]

/** Exam scores by class, with the mean marked and min–max whiskers. */
const SCORES = [
  { class: 'A', score: [52, 61, 64, 70, 72, 75, 78, 81, 85, 93] },
  { class: 'B', score: [40, 55, 58, 66, 68, 70, 74, 79, 88, 99] },
]

const main = document.querySelector('main') as HTMLElement
const params = new URLSearchParams(location.search)
const scenario = params.get('scenario') ?? 'latency'

switch (scenario) {
  case 'grouped':
    main.innerHTML = `<c2-boxplot-chart label-field="service" value-suffix=" ms">
      <c2-chart-series field="east" label="us-east"></c2-chart-series>
      <c2-chart-series field="west" label="eu-west"></c2-chart-series>
    </c2-boxplot-chart>`
    break
  case 'horizontal':
    main.innerHTML = `<c2-boxplot-chart label-field="service" value-suffix=" ms" orientation="horizontal"
      reference-lines='[{"value":500,"label":"SLO 500 ms","tone":"danger"},{"value":"oops"}]'>
      <c2-chart-series field="latency" label="p50 latency"></c2-chart-series>
    </c2-boxplot-chart>`
    break
  case 'long':
    main.innerHTML = `<c2-boxplot-chart label-field="route" value-suffix=" ms"><c2-chart-series field="ms" label="Latency"></c2-chart-series></c2-boxplot-chart>`
    break
  case 'summary':
    main.innerHTML = `<c2-boxplot-chart label-field="service" value-suffix=" ms"><c2-chart-series field="p" label="p50 latency"></c2-chart-series></c2-boxplot-chart>`
    break
  case 'scores':
    main.innerHTML = `<c2-boxplot-chart label-field="class" whiskers="range" mean="show" precision="1"></c2-boxplot-chart>`
    break
  case 'empty':
    main.innerHTML = `<c2-boxplot-chart label-field="service"><c2-chart-series field="latency"></c2-chart-series></c2-boxplot-chart>`
    break
  default:
    main.innerHTML = `<c2-boxplot-chart label-field="service" value-suffix=" ms">
      <c2-chart-series field="latency" label="p50 latency"></c2-chart-series>
    </c2-boxplot-chart>`
}

const chart = main.querySelector('c2-boxplot-chart') as BoxplotChart
if (params.get('renderer') === 'svg') chart.renderer = 'svg'
if (params.get('animation') === 'none') chart.animation = 'none'
instrument(chart)
const events: { type: string; detail: unknown }[] = []
for (const type of ['point-click', 'point-hover', 'series-highlight', 'tooltip-change']) {
  chart.addEventListener(type, (event) => events.push({ type, detail: (event as CustomEvent).detail }))
}

if (scenario === 'latency' || scenario === 'horizontal') chart.data = SAMPLES
if (scenario === 'grouped') chart.data = REGIONS
if (scenario === 'long') chart.data = LONG
if (scenario === 'summary') chart.data = SUMMARIES
if (scenario === 'scores') chart.data = SCORES
if (scenario === 'empty') chart.data = []

window.boxplotScenario = {
  hover: (detail) => adapterEvents?.hover(detail),
  click: (detail) => adapterEvents?.click(detail),
  events,
  stats,
}

void new Promise<void>((resolve) => {
  if (chart.matches(':state(ready)')) return resolve()
  chart.addEventListener('chart-ready', () => resolve(), { once: true })
  // The empty scenario never draws; it is still a finished scenario.
  setTimeout(resolve, 3000)
}).then(() => {
  main.dataset.ready = 'true'
})
