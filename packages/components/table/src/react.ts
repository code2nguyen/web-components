/**
 * React bindings for `c2-table`, published as `@c2n/components/react` together with the generated JSX types (the
 * framework-types binding convention: `src/react.ts` → `dist/react.js`, re-exported by the package's `react.js`).
 * `react` is an optional peer dependency of `@c2n/components`: only an application that imports this module needs it, and
 * the component itself never loads it.
 *
 * ```tsx
 * import { useRenderedRows } from '@c2n/components/react'
 *
 * const tableRef = useRef<Table>(null)
 * const rendered = useRenderedRows(tableRef)
 * return (
 *   <c2-table ref={tableRef} row-key="id">
 *     <c2-table-column field="status" header="Status" cell-slot></c2-table-column>
 *     {rendered.map(({ line, key, row }) => <StatusBadge key={key} slot={`cell:${line}:status`} status={row.status} />)}
 *   </c2-table>
 * )
 * ```
 */
import { useEffect, useRef, useState, type RefObject } from 'react'
import { subscribeRenderedRows } from './rendered-rows.js'
import type { Table } from './table.js'
import type { TableRenderedRow } from './table-types.js'

/** One instance for "nothing rendered", so resetting an already empty state does not re-render. */
const NONE: TableRenderedRow[] = []

/**
 * The data rows a `c2-table` has rendered, as `{ line, key, row }`: the lines a `cell-slot` column needs children for
 * (`slot="cell:{line}:{field}"`).
 *
 * The table renders only a window of lines and names a slotted cell by its display line, so render children for
 * exactly these rows. A sort, filter or page change puts other rows on the same lines and fires `range-change`
 * again, which re-renders the component.
 *
 * - Seeded from the table's `renderedRange`, since the table may have rendered before the effect subscribes.
 * - Follows whatever element `ref` holds after each commit: a table that unmounts and remounts (a tab, a conditional)
 *   is re-subscribed, and the rows reset to `[]` in between.
 * - SSR-safe: nothing runs during render. On the server and until the element upgrades the result is `[]`, so every
 *   `cell-slot` cell shows the column's own `renderCell` or formatted value.
 */
export function useRenderedRows(ref: RefObject<Table | null>): TableRenderedRow[] {
  const [rendered, setRendered] = useState<TableRenderedRow[]>(NONE)
  const subscription = useRef<{ element: Table; dispose: () => void } | null>(null)

  // No dependency list: a ref is not reactive, so compare its element after every commit.
  useEffect(() => {
    const element = ref.current
    if (subscription.current?.element === element) return
    if (subscription.current) {
      subscription.current.dispose()
      subscription.current = null
      setRendered(NONE)
    }
    if (element) subscription.current = { element, dispose: subscribeRenderedRows(element, setRendered) }
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
