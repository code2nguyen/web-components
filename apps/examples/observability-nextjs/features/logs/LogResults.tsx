'use client'

import type { SortModel } from '@c2n/table/table-types.js'
import { useRouter, useSearchParams } from 'next/navigation'
import { Fragment, useEffect, useMemo, useRef } from 'react'
import { useElementProperties } from '../../components/c2n/element-bindings'
import { useCustomEvent } from '../../components/c2n/useCustomEvent'
import { useRenderedRows } from '@c2n/table/react'
import { telemetryDataset } from '../../lib/data/dataset'
import { buildDatasetIndexes } from '../../lib/data/indexes'
import { parseNavigationState, type PageSize } from '../../lib/query/navigation-state'
import { parseDetailReturnContext, withAppBasePath } from '../../lib/query/internal-href'
import { useDemoState } from '../../providers/DemoStateProvider'
import { useReplay } from '../../providers/ReplayProvider'
import { highlightMatches } from '../traces/trace-search'
import { LogDetailSheet } from './LogDetailSheet'
import { LogFilters } from './LogFilters'
import { projectLogSearch } from './log-search'
import styles from './logs.module.css'

const indexes = buildDatasetIndexes(telemetryDataset)
function updateQuery(search: URLSearchParams, patch: Record<string, string>): string {
  const parameters = new URLSearchParams(search)
  for (const [key, value] of Object.entries(patch)) {
    if (value) parameters.set(key, value)
    else parameters.delete(key)
  }
  return parameters.size ? `?${parameters}` : './'
}

function Highlight({ text, query }: Readonly<{ text: string; query: string }>) {
  return (
    <>
      {highlightMatches(text, query).map((segment, index) => (
        <Fragment key={`${index}-${segment.text}`}>{segment.match ? <mark>{segment.text}</mark> : segment.text}</Fragment>
      ))}
    </>
  )
}

export function LogResults() {
  const router = useRouter()
  const readonlySearch = useSearchParams()
  const search = useMemo(() => new URLSearchParams(readonlySearch.toString()), [readonlySearch])
  const state = useMemo(() => parseNavigationState('logs', search, { allowedEnvironmentIds: telemetryDataset.environments.map(({ id }) => id) }), [search])
  const replay = useReplay()
  const snapshot = useMemo(
    () => ({ baselineInstant: telemetryDataset.baselineInstant, tick: replay.tick, status: replay.status, stepMs: replay.stepMs }),
    [replay.status, replay.stepMs, replay.tick],
  )
  const projection = useMemo(() => projectLogSearch(telemetryDataset, indexes, state, snapshot), [snapshot, state])
  const { demoState, setDemoState } = useDemoState()
  const tableRef = useRef<HTMLElementTagNameMap['c2-table']>(null)
  const pagerRef = useRef<HTMLElementTagNameMap['c2-pagination']>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const selectedId = typeof state.filters.log === 'string' ? state.filters.log : ''
  const query = typeof state.filters.q === 'string' ? state.filters.q : ''
  const detailReturn = parseDetailReturnContext(search)
  const rows = useMemo(
    () =>
      projection.items.map(({ log, service }) => ({
        id: log.id,
        timestamp: new Date(Date.parse(telemetryDataset.baselineInstant) + log.timestampOffsetMs).toISOString(),
        severity: log.severity,
        service: service?.name ?? log.serviceId,
        message: log.message,
        correlation: log.traceId ?? 'Uncorrelated',
      })),
    [projection.items],
  )
  const sortModel = useMemo<SortModel[]>(() => [{ field: state.sortField, direction: state.sortDirection }], [state.sortDirection, state.sortField])

  useEffect(() => {
    const baseline = document.getElementById('log-server-baseline')
    if (baseline) baseline.hidden = true
    if (projection.page !== state.page) router.replace(updateQuery(search, { page: String(projection.page) }), { scroll: false })
  }, [projection.page, router, search, state.page])

  // The open record is the table's single selection, so a click or Enter on a row opens it and the open record stays
  // marked in the list.
  const selectedRows = useMemo(() => (selectedId ? [selectedId] : []), [selectedId])
  useElementProperties(tableRef, 'c2-table', { rows, rowKey: 'id', sortModel, value: selectedRows }, [rows, sortModel, selectedRows])
  useElementProperties(
    pagerRef,
    'c2-pagination',
    { page: projection.page, pageSize: projection.pageSize, totalItems: projection.total, pageSizeOptions: [25, 50, 100] },
    [projection.page, projection.pageSize, projection.total],
  )
  // Opening and closing a record are history entries, so Back and Forward step through them (research.md: URL state
  // supports back/forward); filters, sorting and paging keep replacing the current entry. The record is client state
  // on an already loaded page, so the entry is a native pushState, which Next.js syncs into useSearchParams: a router
  // push would drop the exported route's trailing slash and request the missing `logs.txt` payload (a 404 and a full reload).
  const pushRecord = (log: string) => {
    const query = updateQuery(search, { log })
    const pathname = window.location.pathname.endsWith('/') ? window.location.pathname : `${window.location.pathname}/`
    window.history.pushState(null, '', `${pathname}${query.startsWith('?') ? query : ''}`)
  }
  useCustomEvent(tableRef, 'selection-change', (event) => {
    const id = event.detail.value[0]
    if (!id) {
      pushRecord('')
      return
    }
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : tableRef.current
    pushRecord(String(id))
  })
  useCustomEvent(tableRef, 'sort-change', (event) => {
    const sort = event.detail.sort[0]
    if (!sort) return
    router.replace(updateQuery(search, { sort: sort.field, dir: sort.direction, page: '1', log: '' }), { scroll: false })
  })
  useCustomEvent(pagerRef, 'page-change', (event) => router.replace(updateQuery(search, { page: String(event.detail.page), log: '' }), { scroll: false }))
  useCustomEvent(pagerRef, 'page-size-change', (event) =>
    router.replace(updateQuery(search, { pageSize: String(event.detail.pageSize as PageSize), page: '1', log: '' }), { scroll: false }),
  )
  const closeDetail = () => {
    // The sheet also reports `close` when Back/Forward already removed the record from the URL: add no entry then.
    if (new URLSearchParams(window.location.search).has('log')) pushRecord('')
    queueMicrotask(() => returnFocusRef.current?.focus())
  }
  const services = telemetryDataset.services.filter(({ environmentId }) => environmentId === state.environmentId)
  // `cell-slot` children go to the lines the table rendered (`cell:<line>:<field>`), each looked up by its row key.
  const rendered = useRenderedRows(tableRef)
  const logsById = useMemo(() => new Map(projection.items.map(({ log }) => [log.id, log])), [projection.items])

  return (
    <div className="feature-stack">
      {detailReturn && (
        <div className="page-actions">
          <c2-link-button href={withAppBasePath(detailReturn)}>
            {detailReturn.startsWith('/services/') ? 'Return to service detail' : 'Return to trace detail'}
          </c2-link-button>
        </div>
      )}
      <LogFilters services={services} />
      <p className="result-summary" aria-live="polite" aria-atomic="true">
        {demoState === 'normal' ? `${projection.total} logs. Page ${projection.page} of ${projection.pageCount}.` : `Log results: ${demoState}.`}
      </p>
      {demoState === 'loading' ? (
        <div className="skeleton-grid" aria-busy="true">
          <c2-skeleton label="Loading logs" />
          <c2-skeleton />
          <c2-skeleton />
        </div>
      ) : demoState === 'error' ? (
        <c2-status-panel
          status="error"
          heading="Log search unavailable"
          description="This is a simulated failure. Return to the normal demo state to try again."
        >
          <c2-button slot="actions" onClick={() => setDemoState('normal')}>
            Return to normal
          </c2-button>
        </c2-status-panel>
      ) : demoState === 'empty' ? (
        <c2-status-panel status="neutral" heading="No telemetry in this range" description="This is a synthetic empty state. Your log criteria are unchanged.">
          <c2-button slot="actions" onClick={() => setDemoState('normal')}>
            Return to normal
          </c2-button>
        </c2-status-panel>
      ) : projection.total === 0 ? (
        <c2-status-panel status="neutral" heading="No matching logs" description="Remove a criterion or widen the selected time range.">
          <c2-link-button slot="actions" href="./">
            Clear log criteria
          </c2-link-button>
        </c2-status-panel>
      ) : (
        <>
          <div className="table-scroll table-frame">
            <c2-table ref={tableRef} aria-label="Log search results" selection="single" stripe sortable empty-message="No matching logs">
              <c2-table-column field="timestamp" header="Timestamp" width="190px" />
              <c2-table-column field="severity" header="Severity" width="100px" sortable cell-slot />
              <c2-table-column field="service" header="Service" width="minmax(150px, 1fr)" sortable />
              <c2-table-column field="message" header="Message" width="minmax(320px, 2.4fr)" cell-slot />
              <c2-table-column field="correlation" header="Correlation" width="170px" cell-slot />
              {rendered.flatMap(({ line, key }) => {
                const log = logsById.get(key)
                if (!log) return []
                return [
                  <c2-badge
                    key={`${line}:severity`}
                    slot={`cell:${line}:severity`}
                    tone={log.severity === 'error' || log.severity === 'fatal' ? 'danger' : log.severity === 'warn' ? 'warning' : 'neutral'}
                  >
                    {log.severity}
                  </c2-badge>,
                  <span key={`${line}:correlation`} slot={`cell:${line}:correlation`} className="mono">
                    {log.traceId ?? 'Uncorrelated'}
                  </span>,
                  <span key={`${line}:message`} slot={`cell:${line}:message`} className={styles.message}>
                    <Highlight text={log.message} query={query} />
                  </span>,
                ]
              })}
            </c2-table>
            <div className="table-fallback" aria-label="Log result links">
              {projection.items.map(({ log, service }) => (
                <a key={log.id} href={withAppBasePath(`/logs/${updateQuery(search, { log: log.id })}`)}>
                  <strong>
                    <Highlight text={log.message} query={query} />
                  </strong>
                  <span>
                    {log.severity} · {service?.name ?? log.serviceId} · {log.traceId ?? 'Uncorrelated'}
                  </span>
                </a>
              ))}
            </div>
          </div>
          <c2-pagination ref={pagerRef} variant="compact" aria-label="Log result pages" show-first-last />
        </>
      )}
      <LogDetailSheet
        log={projection.selected}
        requestedId={selectedId}
        state={state}
        traceExists={Boolean(projection.selected?.traceId && indexes.tracesById.has(projection.selected.traceId))}
        onClose={closeDetail}
      />
    </div>
  )
}
