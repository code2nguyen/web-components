/** The contract between the histogram scenario page and its spec. */

export interface HistogramScenarioApi {
  /** Sends a hover callback through the adapter boundary, as the engine reports a hovered bar. */
  hover(detail: { index: number; seriesIndex: number; px: number; py: number } | null): void
  /** Events the chart fired, in order, by type. */
  events: { type: string; detail: unknown }[]
  /** The pure binning functions, for unit tests in a real browser. */
  bins: typeof import('../src/histogram-bins')
  /** The lazily loaded overlay statistics. */
  overlay: () => Promise<typeof import('../src/histogram-overlay')>
  addTranslations: typeof import('@c2n/core/localize.js').addTranslations
}

declare global {
  interface Window {
    histogramScenario: HistogramScenarioApi
  }
}
