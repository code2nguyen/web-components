/** The contract between the bubble chart scenario page and its spec. */

export interface BubbleScenarioApi {
  /** Sends a hover callback through the adapter boundary, addressed by draw index as the engine reports it. */
  hover(detail: { index: number; seriesIndex: number; px: number; py: number } | null): void
  /** Sends a click callback through the adapter boundary. */
  click(detail: { index: number; seriesIndex: number }): void
}

declare global {
  interface Window {
    bubbleScenario: BubbleScenarioApi
  }
}
