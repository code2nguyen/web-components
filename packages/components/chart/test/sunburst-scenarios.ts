/** Scenario page for the sunburst suite: a department budget, three levels deep, in millions of dollars. */
import '../src/sunburst-chart'
import type { ChartAdapter, ChartAdapterEvents } from '../src/chart-adapter'
import type { SunburstChart } from '../src/sunburst-chart'

let adapterEvents: ChartAdapterEvents | undefined

/** Captures the engine callbacks, so a spec can hover or click a segment by name without aiming at a canvas. */
function instrument(element: SunburstChart): void {
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

/** Department › team › line item. $11.7M in all; Compute is 9.4% of it and 52.4% of Platform. */
const BUDGET = [
  {
    name: 'Engineering',
    children: [
      {
        name: 'Platform',
        children: [
          { name: 'Compute', budget: 1.1 },
          { name: 'Storage', budget: 0.6 },
          { name: 'Network', budget: 0.4 },
        ],
      },
      {
        name: 'Product',
        children: [
          { name: 'Web', budget: 0.9 },
          { name: 'Mobile', budget: 0.8 },
          { name: 'Design', budget: 0.3 },
        ],
      },
      {
        name: 'Data',
        children: [
          { name: 'Warehouse', budget: 0.6 },
          { name: 'ML', budget: 0.4 },
        ],
      },
    ],
  },
  {
    name: 'Sales',
    children: [
      {
        name: 'Field',
        children: [
          { name: 'Enterprise', budget: 1.0 },
          { name: 'Mid-market', budget: 0.6 },
        ],
      },
      {
        name: 'Inside',
        children: [
          { name: 'Renewals', budget: 0.5 },
          { name: 'New logos', budget: 0.4 },
        ],
      },
    ],
  },
  {
    name: 'Marketing',
    children: [
      { name: 'Brand', budget: 0.9 },
      {
        name: 'Demand',
        children: [
          { name: 'Search', budget: 0.6 },
          { name: 'Social', budget: 0.4 },
        ],
      },
      { name: 'Events', budget: 0.3 },
    ],
  },
  {
    name: 'Operations',
    children: [
      { name: 'Finance', budget: 0.8 },
      { name: 'People', budget: 0.7 },
      { name: 'Legal', budget: 0.4 },
    ],
  },
]

/** Flat holdings for `group-field`, with a day's change for `color-field`. */
const HOLDINGS = [
  { region: 'US', sector: 'Tech', ticker: 'AAPL', cap: 34, change: 1.2 },
  { region: 'US', sector: 'Tech', ticker: 'MSFT', cap: 31, change: -0.4 },
  { region: 'US', sector: 'Energy', ticker: 'XOM', cap: 5, change: -1.5 },
  { region: 'EU', sector: 'Tech', ticker: 'SAP', cap: 2.4, change: 3 },
  { region: 'EU', sector: 'Energy', ticker: 'SHEL', cap: 2.1, change: 0 },
]

const main = document.querySelector('main') as HTMLElement
const params = new URLSearchParams(location.search)
const scenario = params.get('scenario') ?? 'budget'

const budget = (attributes = '') =>
  `<c2-sunburst-chart label-field="name" value-prefix="$" value-suffix="M" ${attributes}><c2-chart-series field="budget" label="Budget"></c2-chart-series></c2-sunburst-chart>`

switch (scenario) {
  case 'root':
    main.innerHTML = budget(`root='["Engineering"]'`)
    break
  case 'small':
    main.innerHTML = budget('legend="bottom" labels="none" levels="2" style="width:320px;height:240px"')
    break
  case 'flat':
    main.innerHTML = `<c2-sunburst-chart label-field="ticker" group-field="region, sector"><c2-chart-series field="cap" label="Market cap"></c2-chart-series></c2-sunburst-chart>`
    break
  case 'color':
    main.innerHTML = `<c2-sunburst-chart label-field="ticker" group-field="sector" color-field="change" color-label="Change" color-suffix="%" color-max="3"><c2-chart-series field="cap" label="Market cap"></c2-chart-series></c2-sunburst-chart>`
    break
  case 'empty':
    main.innerHTML = budget()
    break
  default:
    main.innerHTML = budget()
}

const chart = main.querySelector('c2-sunburst-chart') as SunburstChart
if (params.get('renderer') === 'svg') chart.renderer = 'svg'
if (params.get('animation') === 'none') chart.animation = 'none'
instrument(chart)
const events: { type: string; detail: unknown }[] = []
for (const type of ['zoom-change', 'point-click', 'point-hover', 'series-highlight']) {
  chart.addEventListener(type, (event) => events.push({ type, detail: (event as CustomEvent).detail }))
}

if (scenario === 'flat') chart.data = HOLDINGS
else if (scenario === 'color') chart.data = HOLDINGS
else if (scenario === 'empty') chart.data = []
else chart.data = BUDGET

/** The contract between this page and `sunburst-chart.spec.ts`. */
export interface SunburstScenarioApi {
  /** Sends a hover callback through the adapter boundary, as the engine reports a segment by its name. */
  hover(detail: { index: number; seriesIndex: number; px: number; py: number; name?: string } | null): void
  /** Sends a click callback through the adapter boundary. */
  click(detail: { index: number; seriesIndex: number; name?: string }): void
  /** Events the chart fired, in order, by type. */
  events: { type: string; detail: unknown }[]
  /** The name a node is handed to ECharts under. */
  engineName(path: string[], leaf: boolean): string
}

declare global {
  interface Window {
    sunburstScenario: SunburstScenarioApi
  }
}

window.sunburstScenario = {
  hover: (detail) => adapterEvents?.hover(detail),
  click: (detail) => adapterEvents?.click(detail),
  events,
  engineName: (path, leaf) => `${leaf ? 'tile' : 'group'}\u001f${path.join('\u001f')}`,
}

void new Promise<void>((resolve) => {
  if (chart.matches(':state(ready)')) return resolve()
  chart.addEventListener('chart-ready', () => resolve(), { once: true })
  // The empty scenario never draws; it is still a finished scenario.
  setTimeout(resolve, 3000)
}).then(() => {
  main.dataset.ready = 'true'
})
