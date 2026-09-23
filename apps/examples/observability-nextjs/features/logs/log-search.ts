import type { DatasetIndexes } from '../../lib/data/indexes.ts'
import type { LogRecord, ReplayClockSnapshot, Service, TelemetryDataset } from '../../lib/domain/telemetry.ts'
import { baselineReplaySnapshot, isOffsetVisible } from '../../lib/query/time-window.ts'
import { buildNavigationHref, normalizeNavigationState, type InvestigationState, type PageSize } from '../../lib/query/navigation-state.ts'
import type { SearchCriterion } from '../traces/trace-search.ts'

export interface LogSearchRow {
  log: LogRecord
  service: Service | null
}

export interface LogSearchProjection {
  items: readonly LogSearchRow[]
  total: number
  page: number
  pageCount: number
  pageSize: PageSize
  selected: LogRecord | null
  criteria: readonly SearchCriterion[]
}

const SEVERITY_ORDER: Record<LogRecord['severity'], number> = { debug: 0, info: 1, warn: 2, error: 3, fatal: 4 }

function values(value: string | string[] | undefined): string[] {
  return Array.isArray(value) ? value : value ? [value] : []
}

function value(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value : ''
}

function comparator(state: InvestigationState, indexes: DatasetIndexes) {
  return (left: LogRecord, right: LogRecord): number => {
    let comparison: number
    if (state.sortField === 'severity') comparison = SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity]
    else if (state.sortField === 'service') {
      comparison = (indexes.servicesById.get(left.serviceId)?.name ?? left.serviceId).localeCompare(
        indexes.servicesById.get(right.serviceId)?.name ?? right.serviceId,
        'en',
      )
    } else comparison = left.timestampOffsetMs - right.timestampOffsetMs
    const directed = state.sortDirection === 'asc' ? comparison : -comparison
    return directed || left.id.localeCompare(right.id, 'en')
  }
}

function activeCriteria(state: InvestigationState): SearchCriterion[] {
  const criteria: SearchCriterion[] = []
  const query = value(state.filters.q)
  if (query) criteria.push({ key: 'q', label: 'Text', value: query })
  for (const service of values(state.filters.service)) criteria.push({ key: 'service', label: 'Service', value: service })
  for (const severity of values(state.filters.severity)) criteria.push({ key: 'severity', label: 'Severity', value: severity })
  const trace = value(state.filters.trace)
  if (trace) criteria.push({ key: 'trace', label: 'Trace', value: trace })
  return criteria
}

export function projectLogSearch(
  dataset: TelemetryDataset,
  indexes: DatasetIndexes,
  inputState: InvestigationState,
  snapshot: ReplayClockSnapshot = baselineReplaySnapshot(dataset),
): LogSearchProjection {
  const state = normalizeNavigationState('logs', inputState, { allowedEnvironmentIds: dataset.environments.map(({ id }) => id) })
  const services = values(state.filters.service)
  const severities = values(state.filters.severity)
  const traceId = value(state.filters.trace)
  const selectedId = value(state.filters.log)
  const query = value(state.filters.q).trim().toLocaleLowerCase()
  const matching = dataset.logs
    .filter((log) => {
      const service = indexes.servicesById.get(log.serviceId)
      const attributes = Object.entries(log.attributes).flatMap(([key, attribute]) => [key, String(attribute)])
      return (
        log.environmentId === state.environmentId &&
        isOffsetVisible(log.timestampOffsetMs, dataset, snapshot, state.range) &&
        (services.length === 0 || services.includes(log.serviceId)) &&
        (severities.length === 0 || severities.includes(log.severity)) &&
        (!traceId || log.traceId === traceId) &&
        (!query ||
          [log.message, log.id, service?.name ?? '', log.traceId ?? '', log.spanId ?? '', ...attributes].some((entry) =>
            entry.toLocaleLowerCase().includes(query),
          ))
      )
    })
    .sort(comparator(state, indexes))
  const pageCount = Math.max(1, Math.ceil(matching.length / state.pageSize))
  const page = Math.min(state.page, pageCount)
  const start = (page - 1) * state.pageSize
  return {
    items: matching.slice(start, start + state.pageSize).map((log) => ({ log, service: indexes.servicesById.get(log.serviceId) ?? null })),
    total: matching.length,
    page,
    pageCount,
    pageSize: state.pageSize,
    selected: selectedId ? (matching.find(({ id }) => id === selectedId) ?? null) : null,
    criteria: activeCriteria(state),
  }
}

export function buildLogListHref(state: InvestigationState): string {
  return buildNavigationHref('/logs', 'logs', state)
}

export function buildTraceCorrelationHref(log: LogRecord, state: InvestigationState): string {
  if (!log.traceId) return buildLogListHref(state)
  const params = new URLSearchParams()
  if (state.environmentId !== 'production') params.set('env', state.environmentId)
  if (state.range.kind === 'absolute') {
    params.set('from', state.range.from)
    params.set('to', state.range.to)
  } else if (state.range.value !== '2h') params.set('range', state.range.value)
  params.set('return', buildLogListHref(state))
  return `/traces/${log.traceId}?${params.toString()}`
}

export function parseTraceReturnContext(input: string | URLSearchParams): string | null {
  try {
    const parameters = typeof input === 'string' ? new URLSearchParams(input.startsWith('?') ? input.slice(1) : input) : input
    const value = parameters.get('return')
    if (!value || value.length > 2_000 || value.startsWith('//')) return null
    const url = new URL(value, 'https://local.invalid')
    if (url.origin !== 'https://local.invalid' || !/^\/traces\/[a-z0-9-]+\/?$/.test(url.pathname)) return null
    return `${url.pathname}${url.search}`
  } catch {
    return null
  }
}
