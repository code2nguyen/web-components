/** The contract between the depth chart scenario page and its spec. */

export interface DepthScenarioApi {
  /** Engine calls since the chart was created: a new book must reach the engine through `setData` alone. */
  counts(): { setData: number; setOptions: number }
  /** Sends a hover callback through the adapter boundary, as uPlot reports the point under the cursor. */
  hover(detail: { index: number; seriesIndex: number; px: number; py: number } | null): void
  /** Sends a click callback through the adapter boundary. */
  click(detail: { index: number; seriesIndex: number }): void
  /** Events the chart fired, in order, by type. */
  events: { type: string; detail: unknown }[]
  /** The pure order-book functions, for arithmetic tests. */
  model: typeof import('../src/depth-model')
}

declare global {
  interface Window {
    depthScenario: DepthScenarioApi
  }
}
