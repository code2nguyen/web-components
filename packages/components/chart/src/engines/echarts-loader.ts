/**
 * Lazy, tree-shaken access to ECharts.
 *
 * ECharts is large, so only the pieces a given chart type needs are registered: a page showing a gauge
 * never evaluates the pie code. Every specifier below is **static** — a computed `import(name)` would
 * defeat the bundler's module graph and pull the whole library back in.
 */
import type * as echarts from 'echarts/core'

/** A registerable ECharts module, keyed by the chart type or component that needs it. */
export type EchartsFeature = 'pie' | 'gauge' | 'radar' | 'scatter' | 'candlestick' | 'bar' | 'line' | 'grid' | 'legend' | 'tooltip' | 'dataZoom'

const LOADERS: Record<EchartsFeature, () => Promise<unknown[]>> = {
  pie: () => import('echarts/charts').then((m) => [m.PieChart]),
  gauge: () => import('echarts/charts').then((m) => [m.GaugeChart]),
  radar: () => import('echarts/charts').then((m) => [m.RadarChart]),
  scatter: () => import('echarts/charts').then((m) => [m.ScatterChart]),
  candlestick: () => import('echarts/charts').then((m) => [m.CandlestickChart]),
  bar: () => import('echarts/charts').then((m) => [m.BarChart]),
  line: () => import('echarts/charts').then((m) => [m.LineChart]),
  grid: () => import('echarts/components').then((m) => [m.GridComponent]),
  legend: () => import('echarts/components').then((m) => [m.LegendComponent]),
  tooltip: () => import('echarts/components').then((m) => [m.TooltipComponent]),
  dataZoom: () => import('echarts/components').then((m) => [m.DataZoomComponent]),
}

let corePending: Promise<typeof echarts> | undefined
/** Registrations already applied, so a second chart of the same type registers nothing. */
const registered = new Set<string>()
/** Registrations in flight, so two charts mounting together do not both load the same chunk. */
const inflight = new Map<string, Promise<void>>()

/**
 * Loads `echarts/core`, registers `features` and the chosen renderer, and returns the core namespace.
 * Registration is idempotent and deduped, so calling this per element is cheap after the first.
 */
export async function loadECharts(features: readonly EchartsFeature[], renderer: 'canvas' | 'svg'): Promise<typeof echarts> {
  if (!corePending) corePending = import('echarts/core')
  const core = await corePending

  const keys = [...features, `renderer:${renderer}`]
  await Promise.all(
    keys.map((key) => {
      if (registered.has(key)) return undefined
      let task = inflight.get(key)
      if (!task) {
        const load = key.startsWith('renderer:')
          ? import('echarts/renderers').then((m) => [renderer === 'svg' ? m.SVGRenderer : m.CanvasRenderer])
          : LOADERS[key as EchartsFeature]()
        task = load
          .then((modules) => {
            core.use(modules as Parameters<typeof core.use>[0])
            registered.add(key)
          })
          .finally(() => inflight.delete(key))
        inflight.set(key, task)
      }
      return task
    }),
  )

  return core
}
