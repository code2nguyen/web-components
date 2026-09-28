'use client'

import type { TableColumnConfig } from '@c2n/table/table-types.js'
import type { StepNode } from '@c2n/steps/step-types.js'
import { useMemo, useRef, useState } from 'react'
import { useElementProperties } from '@/components/c2n/element-bindings'
import { useCustomEvent } from '@/components/c2n/useCustomEvent'
import { LiftList } from '@/components/ui/LiftList'
import { PatternText } from '@/components/ui/PatternText'
import { Segmented } from '@/components/ui/Segmented'
import { isProblem, journeyLift, type Analysis, type DivergenceSignature } from '@/lib/analysis'
import { formatClock, formatDuration, formatNumber, formatPercent, shorten } from '@/lib/format'
import type { LogRecord } from '@/lib/otlp'
import type { LensActions } from './types'

type Filter = 'failed' | 'all' | 'slowest'

interface Row extends Record<string, unknown> {
  traceId: string
  outcome: string
  start: string
  entry: string
  services: string
  steps: number
  duration: number
}

function outcomeCell({ value }: { value: unknown }): HTMLElement {
  // Rendered inside the table's shadow root, so it carries its colour inline through an inherited token.
  const cell = document.createElement('span')
  const failed = value === 'Failed'
  cell.textContent = failed ? '✕ Failed' : '✓ Succeeded'
  cell.style.color = failed ? 'var(--ll-danger)' : 'var(--ll-success)'
  cell.style.fontWeight = '600'
  return cell
}

const COLUMNS: TableColumnConfig[] = [
  { field: 'outcome', header: 'Outcome', width: '120px', renderCell: outcomeCell, sortable: true },
  { field: 'start', header: 'Started', width: '100px', sortable: true },
  { field: 'entry', header: 'Request', width: 'minmax(220px, 2fr)' },
  { field: 'services', header: 'Path through services', width: 'minmax(220px, 2fr)' },
  { field: 'steps', header: 'Steps', width: '80px', align: 'end', sortable: true },
  { field: 'duration', header: 'Duration', width: '110px', align: 'end', sortable: true, renderCell: ({ value }) => formatDuration(Number(value)) },
]

function stepOf(patternById: Analysis['patternById'], signature: DivergenceSignature, side: 'failed' | 'ok'): StepNode {
  const pattern = patternById.get(signature.patternId)
  const primary = side === 'failed' ? signature.failedShare : signature.okShare
  const other = side === 'failed' ? signature.okShare : signature.failedShare
  return {
    id: `${side}-${signature.patternId}`,
    label: shorten(pattern?.template ?? signature.patternId, 64),
    detail: pattern?.services.join(', '),
    trailing: `${formatPercent(primary)} vs ${formatPercent(other)}`,
    status: side === 'ok' ? 'success' : pattern && isProblem(pattern.severity) ? 'error' : 'warning',
  }
}

function Branch({ label, steps, tone }: Readonly<{ label: string; steps: StepNode[]; tone: 'danger' | 'success' | 'neutral' }>) {
  const ref = useRef<HTMLElementTagNameMap['c2-steps']>(null)
  useElementProperties(ref, 'c2-steps', { steps }, [steps])
  return (
    <div className={`ll-branch ll-branch--${tone}`}>
      <p className="ll-branch__label">{label}</p>
      <c2-steps ref={ref} marker="icon" aria-label={label} />
    </div>
  )
}

export function JourneysView({ analysis, records, actions }: Readonly<{ analysis: Analysis; records: LogRecord[]; actions: LensActions }>) {
  const [filter, setFilter] = useState<Filter>('failed')
  const tableRef = useRef<HTMLElementTagNameMap['c2-table']>(null)
  const { divergence, patternById } = analysis
  const entry = patternById.get(divergence.entry)

  const lifts = useMemo(() => journeyLift(analysis.records, analysis.journeys, divergence.entry, 6), [analysis, divergence.entry])

  const shared = useMemo<StepNode[]>(
    () =>
      divergence.sharedPath.map((id) => ({
        id: `shared-${id}`,
        label: shorten(patternById.get(id)?.template ?? id, 64),
        detail: patternById.get(id)?.services.join(', '),
        status: 'success',
      })),
    [divergence, patternById],
  )
  const failing = useMemo(() => divergence.signatures.map((signature) => stepOf(patternById, signature, 'failed')), [divergence, patternById])
  const healthy = useMemo(() => divergence.missing.map((signature) => stepOf(patternById, signature, 'ok')), [divergence, patternById])

  const inLens = useMemo(() => new Set(records.map((record) => record.traceId).filter(Boolean)), [records])
  const rows = useMemo<Row[]>(() => {
    let journeys = analysis.journeys.filter((journey) => inLens.has(journey.traceId))
    if (filter === 'failed') journeys = journeys.filter((journey) => journey.failed)
    if (filter === 'slowest') journeys = [...journeys].sort((a, b) => b.duration - a.duration).slice(0, 200)
    return journeys.map((journey) => ({
      traceId: journey.traceId,
      outcome: journey.failed ? 'Failed' : 'Succeeded',
      start: formatClock(journey.start),
      entry: shorten(patternById.get(journey.entry)?.template ?? journey.entry, 70),
      services: journey.services.join(' → '),
      steps: journey.records.length,
      duration: journey.duration,
    }))
  }, [analysis, inLens, filter, patternById])
  useElementProperties(tableRef, 'c2-table', { rows, columns: COLUMNS, rowKey: 'traceId' }, [rows])
  useCustomEvent(tableRef, 'row-click', (event) => actions.openTrace(String((event.detail.row as Row).traceId)))

  if (!analysis.journeys.length)
    return (
      <c2-status-panel
        status="empty"
        heading="No trace ids in this file"
        description="Journeys are built from the traceId of each log record. Enable trace context in your OpenTelemetry logging bridge to follow requests end to end."
      />
    )

  const firstFork = divergence.signatures[0] ? patternById.get(divergence.signatures[0].patternId) : undefined
  const firstHealthy = divergence.missing[0] ? patternById.get(divergence.missing[0].patternId) : undefined

  return (
    <div className="ll-stack">
      {divergence.failed > 0 && entry ? (
        <c2-card className="ll-panel ll-fork">
          <div slot="header" className="ll-panel__head">
            <div>
              <p className="ll-eyebrow">Where failing requests go wrong</p>
              <h2>
                {formatNumber(divergence.failed)} of {formatNumber(divergence.failed + divergence.ok)} requests of this kind failed
              </h2>
            </div>
          </div>
          <p className="ll-fork__lead">
            Comparing every request that starts with <PatternText className="ll-pattern--inline" template={entry.template} />.
            {shared.length > 0 && ` Failed and successful ones share the first ${shared.length} steps.`}
            {firstFork && (
              <>
                {' '}
                Failing ones then part ways at <PatternText className="ll-pattern--inline" template={firstFork.template} />
              </>
            )}
            {firstHealthy && (
              <>
                , where healthy ones continue with <PatternText className="ll-pattern--inline" template={firstHealthy.template} />
              </>
            )}
            .
          </p>
          <div className="ll-fork__diagram">
            {shared.length > 0 && <Branch label="Common path" steps={shared} tone="neutral" />}
            <div className="ll-fork__split">
              <Branch label="Only in failed requests (share of failed vs successful)" steps={failing} tone="danger" />
              <Branch label="Only in successful requests (share of successful vs failed)" steps={healthy} tone="success" />
            </div>
          </div>
          {lifts.length > 0 && (
            <>
              <h3 className="ll-fork__subtitle">What the failed requests have in common</h3>
              <LiftList
                lifts={lifts}
                inside="failed"
                outside="successful"
                onPick={(lift) => actions.setLens({ attribute: { key: lift.key, value: lift.value } })}
              />
            </>
          )}
          <div slot="footer" className="ll-chapter__actions">
            <c2-button className="ll-button--primary" onClick={() => setFilter('failed')}>
              List the failed requests
            </c2-button>
            {firstFork && (
              <c2-button className="ll-button--quiet" onClick={() => actions.openPattern(firstFork.id)}>
                Inspect the fork point
              </c2-button>
            )}
          </div>
        </c2-card>
      ) : (
        <c2-status-panel
          status="success"
          heading="No request failed"
          description={`All ${formatNumber(analysis.journeys.length)} requests ended without an error record.`}
        />
      )}

      <div className="ll-section-head">
        <div>
          <h2>Requests</h2>
          <p className="ll-muted">
            {formatNumber(rows.length)} shown · {formatNumber(inLens.size)} requests touch the lens. Click one to read it as a timeline.
          </p>
        </div>
        <Segmented
          label="Filter requests"
          value={filter}
          options={[
            { value: 'failed', label: 'Failed' },
            { value: 'slowest', label: 'Slowest' },
            { value: 'all', label: 'All' },
          ]}
          onChange={setFilter}
        />
      </div>
      <c2-table
        ref={tableRef}
        className="ll-table"
        aria-label="Requests reconstructed from trace ids"
        row-key="traceId"
        stripe
        sortable
        empty-message="No request matches"
      />
    </div>
  )
}
