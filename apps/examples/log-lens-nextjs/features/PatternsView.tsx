'use client'

import { useRenderedRows } from '@c2n/table/react'
import { useMemo, useRef, useState } from 'react'
import { useElementProperties } from '@/components/c2n/element-bindings'
import { useCustomEvent } from '@/components/c2n/useCustomEvent'
import { PatternText } from '@/components/ui/PatternText'
import { Segmented } from '@/components/ui/Segmented'
import { SeverityBadge } from '@/components/ui/SeverityBadge'
import type { Analysis } from '@/lib/analysis'
import { isEmptyFocus, type Focus } from '@/lib/focus'
import { formatClock, formatNumber, formatPercent } from '@/lib/format'
import { patternHistograms } from '@/lib/insights'
import type { LogRecord } from '@/lib/otlp'
import { severityRank, type Pattern } from '@/lib/patterns'
import { PatternDetail } from './PatternDetail'
import type { LensActions } from './types'

type Order = 'common' | 'rare' | 'new' | 'trouble'

const ORDERS: ReadonlyArray<{ value: Order; label: string }> = [
  { value: 'common', label: 'Most common' },
  { value: 'rare', label: 'Rarest' },
  { value: 'new', label: 'Newest' },
  { value: 'trouble', label: 'Warnings & errors' },
]

interface Row extends Record<string, unknown> {
  id: string
  template: string
  count: number
  share: string
  severity: number
  services: string
  first: string
}

function Trend({ line, data, label }: Readonly<{ line: number; data: number[]; label: string }>) {
  const ref = useRef<HTMLElementTagNameMap['c2-sparkline']>(null)
  useElementProperties(ref, 'c2-sparkline', { data }, [data])
  return <c2-sparkline ref={ref} slot={`cell:${line}:trend`} className="ll-trend" type="area" tone="neutral" aria-label={label} />
}

export function PatternsView({
  analysis,
  records,
  lens,
  selectedId,
  actions,
}: Readonly<{ analysis: Analysis; records: LogRecord[]; lens: Focus; selectedId: string; actions: LensActions }>) {
  const [order, setOrder] = useState<Order>('common')
  const tableRef = useRef<HTMLElementTagNameMap['c2-table']>(null)
  // `cell-slot` children go to the display lines the table rendered (`cell:<line>:<field>`), looked up by row key.
  const rendered = useRenderedRows(tableRef)
  const filtered = !isEmptyFocus(lens)

  const { visible, counts, histograms } = useMemo(() => {
    const counts = new Map<string, number>()
    for (const record of records) counts.set(analysis.patternOf[record.index], (counts.get(analysis.patternOf[record.index]) ?? 0) + 1)
    const visible: Pattern[] = analysis.patterns.filter((pattern) => counts.has(pattern.id))
    const by = (pattern: Pattern) => counts.get(pattern.id) ?? 0
    if (order === 'common') visible.sort((a, b) => by(b) - by(a))
    if (order === 'rare') visible.sort((a, b) => by(a) - by(b) || b.first - a.first)
    if (order === 'new') visible.sort((a, b) => b.first - a.first)
    if (order === 'trouble') {
      visible.splice(0, visible.length, ...visible.filter((pattern) => severityRank(pattern.severity) >= 4))
      visible.sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || by(b) - by(a))
    }
    return { visible, counts, histograms: patternHistograms(analysis, records) }
  }, [analysis, records, order])

  const rows = useMemo<Row[]>(
    () =>
      visible.map((pattern) => ({
        id: pattern.id,
        template: pattern.template,
        count: counts.get(pattern.id) ?? 0,
        share: formatPercent((counts.get(pattern.id) ?? 0) / Math.max(1, records.length), 1),
        severity: severityRank(pattern.severity),
        services: pattern.services.join(', '),
        first: formatClock(pattern.first),
      })),
    [visible, counts, records.length],
  )
  // With nothing chosen, the detail pane shows the first row rather than an empty panel.
  const shownId = visible.some((pattern) => pattern.id === selectedId) ? selectedId : (visible[0]?.id ?? '')
  const selection = useMemo(() => (shownId ? [shownId] : []), [shownId])
  useElementProperties(tableRef, 'c2-table', { rows, rowKey: 'id', value: selection }, [rows, selection])
  useCustomEvent(tableRef, 'row-click', (event) => actions.openPattern(String((event.detail.row as Row).id)))

  const covered = visible.slice(0, 5).reduce((sum, pattern) => sum + (counts.get(pattern.id) ?? 0), 0)
  const rare = analysis.patterns.filter((pattern) => pattern.count <= 3).length

  return (
    <div className="ll-stack">
      <div className="ll-section-head">
        <div>
          <h2>
            {formatNumber(records.length)} {filtered ? 'records in the lens' : 'lines'} are {formatNumber(visible.length)} kinds of message
          </h2>
          <p className="ll-muted">
            {order === 'common' &&
              `The top five cover ${formatPercent(covered / Math.max(1, records.length))}. Everything below them is where the surprises live.`}
            {order === 'rare' &&
              `${rare} patterns occur three times or fewer. One-off messages — restarts, config reloads, breaker trips — are often the most telling lines in a file.`}
            {order === 'new' && 'Ordered by first appearance, latest first: what did the system start saying, and when?'}
            {order === 'trouble' && 'Only patterns that were logged at warning level or worse.'}
          </p>
        </div>
        <Segmented label="Order patterns" value={order} options={ORDERS} onChange={setOrder} />
      </div>
      {rows.length ? (
        <c2-split-panel className="ll-split" position={58} min={35} max={75} label="Resize the pattern list and its detail">
          <c2-table ref={tableRef} slot="start" className="ll-table ll-table--patterns" aria-label="Message patterns" row-key="id" selection="single" stripe>
            <c2-table-column field="severity" header="Level" width="84px" cell-slot />
            <c2-table-column field="template" header="Pattern" width="minmax(240px, 3fr)" cell-slot />
            <c2-table-column field="count" header="Count" width="80px" align="end" format="number" />
            <c2-table-column field="trend" header="Over time" width="140px" cell-slot />
            <c2-table-column field="first" header="First seen" width="96px" />
            {rendered.flatMap(({ line, key }) => {
              const pattern = analysis.patternById.get(key)
              if (!pattern) return []
              return [
                <SeverityBadge key={`${line}:severity`} slot={`cell:${line}:severity`} severity={pattern.severity} />,
                <PatternText key={`${line}:template`} slot={`cell:${line}:template`} template={pattern.template} />,
                <Trend key={`${line}:trend`} line={line} data={histograms.get(pattern.id) ?? []} label={`Occurrences of ${pattern.id} over time`} />,
              ]
            })}
          </c2-table>
          <div slot="end" className="ll-split__detail">
            <PatternDetail analysis={analysis} patternId={shownId} actions={actions} />
          </div>
        </c2-split-panel>
      ) : (
        <c2-status-panel
          status="empty"
          heading="No pattern matches"
          description="Nothing in the lens is logged at warning level or worse. Try another order or clear the lens."
        />
      )}
    </div>
  )
}
