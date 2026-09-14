/**
 * The contract between a chart element and a drawing engine.
 *
 * The split between {@link ChartAdapter.setData} and {@link ChartAdapter.setOptions} is the whole reason
 * this interface exists: a realtime tick must reach the engine through `setData` and nothing else, because
 * `setOptions` is allowed to be expensive (under uPlot it destroys and rebuilds the instance).
 */
import type { ChartSeriesConfig } from './chart-types.js'
import type { ChartTheme } from './chart-theme.js'

/** Everything an element hands its engine layer to build options. Presentation only — never raw data. */
export interface ChartBuildContext {
  theme: ChartTheme
  /** The resolved series, in draw order. */
  series: ChartSeriesConfig[]
  /** Indices currently hidden by the legend. */
  hidden: ReadonlySet<number>
  /** Category labels, when the chart is categorical. */
  labels?: string[]
  width: number
  height: number
}

/** Engine callbacks, normalised so the element never sees a uPlot hook or an ECharts action. */
export interface ChartAdapterEvents {
  /** A point is hovered, or `null` when the pointer leaves the plot. */
  hover(detail: { index: number; seriesIndex: number; px: number; py: number } | null): void
  click(detail: { index: number; seriesIndex: number }): void
  rangeChange(detail: { min: number; max: number }): void
}

/**
 * One drawing engine, wrapped. Only {@link create} is asynchronous — by the time it resolves the engine
 * module has loaded and the instance exists, so every later call is synchronous and cheap to reason about.
 */
export interface ChartAdapter<TOptions = unknown, TData = unknown> {
  readonly engine: 'uplot' | 'echarts'

  /** Builds the instance. Options and data are applied together so nothing flashes on first paint. */
  create(container: HTMLElement, options: TOptions, data: TData, events: ChartAdapterEvents): Promise<void>

  /** The hot path. Data only: must not rebuild options, re-measure, or recreate the instance. */
  setData(data: TData): void

  /**
   * Streaming append, when the engine has a cheaper path than a full `setData`. Optional: the element
   * falls back to `setData` when it is absent.
   */
  appendData?(data: TData, appended: number): void

  /** Presentation changed. Allowed to be expensive. `replace` is required when the series set shrinks. */
  setOptions(options: TOptions, mode: 'merge' | 'replace'): void

  /** Shows or hides one series without rebuilding anything. */
  setSeriesVisibility(index: number, visible: boolean): void

  /**
   * Shows or hides one datum by name, for a chart whose legend is its data rather than its series — a pie has
   * one series and many slices. Only the engines that can do it implement it.
   */
  setDatumVisibility?(name: string, visible: boolean): void

  resize(width: number, height: number): void

  destroy(): void
}
