import { useEffect, useState, type RefObject } from 'react'
import type { Table } from '@c2n/table'
import type { TableRenderedRow } from '@c2n/table/table-types.js'
import { useCustomEvent } from './useCustomEvent'

/**
 * The data rows a `c2-table` has rendered, as `{ line, key, row }` — what a `cellSlot` column needs children for.
 *
 * The table names a slotted cell by its display line (`cell:<line>:<field>`) and renders only a window of lines, so
 * the app renders children for exactly the lines `range-change` reports rather than one per row. A sort, a filter
 * or a page change puts other rows on the same lines and fires `range-change` again, which re-renders them here.
 *
 * The table may have rendered before this effect subscribes, so the last window (`renderedRange`) seeds the state.
 * Until then there are no children and every cell shows the column's own fallback.
 */
export function useRenderedRows(ref: RefObject<Table | null>): TableRenderedRow[] {
  const [rendered, setRendered] = useState<TableRenderedRow[]>([])

  useCustomEvent(ref, 'range-change', (event) => setRendered(event.detail.rows))
  useEffect(() => {
    if (ref.current) setRendered(ref.current.renderedRange.rows)
  }, [ref])

  return rendered
}
