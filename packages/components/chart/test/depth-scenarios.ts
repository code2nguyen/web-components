/** Scenario page for the depth chart suite: one chart over a small, hand-checkable BTC-USD book. */
import '../src/depth-chart'
import * as model from '../src/depth-model'
import type { ChartAdapter, ChartAdapterEvents } from '../src/chart-adapter'
import type { DepthChart } from '../src/depth-chart'
import './depth-scenario-api'

let adapterEvents: ChartAdapterEvents | undefined
const counts = { setData: 0, setOptions: 0 }

/** Captures the engine callbacks and counts engine calls, so a spec can hover a level without aiming at a canvas. */
function instrument(element: DepthChart): void {
  const target = element as unknown as { createAdapter(): Promise<ChartAdapter> }
  const original = target.createAdapter.bind(target)
  target.createAdapter = async () => {
    const adapter = await original()
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
    return adapter
  }
}

/**
 * Best bid 100.0, best ask 101.0, so the mid is 100.5. Prices arrive as strings with one decimal and unsorted; a
 * duplicate 99.0 is summed, and a zero size is dropped, as an exchange diff deletes a level.
 */
const BIDS: model.DepthLevelInput[] = [
  ['99.0', '1.50'],
  ['100.0', '2.00'],
  ['98.0', '4.00'],
  ['99.0', '0.50'],
  ['97.5', '0'],
]
const ASKS: model.DepthLevelInput[] = [
  { price: '101.0', size: '1.00' },
  { price: '102.0', size: '3.00' },
  { price: '103.0', size: '2.25' },
]

const params = new URLSearchParams(location.search)
const scenario = params.get('scenario') ?? 'book'
const main = document.querySelector('main') as HTMLElement
main.innerHTML =
  scenario === 'quote'
    ? `<c2-depth-chart range="0.05" unit="quote" base-label="BTC" quote-label="USD"></c2-depth-chart>`
    : `<c2-depth-chart range="0.05" base-label="BTC" quote-label="USD"></c2-depth-chart>`

const chart = main.querySelector('c2-depth-chart') as DepthChart
instrument(chart)
const events: { type: string; detail: unknown }[] = []
for (const type of ['price-select', 'range-change', 'point-click', 'tooltip-change']) {
  chart.addEventListener(type, (event) => events.push({ type, detail: (event as CustomEvent).detail }))
}
if (scenario !== 'empty') {
  chart.bids = BIDS
  chart.asks = ASKS
}

window.depthScenario = {
  counts: () => ({ ...counts }),
  hover: (detail) => adapterEvents?.hover(detail),
  click: (detail) => adapterEvents?.click(detail),
  events,
  model,
}

void new Promise<void>((resolve) => {
  if (chart.matches(':state(ready)')) return resolve()
  chart.addEventListener('chart-ready', () => resolve(), { once: true })
  // The empty scenario never draws; it is still a finished scenario.
  setTimeout(resolve, 3000)
}).then(() => {
  main.dataset.ready = 'true'
})
