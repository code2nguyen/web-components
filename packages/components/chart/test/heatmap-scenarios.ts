/** Scenario page for the heatmap suite: one case per layout, with financial sample data. */
import '../src/heatmap-chart'
import * as layout from '../src/heatmap-layout'
import type { ChartAdapter, ChartAdapterEvents } from '../src/chart-adapter'
import type { HeatmapChart } from '../src/heatmap-chart'
import './heatmap-scenario-api'

let adapterEvents: ChartAdapterEvents | undefined

/** Captures the engine callbacks, so a spec can hover a cell by index without aiming a pointer at a canvas. */
function instrument(element: HeatmapChart): void {
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

/** One-day change of each currency against the basket, in %. A cell is the base's change against the quote. */
const MOVES: Record<string, number> = { USD: 0, EUR: 0.42, JPY: -0.85, GBP: 0.18 }
const FX = Object.keys(MOVES).flatMap((base) =>
  Object.keys(MOVES).map((quote) => ({ base, quote, change: Math.round((MOVES[base] - MOVES[quote]) * 100) / 100 })),
)

/** Daily P&L, weekdays of January 2026, with the 1st a holiday. Two fills on the 5th. */
const PNL = [
  { tradeDate: '2026-01-02', pnl: 12000 },
  { tradeDate: '2026-01-05', pnl: -30000 },
  { tradeDate: '2026-01-05', pnl: -40000 },
  { tradeDate: '2026-01-06', pnl: 150000 },
  { tradeDate: '2026-01-07', pnl: 4000 },
  { tradeDate: '2026-01-08', pnl: -120000 },
  { tradeDate: '2026-01-09', pnl: 60000 },
]

/** Quotes arrive in no particular tenor order. */
const VOL = [
  { pair: 'EURUSD', region: 'G10', tenor: '1Y', vol: 7.6 },
  { pair: 'EURUSD', region: 'G10', tenor: 'ON', vol: 8.1 },
  { pair: 'EURUSD', region: 'G10', tenor: '1M', vol: 6.9 },
  { pair: 'USDBRL', region: 'EM', tenor: '1M', vol: 14.2 },
  { pair: 'USDBRL', region: 'EM', tenor: 'ON', vol: 16.0 },
  { pair: 'USDBRL', region: 'EM', tenor: '1Y', vol: 15.1 },
  { pair: 'GBPUSD', region: 'G10', tenor: '1M', vol: 7.9 },
  { pair: 'GBPUSD', region: 'G10', tenor: '1Y', vol: 8.3 },
]

/** Fills: two at 08:xx on Monday 5 January, one at 14:xx on Tuesday, in UTC. */
const FILLS = [{ at: '2026-01-05T08:10:00Z' }, { at: '2026-01-05T08:45:00Z' }, { at: '2026-01-06T14:00:00Z' }]

const main = document.querySelector('main') as HTMLElement
const params = new URLSearchParams(location.search)
const scenario = params.get('scenario') ?? 'matrix'

switch (scenario) {
  case 'calendar':
    main.innerHTML = `<c2-heatmap-chart layout="calendar" date-field="tradeDate" value-field="pnl" value-label="Net P&amp;L" range="2026-01"
      weekdays="mon-fri" scale="diverging" thresholds="[-100000,-50000,-10000,10000,50000,100000]" scale-poles='["loss","gain"]'></c2-heatmap-chart>`
    break
  case 'months':
    main.innerHTML = `<c2-heatmap-chart layout="calendar-month" date-field="tradeDate" value-field="pnl" range="2026-01/2026-02"></c2-heatmap-chart>`
    break
  case 'groups':
    main.innerHTML = `<c2-heatmap-chart y-field="pair" x-field="tenor" x-order="tenor" value-field="vol" value-label="ATM vol" unit="%"
      group-field="region" group-order='["G10","EM"]' cell-labels="always"></c2-heatmap-chart>`
    break
  case 'hours':
    main.innerHTML = `<c2-heatmap-chart x-field="at" x-bin="hour" y-field="at" y-bin="weekday" aggregate="count" time-zone="utc"
      marginals="both" legend-detail="simple"></c2-heatmap-chart>`
    break
  case 'invalid':
    main.innerHTML = `<c2-heatmap-chart value-field="v"></c2-heatmap-chart>`
    break
  default:
    main.innerHTML = `<c2-heatmap-chart y-field="base" x-field="quote" y-order="x" value-field="change" value-label="1-day change" unit="%"
      diagonal="hide" scale="diverging" domain="[-1.5, 0, 1.5]" cell-labels="always" scale-poles='["base weaker","base stronger"]'></c2-heatmap-chart>`
}

const chart = main.querySelector('c2-heatmap-chart') as HeatmapChart
if (params.get('renderer') === 'svg') chart.renderer = 'svg'
instrument(chart)
const events: { type: string; detail: unknown }[] = []
for (const type of ['cell-click', 'cell-hover', 'scale-filter-change', 'point-click', 'point-hover']) {
  chart.addEventListener(type, (event) => events.push({ type, detail: (event as CustomEvent).detail }))
}

if (scenario === 'matrix') chart.data = FX
if (scenario === 'calendar' || scenario === 'months') chart.data = PNL
if (scenario === 'groups') chart.data = VOL
if (scenario === 'hours') chart.data = FILLS
if (scenario === 'invalid') chart.data = [{ v: 1 }]

window.heatmapScenario = {
  hover: (detail) => adapterEvents?.hover(detail),
  click: (detail) => adapterEvents?.click(detail),
  events,
  layout,
}

void new Promise<void>((resolve) => {
  if (chart.matches(':state(ready)')) return resolve()
  chart.addEventListener('chart-ready', () => resolve(), { once: true })
  // The invalid scenario never draws; it is still a finished scenario.
  setTimeout(resolve, 3000)
}).then(() => {
  main.dataset.ready = 'true'
})
