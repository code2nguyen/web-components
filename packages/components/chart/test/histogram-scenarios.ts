/** Scenario page for the histogram suite: one case per data form, overlay and layout, with request latency samples. */
import '../src/histogram-chart'
import * as bins from '../src/histogram-bins'
import { addTranslations } from '@c2n/core/localize.js'
import type { ChartAdapter, ChartAdapterEvents } from '../src/chart-adapter'
import type { HistogramChart } from '../src/histogram-chart'
import type { ChartDataSource } from '../src/chart-types'
import './histogram-scenario-api'

let adapterEvents: ChartAdapterEvents | undefined

/** Captures the engine callbacks, so a spec can hover a bar by index without aiming a pointer at a canvas. */
function instrument(element: HistogramChart): void {
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

/** A seeded normal sample, so every run draws the same bars. */
function normal(count: number, mean: number, deviation: number, seed: number): number[] {
  let state = seed
  const next = () => ((state = (state * 1664525 + 1013904223) % 4294967296) + 1) / 4294967297
  return Array.from({ length: count }, () => Math.round(mean + deviation * Math.sqrt(-2 * Math.log(next())) * Math.cos(2 * Math.PI * next())))
}

/** 200 request latencies in ms, centred on 300. */
const LATENCY = normal(200, 300, 60, 7)

const main = document.querySelector('main') as HTMLElement
const params = new URLSearchParams(location.search)
const scenario = params.get('scenario') ?? 'latency'

const series = '<c2-chart-series field="value" label="Latency" color="#0000ff"></c2-chart-series>'
const pair = `<c2-chart-series field="east" label="us-east" color="#0000ff"></c2-chart-series>
  <c2-chart-series field="west" label="eu-west" color="#ff0000"></c2-chart-series>`
const colours = 'style="--c2-chart__overlay--color: #00ff00; --c2-chart__percentile--color: #ff00ff"'

const markup: Record<string, string> = {
  latency: `<c2-histogram-chart animation="none" bin-width="50">${series}</c2-histogram-chart>`,
  density: `<c2-histogram-chart animation="none" bin-width="50" overlay="density" ${colours}>${series}</c2-histogram-chart>`,
  cumulative: `<c2-histogram-chart animation="none" bin-width="50" overlay="cumulative" ${colours}>${series}</c2-histogram-chart>`,
  percentiles: `<c2-histogram-chart animation="none" bin-width="50" percentiles="[50, 90]" ${colours}>${series}</c2-histogram-chart>`,
  grouped: `<c2-histogram-chart animation="none" bin-width="100" legend="bottom">${pair}</c2-histogram-chart>`,
  stacked: `<c2-histogram-chart animation="none" bin-width="100" stack="normal">${pair}</c2-histogram-chart>`,
  long: `<c2-histogram-chart animation="none" bin-width="20"><c2-chart-series field="ms" label="Latency" color="#0000ff"></c2-chart-series></c2-histogram-chart>`,
  horizontal: `<c2-histogram-chart animation="none" bin-width="50" orientation="horizontal">${series}</c2-histogram-chart>`,
  source: `<c2-histogram-chart animation="none" bin-width="100">${series}</c2-histogram-chart>`,
  empty: `<c2-histogram-chart>${series}</c2-histogram-chart>`,
  french: `<div lang="fr"><c2-histogram-chart animation="none" bin-width="50" percentiles="[50]">${series}</c2-histogram-chart></div>`,
}
main.innerHTML = markup[scenario] ?? markup.latency

const chart = main.querySelector('c2-histogram-chart') as HistogramChart
instrument(chart)
const events: { type: string; detail: unknown }[] = []
for (const type of ['point-click', 'point-hover', 'tooltip-change']) {
  chart.addEventListener(type, (event) => events.push({ type, detail: (event as CustomEvent).detail }))
}

addTranslations({
  fr: {
    'histogram-chart': {
      bin: 'Classe',
      range: 'de {0} à {1}',
      percentile: 'p{0}',
      percentileValue: '{0} : {1}',
      summary: 'Histogramme de {0}, {1} classes',
      summaryPercentiles: '{0}. {1} : {2}',
      withDensity: '{0}, avec une courbe de densité',
      withCumulative: '{0}, avec la part cumulée',
    },
  },
})

if (scenario === 'grouped' || scenario === 'stacked') {
  chart.data = [{ east: LATENCY, west: LATENCY.map((value) => value + 80) }]
} else if (scenario === 'long') {
  chart.data = [{ ms: 120 }, { ms: 80 }, { ms: 140 }, { ms: 'n/a' }, { ms: 100 }, { ms: null }, { ms: 61 }]
} else if (scenario === 'source') {
  let push: ((x: number, values: readonly (number | null)[]) => void) | undefined
  const source: ChartDataSource = {
    getWindow: () => new Promise((resolve) => setTimeout(() => resolve({ data: [120, 180, 220, 250, 310] }), 50)),
    subscribe: (listener) => {
      push = listener
      return () => (push = undefined)
    },
  }
  chart.dataSource = source
  ;(window as unknown as { push: (value: number) => void }).push = (value) => push?.(0, [value])
} else if (scenario !== 'empty') {
  chart.data = LATENCY
} else {
  chart.data = []
}

window.histogramScenario = {
  hover: (detail) => adapterEvents?.hover(detail),
  events,
  bins,
  overlay: () => import('../src/histogram-overlay'),
  addTranslations,
}

void new Promise<void>((resolve) => {
  if (chart.matches(':state(ready)')) return resolve()
  chart.addEventListener('chart-ready', () => resolve(), { once: true })
  // The empty scenario never draws; it is still a finished scenario.
  setTimeout(resolve, 3000)
}).then(() => {
  main.dataset.ready = 'true'
})
