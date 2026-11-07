/** The contract between the box plot scenario page and its spec. */

export interface BoxplotScenarioApi {
  /** Sends a hover callback through the adapter boundary, as the engine reports a box or an outlier. */
  hover(detail: { index: number; seriesIndex: number; px: number; py: number; component?: string } | null): void
  /** Sends a click callback through the adapter boundary. */
  click(detail: { index: number; seriesIndex: number }): void
  /** Events the chart fired, in order, by type. */
  events: { type: string; detail: unknown }[]
  /** The pure statistics, for unit tests in a real browser. */
  stats: typeof import('../src/boxplot-stats')
}

declare global {
  interface Window {
    boxplotScenario: BoxplotScenarioApi
  }
}
