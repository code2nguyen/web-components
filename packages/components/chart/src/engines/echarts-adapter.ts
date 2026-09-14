/**
 * ECharts behind the {@link ChartAdapter} contract.
 *
 * The split the interface asks for maps cleanly here: `setOption` with `notMerge: false` merges, so
 * `setData` can send a *series-data-only* option object and ECharts skips normalising everything else.
 * `lazyUpdate` coalesces bursts into the next frame, and `silent` stops a programmatic update firing the
 * event storm a user interaction would.
 */
import type { ECharts, EChartsCoreOption } from 'echarts/core'
import { loadECharts, type EchartsFeature } from './echarts-loader.js'
import type { ChartAdapter, ChartAdapterEvents } from '../chart-adapter.js'

/** The option shape the element builds; `series` is the only part `setData` replaces. */
export interface EchartsOptions extends EChartsCoreOption {
  series?: Record<string, unknown>[]
}

export async function createEchartsAdapter(features: readonly EchartsFeature[], renderer: 'canvas' | 'svg'): Promise<ChartAdapter<EchartsOptions, unknown[]>> {
  const echarts = await loadECharts(features, renderer)

  let instance: ECharts | undefined
  let events: ChartAdapterEvents | undefined
  let hidden = new Set<number>()

  /** Merges the projected data into whatever series the last option build produced. */
  const withData = (options: EchartsOptions, data: unknown[]): EchartsOptions => ({
    ...options,
    series: (options.series ?? []).map((series, index) => ({ ...series, data: data[index] ?? [] })),
  })

  const adapter: ChartAdapter<EchartsOptions, unknown[]> = {
    engine: 'echarts',

    async create(host, options, data, handlers) {
      events = handlers
      instance = echarts.init(host, undefined, { renderer, useDirtyRect: true })
      instance.setOption(withData(options, data), { notMerge: true })

      instance.on('click', (params) => {
        const point = params as { dataIndex?: number; seriesIndex?: number }
        events?.click({ index: point.dataIndex ?? 0, seriesIndex: point.seriesIndex ?? 0 })
      })
      instance.on('mouseover', (params) => {
        const point = params as { dataIndex?: number; seriesIndex?: number; event?: { offsetX: number; offsetY: number } }
        events?.hover({
          index: point.dataIndex ?? 0,
          seriesIndex: point.seriesIndex ?? 0,
          px: point.event?.offsetX ?? 0,
          py: point.event?.offsetY ?? 0,
        })
      })
      instance.on('mouseout', () => events?.hover(null))
      instance.on('dataZoom', () => {
        const model = instance?.getOption() as { dataZoom?: { startValue?: number; endValue?: number }[] } | undefined
        const zoom = model?.dataZoom?.[0]
        if (zoom?.startValue !== undefined && zoom.endValue !== undefined) {
          events?.rangeChange({ min: zoom.startValue, max: zoom.endValue })
        }
      })
    },

    /** Series data only: ECharts merges it without re-evaluating axes, colours or layout. */
    setData(data) {
      instance?.setOption({ series: data.map((series) => ({ data: series })) }, { notMerge: false, lazyUpdate: true, silent: true })
    },

    /**
     * `replace` is required when the series set shrinks — a merge would leave the removed series on screen
     * forever. A merge otherwise keeps the current data and zoom, which is what a theme change wants.
     */
    setOptions(options, mode) {
      instance?.setOption(options, { notMerge: mode === 'replace', lazyUpdate: true })
      // A replace drops the visibility state, so re-apply it.
      if (mode === 'replace') for (const index of hidden) adapter.setSeriesVisibility(index, false)
    },

    /**
     * Goes through the legend action, which is why `LegendComponent` is registered even though the
     * built-in legend is hidden — it is the only public way to toggle a series.
     */
    setSeriesVisibility(index, visible) {
      const next = new Set(hidden)
      if (visible) next.delete(index)
      else next.add(index)
      hidden = next

      const option = instance?.getOption() as { series?: { name?: string }[] } | undefined
      const name = option?.series?.[index]?.name
      if (!name) return
      instance?.dispatchAction({ type: visible ? 'legendSelect' : 'legendUnSelect', name })
    },

    /** The same action: ECharts' legend selects by name, and a pie's names are its slices, not its series. */
    setDatumVisibility(name, visible) {
      instance?.dispatchAction({ type: visible ? 'legendSelect' : 'legendUnSelect', name })
    },

    resize(width, height) {
      if (width > 0 && height > 0) instance?.resize({ width, height })
    },

    /** ECharts leaks its global resize and event handlers without an explicit dispose. */
    destroy() {
      instance?.dispose()
      instance = undefined
      events = undefined
    },
  }

  return adapter
}
