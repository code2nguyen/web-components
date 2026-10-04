/**
 * Scenario page for the bubble chart suite. Kept apart from `scenarios.ts` so the bubble chart's cases do not
 * share lines with the other charts' ones.
 */
import '../src/bubble-chart'
import '../src/chart-series'
import type { ChartAdapter, ChartAdapterEvents } from '../src/chart-adapter'
import type { BubbleChart } from '../src/bubble-chart'
import './bubble-scenario-api'

let adapterEvents: ChartAdapterEvents | undefined

/** Captures the engine callbacks, so a spec can hover a point by its draw index without aiming a pointer. */
function instrument(element: BubbleChart): void {
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

/** One row per point, grouped by `region`. Rows are deliberately not sorted by size. */
const GROUPED = [
  { country: 'Kenya', region: 'Africa', gdp: 1950, life: 62.7, pop: 55 },
  { country: 'India', region: 'Asia', gdp: 2480, life: 72.0, pop: 1429 },
  { country: 'Brazil', region: 'Americas', gdp: 10040, life: 75.8, pop: 216 },
  { country: 'Nigeria', region: 'Africa', gdp: 1620, life: 53.6, pop: 224 },
  { country: 'Japan', region: 'Asia', gdp: 33830, life: 84.7, pop: 124 },
  { country: 'Nowhere', region: 'Asia', gdp: 0, life: 70, pop: 10 },
]

/** One column per series, sharing one size column. */
const WIDE = [
  { risk: 5, bonds: 3.6, aum: 640 },
  { risk: 16, equity: 8.2, aum: 900 },
  { risk: 23, equity: 9.6, aum: 225 },
  { risk: 9, bonds: 4.1 },
]

const main = document.querySelector('main') as HTMLElement
const scenario = new URLSearchParams(location.search).get('scenario') ?? 'grouped'

switch (scenario) {
  case 'wide':
    main.innerHTML = `
      <c2-bubble-chart id="chart" x-field="risk" size-field="aum" size-label="AUM" x-label="Volatility" y-label="Return">
        <c2-chart-series field="bonds" label="Bonds"></c2-chart-series>
        <c2-chart-series field="equity" label="Equity"></c2-chart-series>
      </c2-bubble-chart>`
    break
  case 'declared':
    main.innerHTML = `
      <c2-bubble-chart id="chart" x-field="gdp" y-field="life" size-field="pop" label-field="country" series-field="region">
        <c2-chart-series field="Asia" label="Asia Pacific" color="#ff0000"></c2-chart-series>
      </c2-bubble-chart>`
    break
  case 'invalid':
    main.innerHTML = `<c2-bubble-chart id="chart" x-field="gdp" size-field="pop" series-field="region"></c2-bubble-chart>`
    break
  default:
    main.innerHTML = `
      <c2-bubble-chart id="chart" x-field="gdp" y-field="life" size-field="pop" size-label="Population"
        label-field="country" series-field="region" x-scale="log" bubble-labels="all" size-legend></c2-bubble-chart>`
}

const chart = main.querySelector('c2-bubble-chart') as BubbleChart
instrument(chart)
chart.data = scenario === 'wide' ? WIDE : GROUPED

window.bubbleScenario = {
  hover: (detail) => adapterEvents?.hover(detail),
  click: (detail) => adapterEvents?.click(detail),
}

void new Promise<void>((resolve) => {
  if (chart.matches(':state(ready)')) return resolve()
  chart.addEventListener('chart-ready', () => resolve(), { once: true })
  // The invalid scenario never draws; it is still a finished scenario.
  setTimeout(resolve, 3000)
}).then(() => {
  main.dataset.ready = 'true'
})
