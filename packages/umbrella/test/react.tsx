// One import types every c2-* tag in JSX, and carries the packages' React hooks.
import { useRenderedRows } from '@c2n/components/react'
import type { Table, TableRenderedRow } from '@c2n/components/table'
import type { RefObject } from 'react'

// The hook takes a ref to the table class the table entry exports: one declaration, not a copy per entry.
export const hook: (ref: RefObject<Table | null>) => TableRenderedRow[] = useRenderedRows
export const rendered = (ref: Parameters<typeof useRenderedRows>[0]): TableRenderedRow[] => useRenderedRows(ref)

export const form = (
  <form>
    <c2-text-field name="title" value="Alert rule" />
    <c2-select name="region" />
    <c2-table rows={[{ id: 1 }]} row-key="id" />
    <c2-line-chart />
    <c2-chat-message />
    {/* @ts-expect-error: a misspelt property is rejected, so the declarations are really loaded */}
    <c2-button disabledd />
  </form>
)
