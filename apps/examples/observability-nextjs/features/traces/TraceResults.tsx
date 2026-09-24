'use client'

import type { SortModel } from '@c2n/table/table-types.js'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useRef } from 'react'
import { useElementProperties } from '../../components/c2n/element-bindings'
import { useCustomEvent } from '../../components/c2n/useCustomEvent'
import { telemetryDataset } from '../../lib/data/dataset'
import { buildDatasetIndexes } from '../../lib/data/indexes'
import { parseNavigationState, type PageSize } from '../../lib/query/navigation-state'
import { withAppBasePath } from '../../lib/query/internal-href'
import { useDemoState } from '../../providers/DemoStateProvider'
import { useReplay } from '../../providers/ReplayProvider'
import { TraceFilters } from './TraceFilters'
import { projectTraceSearch, traceDetailHref } from './trace-search'

const indexes = buildDatasetIndexes(telemetryDataset)
function queryHref(search: URLSearchParams, patch: Record<string, string>): string {
  const parameters = new URLSearchParams(search)
  for (const [key, value] of Object.entries(patch)) {
    if (value) parameters.set(key, value)
    else parameters.delete(key)
  }
  return parameters.size ? `?${parameters}` : './'
}

export function TraceResults() {
  const router = useRouter()
  const readonlySearch = useSearchParams()
  const search = useMemo(() => new URLSearchParams(readonlySearch.toString()), [readonlySearch])
  const state = useMemo(() => parseNavigationState('traces', search, { allowedEnvironmentIds: telemetryDataset.environments.map(({ id }) => id) }), [search])
  const replay = useReplay()
  const snapshot = useMemo(
    () => ({ baselineInstant: telemetryDataset.baselineInstant, tick: replay.tick, status: replay.status, stepMs: replay.stepMs }),
    [replay.status, replay.stepMs, replay.tick],
  )
  const projection = useMemo(() => projectTraceSearch(telemetryDataset, indexes, state, { snapshot }), [snapshot, state])
  const { demoState, setDemoState } = useDemoState()
  const tableRef = useRef<HTMLElementTagNameMap['c2-table']>(null)
  const pagerRef = useRef<HTMLElementTagNameMap['c2-pagination']>(null)
  const rows = useMemo(
    () =>
      projection.items.map(({ trace, service }) => ({
        id: trace.id,
        traceId: trace.id,
        service: service?.name ?? trace.rootServiceId,
        operation: trace.rootOperation,
        status: trace.status,
        duration: `${trace.durationMs} ms`,
        started: `${Math.abs(Math.round(trace.startOffsetMs / 1000))}s before baseline`,
      })),
    [projection.items],
  )
  const sortModel = useMemo<SortModel[]>(
    () => [{ field: state.sortField === 'start' ? 'started' : state.sortField, direction: state.sortDirection }],
    [state.sortDirection, state.sortField],
  )

  useEffect(() => {
    const baseline = document.getElementById('trace-server-baseline')
    if (baseline) baseline.hidden = true
    if (projection.page !== state.page) router.replace(queryHref(search, { page: String(projection.page) }), { scroll: false })
  }, [projection.page, router, search, state.page])

  useElementProperties(tableRef, 'c2-table', { rows, rowKey: 'id', sortModel }, [rows, sortModel])
  useElementProperties(
    pagerRef,
    'c2-pagination',
    { page: projection.page, pageSize: projection.pageSize, totalItems: projection.total, pageSizeOptions: [25, 50, 100] },
    [projection.page, projection.pageSize, projection.total],
  )
  useCustomEvent(tableRef, 'row-click', (event) => router.push(traceDetailHref(String((event.detail.row as { id: string }).id), state)))
  useCustomEvent(tableRef, 'sort-change', (event) => {
    const sort = event.detail.sort[0]
    if (!sort) return
    router.replace(queryHref(search, { sort: sort.field === 'started' ? 'start' : sort.field, dir: sort.direction, page: '1' }), { scroll: false })
  })
  useCustomEvent(pagerRef, 'page-change', (event) => router.replace(queryHref(search, { page: String(event.detail.page) }), { scroll: false }))
  useCustomEvent(pagerRef, 'page-size-change', (event) =>
    router.replace(queryHref(search, { pageSize: String(event.detail.pageSize as PageSize), page: '1' }), { scroll: false }),
  )

  const services = telemetryDataset.services.filter(({ environmentId }) => environmentId === state.environmentId)
  const operations = [
    ...new Set(telemetryDataset.traces.filter(({ environmentId }) => environmentId === state.environmentId).map(({ rootOperation }) => rootOperation)),
  ].sort()
  return (
    <div className="feature-stack">
      <TraceFilters services={services} operations={operations} />
      <p className="result-summary" aria-live="polite" aria-atomic="true">
        {demoState === 'normal' ? `${projection.total} traces. Page ${projection.page} of ${projection.pageCount}.` : `Trace results: ${demoState}.`}
      </p>
      {demoState === 'loading' ? (
        <div className="skeleton-grid" aria-label="Loading traces">
          <c2-skeleton />
          <c2-skeleton />
          <c2-skeleton />
        </div>
      ) : demoState === 'error' ? (
        <c2-status-panel
          status="error"
          heading="Trace search unavailable"
          description="This is a simulated failure. Return to the normal demo state to try again."
        >
          <c2-button slot="actions" onClick={() => setDemoState('normal')}>
            Return to normal
          </c2-button>
        </c2-status-panel>
      ) : demoState === 'empty' ? (
        <c2-status-panel
          status="neutral"
          heading="No telemetry in this range"
          description="This is a synthetic empty state. Your trace criteria are unchanged."
        >
          <c2-button slot="actions" onClick={() => setDemoState('normal')}>
            Return to normal
          </c2-button>
        </c2-status-panel>
      ) : projection.total === 0 ? (
        <c2-status-panel status="neutral" heading="No matching traces" description="Remove a criterion or widen the selected time range.">
          <c2-link-button slot="actions" href="./">
            Clear trace criteria
          </c2-link-button>
        </c2-status-panel>
      ) : (
        <>
          <div className="table-scroll table-frame">
            <c2-table ref={tableRef} aria-label="Trace search results" stripe sortable empty-message="No matching traces">
              <c2-table-column field="traceId" header="Trace" width="minmax(180px, 1.4fr)" />
              <c2-table-column field="service" header="Service" width="minmax(150px, 1fr)" sortable cell-slot />
              <c2-table-column field="operation" header="Operation" width="minmax(200px, 1.5fr)" />
              <c2-table-column field="status" header="Status" width="100px" sortable cell-slot />
              <c2-table-column field="duration" header="Duration" width="110px" align="end" sortable cell-slot />
              <c2-table-column field="started" header="Started" width="150px" sortable />
              {projection.items.flatMap(({ trace, service }) => [
                <strong key={`${trace.id}-service`} slot={`cell:${trace.id}:service`}>
                  {service?.name ?? trace.rootServiceId}
                </strong>,
                <c2-badge key={`${trace.id}-status`} slot={`cell:${trace.id}:status`} tone={trace.status === 'error' ? 'danger' : 'success'}>
                  {trace.status}
                </c2-badge>,
                <span key={`${trace.id}-duration`} slot={`cell:${trace.id}:duration`} className="mono">
                  {trace.durationMs} ms
                </span>,
              ])}
            </c2-table>
            <div className="table-fallback" aria-label="Trace result links">
              {projection.items.map(({ trace, service }) => (
                <a key={trace.id} href={withAppBasePath(traceDetailHref(trace.id, state))}>
                  <strong>{trace.rootOperation}</strong>
                  <span>
                    {service?.name ?? trace.rootServiceId} · {trace.status} · {trace.durationMs} ms
                  </span>
                </a>
              ))}
            </div>
          </div>
          <c2-pagination ref={pagerRef} variant="compact" aria-label="Trace result pages" show-first-last />
        </>
      )}
    </div>
  )
}
