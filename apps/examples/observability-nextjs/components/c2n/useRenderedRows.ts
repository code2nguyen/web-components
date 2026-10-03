'use client'

import type { TableRangeChangeEventDetail, TableRenderedRow } from '@c2n/table/table-types.js'
import { useEffect, useRef, useState, type RefObject } from 'react'

type TableElement = HTMLElementTagNameMap['c2-table']

/**
 * The data rows a `c2-table` has rendered, as `{ line, key, row }`: the lines a `cell-slot` column needs children for.
 *
 * The table names a slotted cell by its display line (`cell:<line>:<field>`, page offset included) and renders only a
 * window of lines, so children are rendered for exactly the lines `range-change` reports. A sort, filter or page change
 * puts other rows on the same lines and fires `range-change` again, which re-renders them.
 *
 * Before the element upgrades and reports — on the server, during hydration — there are no children, so every
 * `cell-slot` cell shows the column's own formatted value. The tables here mount and unmount with the demo state, so
 * the subscription follows whatever element the ref holds after each commit rather than the first one only.
 */
export function useRenderedRows(ref: RefObject<TableElement | null>): TableRenderedRow[] {
  const [rendered, setRendered] = useState<TableRenderedRow[]>([])
  const subscription = useRef<{ element: TableElement; dispose: () => void } | null>(null)

  useEffect(() => {
    const element = ref.current
    if (subscription.current?.element === element) return
    if (subscription.current) {
      subscription.current.dispose()
      subscription.current = null
      setRendered([])
    }
    if (!element) return
    const listener = (event: Event) => setRendered((event as CustomEvent<TableRangeChangeEventDetail>).detail.rows)
    element.addEventListener('range-change', listener)
    subscription.current = { element, dispose: () => element.removeEventListener('range-change', listener) }
    // Already rendered before this subscription (undefined while the element is not upgraded yet).
    const last = (element.renderedRange as TableRangeChangeEventDetail | undefined)?.rows
    if (last?.length) setRendered(last)
  })

  useEffect(
    () => () => {
      subscription.current?.dispose()
      subscription.current = null
    },
    [],
  )

  return rendered
}
