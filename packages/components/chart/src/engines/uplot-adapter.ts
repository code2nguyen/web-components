/**
 * uPlot behind the {@link ChartAdapter} contract.
 *
 * One constraint shapes this whole file: **uPlot has no reconfigure API**. Scales, axes, path builders and
 * series colours are read once in the constructor, and `setSeries` only toggles visibility. So
 * `setOptions` destroys and rebuilds, restoring the current x window so a zoomed chart does not jump.
 * That is affordable only because presentation changes are rare — and it is exactly why data must never
 * travel through `setOptions`.
 */
import type uPlot from 'uplot'
import type { AlignedData, Options } from 'uplot'
import { loadUplot } from './uplot-loader.js'
import type { ChartAdapter, ChartAdapterEvents } from '../chart-adapter.js'

export async function createUplotAdapter(): Promise<ChartAdapter<Options, AlignedData>> {
  const UPlot = await loadUplot()

  let instance: uPlot | undefined
  let container: HTMLElement | undefined
  let events: ChartAdapterEvents | undefined
  let data: AlignedData = [[]] as unknown as AlignedData
  /** Set while we are rebuilding, so the scale hook does not report our own restore as a user zoom. */
  let restoring = false

  /** Adds our hooks to whatever the element built, without the element knowing uPlot's hook shape. */
  const withHooks = (options: Options): Options => ({
    ...options,
    hooks: {
      ...options.hooks,
      setCursor: [
        (self: uPlot) => {
          const index = self.cursor.idx
          if (index === null || index === undefined) {
            events?.hover(null)
            return
          }
          events?.hover({
            index,
            seriesIndex: Math.max(1, self.cursor.idxs?.findIndex((value) => value !== null && value !== undefined) ?? 1) - 1,
            px: self.cursor.left ?? 0,
            py: self.cursor.top ?? 0,
          })
        },
      ],
      setSelect: [
        (self: uPlot) => {
          if (self.select.width <= 0) return
          const min = self.posToVal(self.select.left, 'x')
          const max = self.posToVal(self.select.left + self.select.width, 'x')
          events?.rangeChange({ min, max })
        },
      ],
      setScale: [
        (self: uPlot, key: string) => {
          if (restoring || key !== 'x') return
          const { min, max } = self.scales.x
          if (min !== undefined && max !== undefined) events?.rangeChange({ min, max })
        },
      ],
    },
  })

  const build = (options: Options, next: AlignedData) => {
    if (!container) return
    instance = new UPlot(withHooks(options), next, container)
  }

  return {
    engine: 'uplot',

    async create(host, options, initial, handlers) {
      container = host
      events = handlers
      data = initial
      build(options, initial)
    },

    /** The hot path, and the reason uPlot is here: a redraw and nothing else. */
    setData(next) {
      data = next
      instance?.setData(next, true)
    },

    /** Destroy and rebuild, preserving the x window. See the file header for why there is no alternative. */
    setOptions(options, _mode) {
      if (!instance || !container) return
      const { min, max } = instance.scales.x
      instance.destroy()
      build(options, data)
      if (min !== undefined && max !== undefined && instance) {
        restoring = true
        instance.setScale('x', { min, max })
        restoring = false
      }
    },

    setSeriesVisibility(index, visible) {
      // Series 0 is the x values, so a caller's series index is offset by one.
      instance?.setSeries(index + 1, { show: visible })
    },

    resize(width, height) {
      if (width > 0 && height > 0) instance?.setSize({ width, height })
    },

    destroy() {
      instance?.destroy()
      instance = undefined
      container = undefined
      events = undefined
    },
  }
}
