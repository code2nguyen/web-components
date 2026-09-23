import type { DatasetIndexes } from '../../lib/data/indexes.ts'
import type { ReplayClockSnapshot, Service, TelemetryDataset, Trace } from '../../lib/domain/telemetry.ts'
import { baselineReplaySnapshot, isOffsetVisible } from '../../lib/query/time-window.ts'
import {
  buildNavigationHref,
  normalizeNavigationState,
  serializeNavigationState,
  type InvestigationState,
  type PageSize,
} from '../../lib/query/navigation-state.ts'

export interface SearchCriterion {
  key: string
  label: string
  value: string
}

export interface HighlightSegment {
  text: string
  match: boolean
}

export interface TraceSearchOptions {
  operation?: string
  snapshot?: ReplayClockSnapshot
}

export interface TraceSearchRow {
  trace: Trace
  service: Service | null
}

export interface TraceSearchProjection {
  items: readonly TraceSearchRow[]
  total: number
  page: number
  pageCount: number
  pageSize: PageSize
  criteria: readonly SearchCriterion[]
}

function strings(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) return value
  return value ? [value] : []
}

function scalar(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value : ''
}

function durationMatches(duration: number, values: readonly string[]): boolean {
  if (values.length === 0) return true
  return values.some((value) => {
    if (value === 'under-100ms') return duration < 100
    if (value === '100ms-500ms') return duration >= 100 && duration <= 500
    return value === 'over-500ms' && duration > 500
  })
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right, 'en')
}

function traceComparator(state: InvestigationState, indexes: DatasetIndexes) {
  return (left: Trace, right: Trace): number => {
    let comparison: number
    if (state.sortField === 'duration') comparison = left.durationMs - right.durationMs
    else if (state.sortField === 'service') {
      comparison = compareText(
        indexes.servicesById.get(left.rootServiceId)?.name ?? left.rootServiceId,
        indexes.servicesById.get(right.rootServiceId)?.name ?? right.rootServiceId,
      )
    } else if (state.sortField === 'status') comparison = compareText(left.status, right.status)
    else comparison = left.startOffsetMs - right.startOffsetMs
    const directed = state.sortDirection === 'asc' ? comparison : -comparison
    return directed || compareText(left.id, right.id)
  }
}

function traceCriteria(state: InvestigationState, operation: string): SearchCriterion[] {
  const criteria: SearchCriterion[] = []
  const query = scalar(state.filters.q)
  if (query) criteria.push({ key: 'q', label: 'Text', value: query })
  if (operation) criteria.push({ key: 'operation', label: 'Operation', value: operation })
  for (const value of strings(state.filters.service)) criteria.push({ key: 'service', label: 'Service', value })
  for (const value of strings(state.filters.status)) criteria.push({ key: 'status', label: 'Status', value })
  for (const value of strings(state.filters.duration)) criteria.push({ key: 'duration', label: 'Duration', value })
  return criteria
}

export function projectTraceSearch(
  dataset: TelemetryDataset,
  indexes: DatasetIndexes,
  inputState: InvestigationState,
  options: TraceSearchOptions = {},
): TraceSearchProjection {
  const state = normalizeNavigationState('traces', inputState, { allowedEnvironmentIds: dataset.environments.map(({ id }) => id) })
  const services = strings(state.filters.service)
  const statuses = strings(state.filters.status)
  const durations = strings(state.filters.duration)
  const query = scalar(state.filters.q).trim().toLocaleLowerCase()
  const operation = options.operation?.trim() ?? scalar(state.filters.operation).trim()
  const snapshot = options.snapshot ?? baselineReplaySnapshot(dataset)
  const matching = dataset.traces
    .filter((trace) => {
      const service = indexes.servicesById.get(trace.rootServiceId)
      const attributes = Object.entries(trace.attributes).flatMap(([key, value]) => [key, String(value)])
      return (
        trace.environmentId === state.environmentId &&
        isOffsetVisible(trace.startOffsetMs, dataset, snapshot, state.range) &&
        (services.length === 0 || services.includes(trace.rootServiceId)) &&
        (statuses.length === 0 || statuses.includes(trace.status)) &&
        durationMatches(trace.durationMs, durations) &&
        (!operation || trace.rootOperation === operation) &&
        (!query || [trace.id, trace.rootOperation, service?.name ?? '', ...attributes].some((value) => value.toLocaleLowerCase().includes(query)))
      )
    })
    .sort(traceComparator(state, indexes))
  const pageCount = Math.max(1, Math.ceil(matching.length / state.pageSize))
  const page = Math.min(state.page, pageCount)
  const start = (page - 1) * state.pageSize
  return {
    items: matching.slice(start, start + state.pageSize).map((trace) => ({ trace, service: indexes.servicesById.get(trace.rootServiceId) ?? null })),
    total: matching.length,
    page,
    pageCount,
    pageSize: state.pageSize,
    criteria: traceCriteria(state, operation),
  }
}

export function highlightMatches(text: string, query: string): HighlightSegment[] {
  const needle = query.trim()
  if (!needle) return [{ text, match: false }]
  const normalizedText = text.toLocaleLowerCase()
  const normalizedNeedle = needle.toLocaleLowerCase()
  const segments: HighlightSegment[] = []
  let cursor = 0
  while (cursor < text.length) {
    const index = normalizedText.indexOf(normalizedNeedle, cursor)
    if (index === -1) {
      segments.push({ text: text.slice(cursor), match: false })
      break
    }
    if (index > cursor) segments.push({ text: text.slice(cursor, index), match: false })
    segments.push({ text: text.slice(index, index + needle.length), match: true })
    cursor = index + needle.length
  }
  return segments.length ? segments : [{ text, match: false }]
}

function scopeParams(state: InvestigationState): URLSearchParams {
  const params = new URLSearchParams()
  if (state.environmentId !== 'production') params.set('env', state.environmentId)
  if (state.range.kind === 'absolute') {
    params.set('from', state.range.from)
    params.set('to', state.range.to)
  } else if (state.range.value !== '2h') params.set('range', state.range.value)
  return params
}

export function buildLogsCorrelationHref(traceId: string, state: InvestigationState, returnContext?: string): string {
  const params = scopeParams(state)
  params.set('trace', traceId)
  if (returnContext) params.set('return', returnContext)
  return `/logs?${params.toString()}`
}

export function buildTraceListHref(state: InvestigationState): string {
  return buildNavigationHref('/traces', 'traces', state)
}

export function traceDetailHref(traceId: string, state: InvestigationState): string {
  const params = scopeParams(state)
  params.set('return', buildTraceListHref(state))
  return `/traces/${traceId}?${params.toString()}`
}

export function canonicalTraceQuery(state: InvestigationState): string {
  return serializeNavigationState('traces', state)
}
