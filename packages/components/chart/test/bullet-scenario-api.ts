/** The contract between the bullet chart scenario page and its spec. */

export interface BulletScenarioApi {
  /** Sends a hover callback through the adapter boundary, as the engine reports a row. */
  hover(detail: { index: number; seriesIndex: number; px: number; py: number } | null): void
  /** Sends a click callback through the adapter boundary. */
  click(detail: { index: number; seriesIndex: number }): void
  /** Events the chart fired, in order, by type. */
  events: { type: string; detail: unknown }[]
  /** The pure band and scale functions, for the unit tests. */
  model: typeof import('../src/bullet-model')
}

declare global {
  interface Window {
    bulletScenario: BulletScenarioApi
  }
}
