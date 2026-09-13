/** The contract between the scenario page and the specs, so neither side has to guess at the other's shape. */
export interface VirtualListStats {
  /** Rendered rows, including the skeletons of a block that has not arrived. */
  renderedItems: number
  /** Every element in the list's own shadow root — the number that must not grow with the dataset. */
  shadowElements: number
  firstIndex: number
  lastIndex: number
  scrollHeight: number
  scrollTop: number
}

export interface VirtualListScenarioApi {
  /** Fills the list in `main` with `count` deterministic people. */
  fill(count: number): Promise<void>
  /** Swaps `items` for a data source over `total` of the same people, filtering and sorting server-side. */
  useDataSource(total: number): Promise<void>
  /** Blocks every pending and future `getItems` call until `release()` is called. */
  hold(): void
  release(): Promise<void>
  /** How many blocks the data source has been asked for since it was installed. */
  requestCount(): number
  stats(): VirtualListStats
  scrollTo(top: number): Promise<void>
  settle(): Promise<void>
}

declare global {
  interface Window {
    virtualListScenario: VirtualListScenarioApi
  }
}
