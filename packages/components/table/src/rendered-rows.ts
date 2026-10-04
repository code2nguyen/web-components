/**
 * Framework-agnostic core of `useRenderedRows` (`@c2n/components/react`, `@c2n/components/vue`), exported from the
 * `@c2n/components/table` entry for every other framework.
 *
 * A `cell-slot` column takes its cells from light-DOM children named `cell:{line}:{field}`, and the table renders only
 * a window of lines, so an application renders children for exactly the rows `range-change` reports. This module
 * holds no framework code and imports nothing at runtime: it does not even register `c2-table`.
 */
import type { Table } from './table.js'
import type { TableRangeChangeEventDetail, TableRenderedRow } from './table-types.js'

/** Called with the rows a table has rendered: once on subscribing when it already rendered some, then on every `range-change`. */
export type RenderedRowsListener = (rows: TableRenderedRow[]) => void

/**
 * Calls `listener` with the data rows `element` has rendered (`{ line, key, row }`, in display order) and returns the
 * function that unsubscribes.
 *
 * The table may have rendered before the subscription, so a non-empty `renderedRange` is reported synchronously
 * first. An element that is not upgraded yet (its module not loaded, or the page still hydrating) has no
 * `renderedRange`; it reports with its first `range-change` once it upgrades. `null`/`undefined` subscribes to
 * nothing, which lets a framework pass a ref that is not attached yet.
 */
export function subscribeRenderedRows(element: Table | null | undefined, listener: RenderedRowsListener): () => void {
  if (!element) return () => {}
  const onRangeChange = (event: CustomEvent<TableRangeChangeEventDetail>) => listener(event.detail.rows)
  element.addEventListener('range-change', onRangeChange)
  // Read through the getter only when the class is installed: on a not-yet-upgraded element the property is absent.
  const last = (element.renderedRange as TableRangeChangeEventDetail | undefined)?.rows
  if (last?.length) listener(last)
  return () => element.removeEventListener('range-change', onRangeChange)
}
