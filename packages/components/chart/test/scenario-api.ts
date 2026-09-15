/**
 * The contract between the scenario page and the specs.
 *
 * Counting engine calls is what lets the perf suite assert the init/update split — that data and
 * presentation travel separate paths — without measuring wall-clock time, which would not hold on every
 * machine.
 */

export interface EngineCounts {
  /** How many times an engine instance has been constructed. */
  created: number
  /** How many times data was pushed without rebuilding options. */
  setData: number
  /** How many times the option object was rebuilt. */
  setOptions: number
  /** How many times the engine was told to resize. */
  resize: number
}

export interface ChartScenarioApi {
  counts(): EngineCounts
  /** Appends `count` realtime points through the chart's append path. */
  append(count: number): void
  /** Replaces the dataset with `points` freshly generated rows. */
  setData(points: number): void
  /** Sends a normalized hover callback through the adapter boundary. */
  hover(detail: { index: number; seriesIndex: number; px: number; py: number } | null): void
  element(): HTMLElement
}

declare global {
  interface Window {
    chartScenario: ChartScenarioApi
  }
}
