export type Scalar = string | number | boolean | null
export type ScalarMap = Record<string, Scalar>
export type ServiceHealth = 'healthy' | 'warning' | 'critical' | 'unknown'
export type TraceStatus = 'ok' | 'error'
export type LogSeverity = 'debug' | 'info' | 'warn' | 'error' | 'fatal'
export type MetricUnit = 'count' | 'requests-per-second' | 'milliseconds' | 'percent' | 'bytes'
export type AlertSignal = 'latency' | 'error-rate' | 'throughput' | 'saturation'
export type AlertSeverity = 'warning' | 'critical'
export type IncidentState = 'active' | 'acknowledged' | 'muted' | 'resolved'
export type IncidentEventState = 'triggered' | IncidentState
export type DashboardPanelSize = 'small' | 'medium' | 'large'

export interface Environment {
  id: string
  name: string
  region: string
  isDefault: boolean
}

export interface OperationSummary {
  name: string
  throughputPerMinute: number
  latencyP95Ms: number
  errorRate: number
}

export interface DeploymentMarker {
  id: string
  version: string
  timestampOffsetMs: number
  summary: string
}

export interface Service {
  id: string
  name: string
  environmentId: string
  owner: string
  health: ServiceHealth
  throughputPerMinute: number
  latencyP50Ms: number
  latencyP95Ms: number
  latencyP99Ms: number
  errorRate: number
  dependencies: string[]
  operations: OperationSummary[]
  deployments: DeploymentMarker[]
}

export interface MetricPoint {
  offsetMs: number
  value: number | null
}

export interface MetricSeries {
  id: string
  metric: string
  unit: MetricUnit
  environmentId: string
  serviceId: string | null
  dimensions: Record<string, string>
  points: MetricPoint[]
}

export interface Trace {
  id: string
  environmentId: string
  rootServiceId: string
  rootOperation: string
  startOffsetMs: number
  durationMs: number
  status: TraceStatus
  rootSpanId: string
  spanIds: string[]
  attributes: ScalarMap
}

export interface SpanEvent {
  name: string
  offsetMs: number
  attributes: ScalarMap
}

export interface ErrorDetail {
  type: string
  message: string
  stack: string | null
}

export interface Span {
  id: string
  traceId: string
  parentSpanId: string | null
  serviceId: string
  operation: string
  startOffsetMs: number
  durationMs: number
  status: TraceStatus
  attributes: ScalarMap
  events: SpanEvent[]
  error: ErrorDetail | null
}

export interface LogRecord {
  id: string
  timestampOffsetMs: number
  environmentId: string
  serviceId: string
  severity: LogSeverity
  message: string
  traceId: string | null
  spanId: string | null
  attributes: ScalarMap
}

export interface NotificationDestination {
  id: string
  label: string
  type: 'on-call' | 'team-chat' | 'email-summary'
  description: string
}

export interface AlertRule {
  id: string
  name: string
  signal: AlertSignal
  serviceIds: string[]
  operator: 'above' | 'below'
  threshold: number
  evaluationWindowMinutes: number
  severity: AlertSeverity
  owner: string
  destinationIds: string[]
  enabled: boolean
  origin: 'baseline' | 'local'
}

export interface IncidentEvent {
  id: string
  state: IncidentEventState
  offsetMs: number
  actor: string
  note: string
}

export interface IncidentAnnotation {
  id: string
  offsetMs: number
  author: string
  body: string
}

export interface Incident {
  id: string
  ruleId: string
  serviceIds: string[]
  severity: AlertSeverity
  state: IncidentState
  owner: string | null
  startedOffsetMs: number
  resolvedOffsetMs: number | null
  timeline: IncidentEvent[]
  annotations: IncidentAnnotation[]
}

export interface Dashboard {
  id: string
  name: string
  panelIds: string[]
}

export interface DashboardPanel {
  id: string
  title: string
  kind: 'stat' | 'line' | 'area' | 'bar' | 'distribution' | 'ranked-table'
  metric: string
  unit: MetricUnit
  defaultSize: DashboardPanelSize
  supportedSizes: DashboardPanelSize[]
  description: string
}

export interface TelemetryDataset {
  schemaVersion: 1
  seed: number
  baselineInstant: string
  environments: Environment[]
  services: Service[]
  metricSeries: MetricSeries[]
  traces: Trace[]
  spans: Span[]
  logs: LogRecord[]
  alertRules: AlertRule[]
  incidents: Incident[]
  destinations: NotificationDestination[]
  dashboard: Dashboard
  dashboardPanels: DashboardPanel[]
}

export interface ReplayClockSnapshot {
  baselineInstant: string
  tick: number
  status: 'paused' | 'playing'
  stepMs: number
}

const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const incidentTransitions: Record<IncidentEventState, ReadonlySet<IncidentEventState>> = {
  triggered: new Set(['acknowledged', 'muted']),
  acknowledged: new Set(['resolved', 'muted']),
  muted: new Set(['active', 'resolved']),
  active: new Set(['acknowledged', 'muted', 'resolved']),
  resolved: new Set(),
}

function duplicateIds(values: ReadonlyArray<{ id: string }>): string[] {
  const seen = new Set<string>()
  return values.flatMap(({ id }) => {
    if (!idPattern.test(id)) return [`ID is not a stable lowercase URL-safe key: ${id}`]
    if (seen.has(id)) return [`Duplicate ID: ${id}`]
    seen.add(id)
    return []
  })
}

export function validateTelemetryDataset(dataset: TelemetryDataset): string[] {
  const errors: string[] = []
  if (dataset.schemaVersion !== 1) errors.push('Unsupported dataset schema version')
  if (!Number.isInteger(dataset.seed) || dataset.seed === 0) errors.push('Seed must be a non-zero integer')
  if (!Number.isFinite(Date.parse(dataset.baselineInstant))) errors.push('Baseline instant must be a UTC timestamp')
  if (dataset.environments.filter(({ isDefault }) => isDefault).length !== 1) errors.push('Exactly one environment is default')

  const identifiedCollections: ReadonlyArray<ReadonlyArray<{ id: string }>> = [
    dataset.environments,
    dataset.services,
    dataset.metricSeries,
    dataset.traces,
    dataset.spans,
    dataset.logs,
    dataset.alertRules,
    dataset.incidents,
    dataset.destinations,
    dataset.dashboardPanels,
  ]
  for (const collection of identifiedCollections) {
    errors.push(...duplicateIds(collection))
  }

  const environments = new Set(dataset.environments.map(({ id }) => id))
  const services = new Set(dataset.services.map(({ id }) => id))
  const traces = new Map(dataset.traces.map((trace) => [trace.id, trace]))
  const spans = new Map(dataset.spans.map((span) => [span.id, span]))
  const destinations = new Set(dataset.destinations.map(({ id }) => id))
  const rules = new Map(dataset.alertRules.map((rule) => [rule.id, rule]))
  const panels = new Set(dataset.dashboardPanels.map(({ id }) => id))

  for (const service of dataset.services) {
    if (!environments.has(service.environmentId)) errors.push(`Service environment does not resolve: ${service.id}`)
    if (!(0 <= service.latencyP50Ms && service.latencyP50Ms <= service.latencyP95Ms && service.latencyP95Ms <= service.latencyP99Ms)) {
      errors.push(`0 <= p50 <= p95 <= p99: ${service.id}`)
    }
    if (!(service.errorRate >= 0 && service.errorRate <= 1)) errors.push(`Inclusive range 0–1: ${service.id}`)
    const uniqueDependencies = new Set(service.dependencies)
    if (
      uniqueDependencies.size !== service.dependencies.length ||
      service.dependencies.includes(service.id) ||
      service.dependencies.some((id) => !services.has(id))
    ) {
      errors.push(`Unique, no self-reference, all resolve: ${service.id}`)
    }
    if (new Set(service.operations.map(({ name }) => name)).size !== service.operations.length) errors.push(`Duplicate service operation: ${service.id}`)
    if (service.deployments.some((deployment, index) => index > 0 && deployment.timestampOffsetMs < service.deployments[index - 1].timestampOffsetMs)) {
      errors.push(`Deployments are not ordered: ${service.id}`)
    }
  }

  for (const series of dataset.metricSeries) {
    if (!environments.has(series.environmentId) || (series.serviceId !== null && !services.has(series.serviceId))) {
      errors.push(`Metric scope does not resolve: ${series.id}`)
    }
    if (
      series.points.some(
        (point, index) =>
          !Number.isInteger(point.offsetMs) ||
          (point.value !== null && !Number.isFinite(point.value)) ||
          (index > 0 && point.offsetMs <= series.points[index - 1].offsetMs),
      )
    ) {
      errors.push(`Metric points must be finite and strictly ascending: ${series.id}`)
    }
  }

  for (const trace of dataset.traces) {
    if (!environments.has(trace.environmentId) || !services.has(trace.rootServiceId)) errors.push(`Trace scope does not resolve: ${trace.id}`)
    const traceSpans = trace.spanIds.map((id) => spans.get(id)).filter((span): span is Span => span !== undefined)
    if (traceSpans.length !== trace.spanIds.length || new Set(trace.spanIds).size !== trace.spanIds.length)
      errors.push(`Trace span IDs do not resolve uniquely: ${trace.id}`)
    if (traceSpans.filter(({ parentSpanId }) => parentSpanId === null).length !== 1) errors.push(`exactly one null parent per trace: ${trace.id}`)
    if (spans.get(trace.rootSpanId)?.traceId !== trace.id || spans.get(trace.rootSpanId)?.parentSpanId !== null)
      errors.push(`Trace root span is invalid: ${trace.id}`)
    if ((trace.status === 'error') !== traceSpans.some(({ status }) => status === 'error')) errors.push(`Trace status disagrees with spans: ${trace.id}`)

    for (const span of traceSpans) {
      const visited = new Set<string>()
      let cursor: Span | undefined = span
      while (cursor?.parentSpanId !== null) {
        if (visited.has(cursor.id)) {
          errors.push(`Trace tree is cyclic: ${trace.id}`)
          break
        }
        visited.add(cursor.id)
        cursor = spans.get(cursor.parentSpanId)
        if (!cursor || cursor.traceId !== trace.id) {
          errors.push(`Span parent does not resolve in trace: ${span.id}`)
          break
        }
      }
    }
  }

  for (const span of dataset.spans) {
    const trace = traces.get(span.traceId)
    if (!trace || !services.has(span.serviceId)) {
      errors.push(`Span scope does not resolve: ${span.id}`)
      continue
    }
    if (span.startOffsetMs < trace.startOffsetMs) errors.push(`Falls within the trace interval: ${span.id}`)
    if (span.durationMs <= 0 || span.startOffsetMs + span.durationMs > trace.startOffsetMs + trace.durationMs) {
      errors.push(`ends within trace interval: ${span.id}`)
    }
    if ((span.status === 'error') !== (span.error !== null)) errors.push(`Span error details disagree with status: ${span.id}`)
    if (
      span.events.some(
        (event, index) =>
          event.offsetMs < span.startOffsetMs ||
          event.offsetMs > span.startOffsetMs + span.durationMs ||
          (index > 0 && event.offsetMs < span.events[index - 1].offsetMs),
      )
    ) {
      errors.push(`Span events are outside their interval: ${span.id}`)
    }
  }

  for (const log of dataset.logs) {
    const trace = log.traceId === null ? undefined : traces.get(log.traceId)
    const span = log.spanId === null ? undefined : spans.get(log.spanId)
    if (!environments.has(log.environmentId) || !services.has(log.serviceId)) errors.push(`Log scope does not resolve: ${log.id}`)
    if ((log.traceId !== null && !trace) || (log.spanId !== null && (!span || span.traceId !== log.traceId))) {
      errors.push(`Log trace/span IDs resolve when present: ${log.id}`)
    }
  }

  for (const rule of dataset.alertRules) {
    if (rule.serviceIds.length === 0 || rule.serviceIds.some((id) => !services.has(id))) errors.push(`Alert rule services do not resolve: ${rule.id}`)
    if (
      rule.destinationIds.length === 0 ||
      new Set(rule.destinationIds).size !== rule.destinationIds.length ||
      rule.destinationIds.some((id) => !destinations.has(id))
    ) {
      errors.push(`Alert destinations do not resolve uniquely: ${rule.id}`)
    }
  }

  for (const incident of dataset.incidents) {
    const rule = rules.get(incident.ruleId)
    if (!rule || incident.serviceIds.length === 0 || incident.serviceIds.some((id) => !services.has(id)))
      errors.push(`Incident scope does not resolve: ${incident.id}`)
    if (rule && rule.severity !== incident.severity) errors.push(`Incident severity disagrees with rule: ${incident.id}`)
    if (incident.timeline[0]?.state !== 'triggered') errors.push(`Incident timeline must begin with triggered: ${incident.id}`)
    for (let index = 1; index < incident.timeline.length; index += 1) {
      const previous = incident.timeline[index - 1]
      const current = incident.timeline[index]
      if (!incidentTransitions[previous.state].has(current.state) || current.offsetMs < previous.offsetMs)
        errors.push(`Invalid incident transition: ${incident.id}`)
    }
    const final = incident.timeline.at(-1)
    const effectiveState = final?.state === 'triggered' ? 'active' : final?.state
    if (effectiveState !== incident.state) errors.push(`Incident state does not match timeline: ${incident.id}`)
    if ((incident.state === 'resolved') !== (incident.resolvedOffsetMs !== null)) errors.push(`Incident resolution timestamp is invalid: ${incident.id}`)
  }

  if (dataset.dashboard.panelIds.length < 6 || new Set(dataset.dashboard.panelIds).size !== dataset.dashboard.panelIds.length) {
    errors.push('Dashboard must contain at least six unique panels')
  }
  if (dataset.dashboard.panelIds.some((id) => !panels.has(id))) errors.push('Dashboard panel IDs must resolve')
  for (const panel of dataset.dashboardPanels) {
    if (!panel.supportedSizes.includes(panel.defaultSize)) errors.push(`Dashboard default size is unsupported: ${panel.id}`)
  }

  return errors
}
