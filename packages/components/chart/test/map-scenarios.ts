/**
 * Scenario page for the map chart suite. Kept apart from `scenarios.ts` so the map's cases do not share lines with
 * the other charts' ones.
 */
import '../src/map-chart'
import '../src/map-layer'
import type { ChartAdapter, ChartAdapterEvents } from '../src/chart-adapter'
import type { MapChart } from '../src/map-chart'
import './map-scenario-api'

let adapterEvents: ChartAdapterEvents | undefined

/** Captures the engine callbacks, so a spec can hover a region by name without aiming a pointer at a canvas. */
function instrument(element: MapChart): void {
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

/** Revenue by ISO alpha-3 code. `XXX` names no country, and `fra` is spelled in lower case. */
const REVENUE = [
  { country: 'USA', revenue: 4820 },
  { country: 'BRA', revenue: 1270 },
  { country: 'DEU', revenue: 2210 },
  { country: 'fra', revenue: 1390 },
  { country: 'IND', revenue: 1460 },
  { country: 'XXX', revenue: 10 },
]

const CHANGE = [
  { state: 'CA', yoy: 8.4 },
  { state: 'TX', yoy: 12.6 },
  { state: 'MI', yoy: -9.7 },
  { state: 'OH', yoy: -6.2 },
  { state: 'NY', yoy: 0 },
]

const CITIES = [
  { city: 'Lisbon', lon: -9.14, lat: 38.72, users: 40 },
  { city: 'Tokyo', lon: 139.7, lat: 35.7, users: 160 },
  { city: 'Lagos', lon: 3.4, lat: 6.5, users: 10 },
  { city: 'Nowhere', users: 5 },
]

const ROUTES = [
  { from: 'NLD', to: [-74, 40.7], teu: 38 },
  { from: [-118.24, 33.74], to: [139.6, 35.4], teu: 27 },
]

const HALL = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 100">
  <rect id="A01" x="0" y="0" width="90" height="100"><title>Rack A01</title></rect>
  <rect id="A02" x="100" y="0" width="90" height="100" data-name="Rack A02"></rect>
  <rect id="A03" x="200" y="0" width="90" height="100"></rect>
</svg>`

const main = document.querySelector('main') as HTMLElement
const scenario = new URLSearchParams(location.search).get('scenario') ?? 'world'

switch (scenario) {
  case 'diverging':
    main.innerHTML = `
      <c2-map-chart id="chart" map="us-states" region-field="state" value-field="yoy" value-label="YoY change" unit="%"
        scale="diverging" thresholds="[-10, -5, -2, 2, 5, 10]"></c2-map-chart>`
    break
  case 'layers':
    main.innerHTML = `
      <c2-map-chart id="chart" legend-action="toggle">
        <c2-map-layer type="points" label="Users" size-field="users" size-label="Active users" label-field="city" labels></c2-map-layer>
        <c2-map-layer type="lines" label="Routes" width-field="teu" width-label="TEU"></c2-map-layer>
      </c2-map-chart>`
    break
  case 'svg':
    main.innerHTML = `
      <c2-map-chart id="chart" region-field="rack" value-field="temp" value-label="Inlet" unit=" °C"
        thresholds="[27, 32]" scale-colors='["#16a34a", "#d97706", "#dc2626"]' scale-labels='["OK", "Warm", "Hot"]'></c2-map-chart>`
    break
  case 'picker':
    main.innerHTML = `
      <form id="form">
        <c2-map-chart id="chart" extent="europe" selection="multiple" name="shipTo" value="DEU;FRA" legend="none" roam="zoom"></c2-map-chart>
      </form>`
    break
  case 'unknown':
    main.innerHTML = `<c2-map-chart id="chart" map="mars"></c2-map-chart>`
    break
  default:
    main.innerHTML = `<c2-map-chart id="chart" region-field="country" value-field="revenue" value-label="Revenue" roam="both"></c2-map-chart>`
}

const chart = main.querySelector('c2-map-chart') as MapChart
const renderer = new URLSearchParams(location.search).get('renderer')
if (renderer === 'svg') chart.renderer = 'svg'
instrument(chart)
const events: { type: string; detail: unknown }[] = []
for (const type of ['selection-change', 'view-change', 'unmatched-rows', 'point-click', 'input', 'change']) {
  chart.addEventListener(type, (event) => events.push({ type, detail: (event as CustomEvent).detail }))
}

if (scenario === 'world') chart.data = REVENUE
if (scenario === 'diverging') chart.data = CHANGE
if (scenario === 'svg') {
  chart.geo = HALL
  chart.data = [
    { rack: 'A01', temp: 24 },
    { rack: 'A02', temp: 29.5 },
    { rack: 'A03', temp: 34 },
  ]
}
if (scenario === 'layers') {
  const [points, lines] = Array.from(chart.querySelectorAll('c2-map-layer'))
  points.data = CITIES
  lines.data = ROUTES
}

window.mapScenario = {
  hover: (detail) => adapterEvents?.hover(detail),
  click: (detail) => adapterEvents?.click(detail),
  events,
}

void new Promise<void>((resolve) => {
  if (chart.hasAttribute('data-chart-ready')) return resolve()
  chart.addEventListener('chart-ready', () => resolve(), { once: true })
  // The unknown-map scenario never draws; it is still a finished scenario.
  setTimeout(resolve, 3000)
}).then(() => {
  main.dataset.ready = 'true'
})
