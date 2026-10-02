/** The contract between the map chart scenario page and its spec. */

export interface MapScenarioApi {
  /** Sends a hover callback through the adapter boundary, as the engine reports a region (`component: 'geo'`) or a mark. */
  hover(detail: { index: number; seriesIndex: number; px: number; py: number; name?: string; component?: string } | null): void
  /** Sends a click callback through the adapter boundary. */
  click(detail: { index: number; seriesIndex: number; name?: string; component?: string }): void
  /** Events the chart fired, in order, by type. */
  events: { type: string; detail: unknown }[]
}

declare global {
  interface Window {
    mapScenario: MapScenarioApi
  }
}
