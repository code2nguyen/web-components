/** Shape of the harness `scenarios.ts` installs on `window`, shared with the specs that drive it. */

/** Counts that must stay bounded however large the dataset is. */
export interface TableBenchStats {
  /** Rows the table currently has in its shadow DOM (excludes the header and the empty/error row). */
  rowElements: number
  /** Every element in the table's shadow DOM, so a leak anywhere in the row template shows up. */
  shadowElements: number
  /** First and last row index currently rendered, read from `aria-rowindex`. */
  firstIndex: number
  lastIndex: number
  /** Height of the scrolled content, i.e. what the scrollbar is sized against. */
  scrollHeight: number
  scrollTop: number
  /** Text of the first cell of the first rendered row, to prove the window shows the right slice. */
  firstCellText: string
}

/** A deterministic, fully controlled stand-in for a server, so paging can be asserted without timers. */
export interface PagedSourceOptions {
  /** Rows the fake server holds. */
  total: number
  /** A request whose `start` equals this rejects once, to cover the sticky `error` path. */
  failAt?: number
  /** Park every request until `release()` is called, to cover the loading state. */
  manual?: boolean
}

/** One `getRows` call the table made, so the specs can assert the request contract, not just the rendered output. */
export interface PagedRequest {
  start: number
  count: number
  sort: { field: string; direction: string }[]
}

export interface TableScenarioApi {
  /** Builds a paged table in `main` with a deterministic source, and waits for its first page. */
  usePagedSource(options: PagedSourceOptions & { pageSize: number; pager?: boolean }): Promise<void>
  /** Settles the request currently parked by `manual`. */
  release(): Promise<void>
  /** Every request the table has made, in order. */
  requests(): PagedRequest[]
  /** Shrinks the fake server to `total` rows, as a delete would. */
  setTotal(total: number): void
}

export interface TableBenchApi {
  /**
   * Creates a table, gives it `count` rows and waits for the first paint. Returns the milliseconds that took —
   * building the row array happens before the clock starts, so the number is the table's own cost.
   */
  mount(count: number): Promise<number>
  /** Replaces one field of one row, the realtime-update case. Returns the milliseconds it took. */
  patch(index: number): Promise<number>
  /** Applies `ticks` single-row patches back to back, as a feed would. Returns the total milliseconds. */
  stream(ticks: number): Promise<number>
  /** Swaps the whole dataset for a new one of the same size. Returns the milliseconds it took. */
  replace(): Promise<number>
  /** Appends `count` rows to the end, as a paged feed would. Returns the milliseconds it took. */
  append(count: number): Promise<number>
  /** Scrolls to `ratio` (0–1) of the scrollable range. Returns the milliseconds it took. */
  scrollToRatio(ratio: number): Promise<number>
  /** Sorts by `field`, ascending. Returns the milliseconds it took. */
  sort(field: string): Promise<number>
  /** Calls the table's own `scrollToIndex`. Returns the milliseconds it took. */
  scrollToIndex(index: number): Promise<number>
  /** Marks every currently rendered row element, so a later `reusedRows()` can tell reuse from recreation. */
  markRows(): number
  /** How many of the marked row elements are still the same DOM nodes. */
  reusedRows(): number
  stats(): TableBenchStats
}

declare global {
  interface Window {
    tableScenario: TableScenarioApi
    tableBench: TableBenchApi
  }
}
