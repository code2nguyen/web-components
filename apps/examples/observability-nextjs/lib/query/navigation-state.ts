export const PAGE_SIZES = [25, 50, 100] as const
export const RELATIVE_RANGES = ['30m', '2h', '24h'] as const
export const DEFAULT_ENVIRONMENT_ID = 'production'

export type PageSize = (typeof PAGE_SIZES)[number]
export type RelativeRange = (typeof RELATIVE_RANGES)[number]
export type SortDirection = 'asc' | 'desc'
export type RouteId = 'overview' | 'services' | 'traces' | 'logs' | 'dashboards' | 'alerts'
export type InvestigationRange = { kind: 'relative'; value: RelativeRange } | { kind: 'absolute'; from: string; to: string }
export type InvestigationFilterValue = string | string[]

export interface InvestigationState {
  environmentId: string
  range: InvestigationRange
  filters: Record<string, InvestigationFilterValue>
  sortField: string
  sortDirection: SortDirection
  page: number
  pageSize: PageSize
}

export interface InvestigationPreferences {
  environmentId?: string
  page?: number
  pageSize?: PageSize
}

export interface ParseNavigationOptions {
  defaultEnvironmentId?: string
  allowedEnvironmentIds?: readonly string[]
  preferences?: InvestigationPreferences
}

type ScalarFilter = { kind: 'scalar'; maxLength?: number }
type ListFilter = { kind: 'list'; allowed: readonly string[] }
type FilterDefinition = ScalarFilter | ListFilter
interface RouteSchema {
  filters: Record<string, FilterDefinition>
  filterOrder: readonly string[]
  sortFields: readonly string[]
  defaultSortField: string
  defaultSortDirection: SortDirection
}

const MAX_QUERY_LENGTH = 120
const MAX_ID_LENGTH = 96
const MAX_LIST_ITEMS = 20

export const ROUTE_SCHEMAS: Record<RouteId, RouteSchema> = {
  overview: { filters: {}, filterOrder: [], sortFields: ['priority'], defaultSortField: 'priority', defaultSortDirection: 'desc' },
  services: {
    filters: {
      q: { kind: 'scalar', maxLength: MAX_QUERY_LENGTH },
      status: { kind: 'list', allowed: ['healthy', 'warning', 'degraded', 'critical', 'unknown'] },
    },
    filterOrder: ['q', 'status'],
    sortFields: ['name', 'health', 'latency', 'errorRate', 'throughput'],
    defaultSortField: 'health',
    defaultSortDirection: 'desc',
  },
  traces: {
    filters: {
      q: { kind: 'scalar', maxLength: MAX_QUERY_LENGTH },
      service: { kind: 'list', allowed: [] },
      operation: { kind: 'scalar', maxLength: MAX_QUERY_LENGTH },
      status: { kind: 'list', allowed: ['ok', 'error'] },
      duration: { kind: 'list', allowed: ['under-100ms', '100ms-500ms', 'over-500ms'] },
    },
    filterOrder: ['q', 'service', 'operation', 'status', 'duration'],
    sortFields: ['start', 'duration', 'service', 'status'],
    defaultSortField: 'start',
    defaultSortDirection: 'desc',
  },
  logs: {
    filters: {
      q: { kind: 'scalar', maxLength: MAX_QUERY_LENGTH },
      service: { kind: 'list', allowed: [] },
      severity: { kind: 'list', allowed: ['debug', 'info', 'warn', 'error', 'fatal'] },
      trace: { kind: 'scalar', maxLength: MAX_ID_LENGTH },
      log: { kind: 'scalar', maxLength: MAX_ID_LENGTH },
    },
    filterOrder: ['q', 'service', 'severity', 'trace', 'log'],
    sortFields: ['timestamp', 'severity', 'service'],
    defaultSortField: 'timestamp',
    defaultSortDirection: 'desc',
  },
  dashboards: { filters: {}, filterOrder: [], sortFields: ['panel'], defaultSortField: 'panel', defaultSortDirection: 'asc' },
  alerts: {
    filters: {
      q: { kind: 'scalar', maxLength: MAX_QUERY_LENGTH },
      view: { kind: 'list', allowed: ['rules', 'incidents'] },
      service: { kind: 'list', allowed: [] },
      severity: { kind: 'list', allowed: ['warning', 'critical'] },
      state: { kind: 'list', allowed: ['active', 'acknowledged', 'muted', 'resolved'] },
      rule: { kind: 'scalar', maxLength: MAX_ID_LENGTH },
    },
    filterOrder: ['q', 'view', 'service', 'severity', 'state', 'rule'],
    sortFields: ['updated', 'severity', 'name'],
    defaultSortField: 'updated',
    defaultSortDirection: 'desc',
  },
}

function asSearchParams(input: string | URLSearchParams | Readonly<Record<string, string | string[] | undefined>>): URLSearchParams {
  if (input instanceof URLSearchParams) return new URLSearchParams(input)
  if (typeof input === 'string') return new URLSearchParams(input.startsWith('?') ? input.slice(1) : input)
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(input)) {
    if (Array.isArray(value)) value.forEach((item) => params.append(key, item))
    else if (typeof value === 'string') params.set(key, value)
  }
  return params
}

function normalizeEnvironment(value: string | null, options: ParseNavigationOptions): string {
  const fallback = options.defaultEnvironmentId ?? DEFAULT_ENVIRONMENT_ID
  if (!value || value.length > MAX_ID_LENGTH) return fallback
  if (options.allowedEnvironmentIds && !options.allowedEnvironmentIds.includes(value)) return fallback
  return /^[a-zA-Z0-9_-]+$/.test(value) ? value : fallback
}

function parseInstant(value: string | null): string | null {
  if (!value || value.length > 40) return null
  const numeric = /^\d{10,13}$/.test(value) ? Number(value) * (value.length === 10 ? 1_000 : 1) : Number.NaN
  const timestamp = Number.isFinite(numeric) ? numeric : Date.parse(value)
  if (!Number.isFinite(timestamp)) return null
  try {
    return new Date(timestamp).toISOString()
  } catch {
    return null
  }
}

function parseRange(params: URLSearchParams): InvestigationRange {
  const from = parseInstant(params.get('from'))
  const to = parseInstant(params.get('to'))
  if (from && to && Date.parse(from) < Date.parse(to)) return { kind: 'absolute', from, to }
  const range = params.get('range')
  return { kind: 'relative', value: RELATIVE_RANGES.includes(range as RelativeRange) ? (range as RelativeRange) : '2h' }
}

function defaultFilter(definition: FilterDefinition): InvestigationFilterValue {
  return definition.kind === 'list' ? [] : ''
}

function parseFilter(params: URLSearchParams, key: string, definition: FilterDefinition): InvestigationFilterValue {
  if (definition.kind === 'scalar') {
    const value = params.get(key)?.trim() ?? ''
    const maximum = definition.maxLength ?? MAX_ID_LENGTH
    return value.length <= maximum ? value : key === 'q' ? value.slice(0, maximum) : ''
  }
  const raw = params
    .getAll(key)
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, MAX_LIST_ITEMS)
  const valid =
    definition.allowed.length === 0
      ? raw.filter((value) => value.length <= MAX_ID_LENGTH && /^[a-zA-Z0-9_.:-]+$/.test(value))
      : raw.filter((value) => definition.allowed.includes(value))
  return [...new Set(valid)]
}

function positiveInteger(value: string | null, fallback = 1): number {
  if (!value || !/^\d+$/.test(value)) return fallback
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, 10_000) : fallback
}

export function parseNavigationState(
  route: RouteId,
  input: string | URLSearchParams | Readonly<Record<string, string | string[] | undefined>>,
  options: ParseNavigationOptions = {},
): InvestigationState {
  try {
    const params = asSearchParams(input)
    const schema = ROUTE_SCHEMAS[route]
    const filters = Object.fromEntries(Object.entries(schema.filters).map(([key, definition]) => [key, parseFilter(params, key, definition)]))
    const sort = params.get('sort')
    const direction = params.get('dir')
    const rawPageSize = Number(params.get('pageSize'))
    return {
      environmentId: normalizeEnvironment(params.get('env'), options),
      range: parseRange(params),
      filters,
      sortField: sort && schema.sortFields.includes(sort) ? sort : schema.defaultSortField,
      sortDirection: direction === 'asc' || direction === 'desc' ? direction : schema.defaultSortDirection,
      page: positiveInteger(params.get('page')),
      pageSize: PAGE_SIZES.includes(rawPageSize as PageSize) ? (rawPageSize as PageSize) : 25,
    }
  } catch {
    return normalizeNavigationState(
      route,
      {
        environmentId: options.defaultEnvironmentId ?? DEFAULT_ENVIRONMENT_ID,
        range: { kind: 'relative', value: '2h' },
        filters: {},
        sortField: '',
        sortDirection: 'desc',
        page: 1,
        pageSize: 25,
      },
      options,
    )
  }
}

export function normalizeNavigationState(route: RouteId, state: InvestigationState, options: ParseNavigationOptions = {}): InvestigationState {
  const params = new URLSearchParams()
  if (typeof state.environmentId === 'string') params.set('env', state.environmentId)
  if (state.range.kind === 'absolute') {
    params.set('from', state.range.from)
    params.set('to', state.range.to)
  } else params.set('range', state.range.value)
  for (const [key, value] of Object.entries(state.filters)) {
    if (Array.isArray(value)) value.forEach((item) => params.append(key, item))
    else params.set(key, value)
  }
  params.set('sort', state.sortField)
  params.set('dir', state.sortDirection)
  params.set('page', String(state.page))
  params.set('pageSize', String(state.pageSize))
  return parseNavigationState(route, params, options)
}

function appendList(params: URLSearchParams, key: string, value: InvestigationFilterValue) {
  if (Array.isArray(value) && value.length) params.set(key, value.join(','))
  else if (typeof value === 'string' && value) params.set(key, value)
}

export function serializeNavigationState(route: RouteId, state: InvestigationState, options: ParseNavigationOptions = {}): string {
  const normalized = normalizeNavigationState(route, state, options)
  const schema = ROUTE_SCHEMAS[route]
  const params = new URLSearchParams()
  const defaultEnvironment = options.defaultEnvironmentId ?? DEFAULT_ENVIRONMENT_ID
  if (normalized.environmentId !== defaultEnvironment) params.set('env', normalized.environmentId)
  if (normalized.range.kind === 'absolute') {
    params.set('from', normalized.range.from)
    params.set('to', normalized.range.to)
  } else if (normalized.range.value !== '2h') params.set('range', normalized.range.value)
  for (const key of schema.filterOrder) appendList(params, key, normalized.filters[key] ?? defaultFilter(schema.filters[key]))
  if (normalized.sortField !== schema.defaultSortField) params.set('sort', normalized.sortField)
  if (normalized.sortDirection !== schema.defaultSortDirection) params.set('dir', normalized.sortDirection)
  if (normalized.page !== 1) params.set('page', String(normalized.page))
  if (normalized.pageSize !== 25) params.set('pageSize', String(normalized.pageSize))
  return params.toString()
}

export function buildNavigationHref(pathname: string, route: RouteId, state: InvestigationState, options: ParseNavigationOptions = {}): string {
  const query = serializeNavigationState(route, state, options)
  return query ? `${pathname}?${query}` : pathname
}

export function scopeSearchParams(state: Pick<InvestigationState, 'environmentId' | 'range'>): URLSearchParams {
  const params = new URLSearchParams()
  if (state.environmentId !== DEFAULT_ENVIRONMENT_ID) params.set('env', state.environmentId)
  if (state.range.kind === 'absolute') {
    params.set('from', state.range.from)
    params.set('to', state.range.to)
  } else if (state.range.value !== '2h') params.set('range', state.range.value)
  return params
}

export function buildScopedHref(pathname: string, state: Pick<InvestigationState, 'environmentId' | 'range'>): string {
  const [path, query = ''] = pathname.split('?', 2)
  const params = new URLSearchParams(query)
  params.delete('env')
  params.delete('range')
  params.delete('from')
  params.delete('to')
  for (const [key, value] of scopeSearchParams(state)) params.set(key, value)
  return params.size ? `${path}?${params}` : path
}

export function changeFilters(route: RouteId, state: InvestigationState, patch: Record<string, InvestigationFilterValue>): InvestigationState {
  return normalizeNavigationState(route, { ...state, filters: { ...state.filters, ...patch }, page: 1 })
}

export function changeSort(route: RouteId, state: InvestigationState, sortField: string, sortDirection: SortDirection): InvestigationState {
  return normalizeNavigationState(route, { ...state, sortField, sortDirection, page: 1 })
}

export function changePageSize(state: InvestigationState, pageSize: PageSize): InvestigationState {
  const firstVisibleIndex = (state.page - 1) * state.pageSize
  return { ...state, page: Math.floor(firstVisibleIndex / pageSize) + 1, pageSize }
}

export function buildDetailHref(
  detailPath: string,
  returnPath: string,
  route: RouteId,
  state: InvestigationState,
  options: ParseNavigationOptions = {},
): string {
  const returnHref = buildNavigationHref(returnPath, route, state, options)
  const params = new URLSearchParams({ return: returnHref })
  return `${detailPath}?${params.toString()}`
}

export function parseReturnContext(input: string | URLSearchParams, allowedPaths: readonly string[]): string | null {
  try {
    const params = typeof input === 'string' ? new URLSearchParams(input.startsWith('?') ? input.slice(1) : input) : input
    const value = params.get('return')
    if (!value || value.length > 2_000 || value.startsWith('//')) return null
    const url = new URL(value, 'https://local.invalid')
    if (url.origin !== 'https://local.invalid' || !allowedPaths.includes(url.pathname)) return null
    return `${url.pathname}${url.search}`
  } catch {
    return null
  }
}
