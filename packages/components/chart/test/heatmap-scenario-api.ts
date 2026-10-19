/** The contract between the heatmap scenario page and its spec. */

export interface HeatmapScenarioApi {
  /** Sends a hover callback through the adapter boundary, as the engine reports a cell (series 1) or a total (series 2). */
  hover(detail: { index: number; seriesIndex: number; px: number; py: number } | null): void
  /** Sends a click callback through the adapter boundary. */
  click(detail: { index: number; seriesIndex: number }): void
  /** Events the chart fired, in order, by type. */
  events: { type: string; detail: unknown }[]
  /** The pure model and geometry functions, for tests that need a real `Intl` and canvas. */
  layout: typeof import('../src/heatmap-layout')
}

declare global {
  interface Window {
    heatmapScenario: HeatmapScenarioApi
  }
}
