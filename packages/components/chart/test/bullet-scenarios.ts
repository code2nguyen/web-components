/** Scenario page for the bullet chart suite: one case per layout, with KPI sample data. */
import '../src/bullet-chart'
import '../src/chart-series'
import * as model from '../src/bullet-model'
import { addTranslations } from '@c2n/core/localize.js'
import type { ChartAdapter, ChartAdapterEvents } from '../src/chart-adapter'
import type { BulletChart } from '../src/bullet-chart'
import './bullet-scenario-api'

let adapterEvents: ChartAdapterEvents | undefined

/** Captures the engine callbacks, so a spec can hover a row by index without aiming a pointer at a canvas. */
function instrument(element: BulletChart): void {
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

/** The scorecard of the mocks: four KPIs, each in its own unit and on its own scale. */
const KPIS = [
  { kpi: 'Revenue', unit: 'US$, thousands', actual: 270, target: 250, bands: [150, 225, 300] },
  { kpi: 'Profit', unit: '% of revenue', actual: 22.5, target: 27, bands: [20, 25, 30] },
  { kpi: 'New customers', unit: 'count', actual: 1650, target: 2100, bands: [1400, 2000, 2500] },
  { kpi: 'Satisfaction', unit: 'out of 5', actual: 4.6, target: 4.2, bands: [3.5, 4.25, 5] },
]

/** Costs, where lower is better. */
const COSTS = [
  { kpi: 'Cost per lead', unit: 'US$', actual: 46, target: 40, bands: [35, 50, 70] },
  { kpi: 'Churn', unit: '% monthly', actual: 2.1, target: 2.5, bands: [2, 3, 5] },
]

/** Regional sales in one unit, for the shared scale. */
const REGIONS = [
  { region: 'North', sales: 412, target: 400 },
  { region: 'South', sales: 288, target: 350 },
  { region: 'East', sales: 351, target: 345 },
  { region: 'West', sales: 196, target: 260 },
]

const main = document.querySelector('main') as HTMLElement
const params = new URLSearchParams(location.search)
const scenario = params.get('scenario') ?? 'scorecard'
const series = '<c2-chart-series field="actual" label="Actual"></c2-chart-series>'

switch (scenario) {
  case 'lower':
    main.innerHTML = `<c2-bullet-chart label-field="kpi" description-field="unit" target-field="target" bands-field="bands" better="lower">${series}</c2-bullet-chart>`
    break
  case 'status':
    main.innerHTML = `<style>
        .status { --c2-chart__band-1--color: #fecaca; --c2-chart__band-2--color: #fde68a; --c2-chart__band-3--color: #bbf7d0; --c2-chart__target--width: 5px; }
      </style>
      <c2-bullet-chart class="status" label-field="kpi" min="99" target="99.9" bands="[99.5, 99.9, 100]" value-suffix="%"
        data='[{"kpi":"Uptime","actual":99.95}]'>${series}</c2-bullet-chart>`
    break
  case 'shared':
    main.innerHTML = `<c2-bullet-chart label-field="region" target-field="target" bands="[200, 300, 450]" scale="shared">
        <c2-chart-series field="sales" label="Q3 sales"></c2-chart-series></c2-bullet-chart>`
    break
  case 'vertical':
    main.innerHTML = `<c2-bullet-chart orientation="vertical" label-field="kpi" description-field="unit" target-field="target" bands-field="bands">${series}</c2-bullet-chart>`
    break
  case 'compact':
    main.innerHTML = `<c2-bullet-chart style="--c2-chart--height: 16px; --c2-chart--padding: 0; --c2-chart--border-top: 0; --c2-chart--border-right: 0; --c2-chart--border-bottom: 0; --c2-chart--border-left: 0"
        labels="none" value-labels="none" axis="none" target="400" bands="[300, 380, 450]" data='[{"actual":412}]'>${series}</c2-bullet-chart>`
    break
  case 'gaps':
    main.innerHTML = `<c2-bullet-chart label-field="kpi" target-field="target" bands-field="bands">${series}</c2-bullet-chart>`
    break
  case 'empty':
    main.innerHTML = `<c2-bullet-chart label-field="kpi" target-field="target" bands-field="bands" data="[]">${series}</c2-bullet-chart>`
    break
  default:
    main.innerHTML = `<c2-bullet-chart label-field="kpi" description-field="unit" target-field="target" bands-field="bands">${series}</c2-bullet-chart>`
}

const chart = main.querySelector('c2-bullet-chart') as BulletChart
if (params.get('renderer') === 'svg') chart.renderer = 'svg'
instrument(chart)
const events: { type: string; detail: unknown }[] = []
for (const type of ['point-click', 'point-hover', 'series-highlight', 'tooltip-change']) {
  chart.addEventListener(type, (event) => events.push({ type, detail: (event as CustomEvent).detail }))
}

if (scenario === 'scorecard' || scenario === 'vertical') chart.data = KPIS
if (scenario === 'lower') chart.data = COSTS
if (scenario === 'shared') chart.data = REGIONS
if (scenario === 'gaps')
  chart.data = [
    { kpi: 'No value', actual: null, target: 50, bands: [40, 60, 80] },
    { kpi: 'No target', actual: 30, bands: [40, 60, 80] },
    { kpi: 'No bands', actual: 30, target: 50 },
  ]

window.bulletScenario = {
  hover: (detail) => adapterEvents?.hover(detail),
  click: (detail) => adapterEvents?.click(detail),
  events,
  model,
  addTranslations,
}

void new Promise<void>((resolve) => {
  if (chart.matches(':state(ready)')) return resolve()
  chart.addEventListener('chart-ready', () => resolve(), { once: true })
  // The empty scenario never draws; it is still a finished scenario.
  setTimeout(resolve, 3000)
}).then(() => {
  main.dataset.ready = 'true'
  document.documentElement.dataset.modulesReady = 'true'
})
