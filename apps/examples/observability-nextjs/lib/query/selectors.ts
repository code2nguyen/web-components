import type { AlertRule, Incident, LogRecord, MetricSeries, ReplayClockSnapshot, Service, TelemetryDataset, Trace } from '../domain/telemetry.ts'
import type { DatasetIndexes } from '../data/indexes.ts'

export type { ReplayClockSnapshot } from '../domain/telemetry.ts'

export interface ServiceSelector {
  environmentId?: string
  health?: Service['health']
  search?: string
}

export interface TraceSelector {
  environmentId?: string
  serviceId?: string
  operation?: string
  status?: Trace['status']
}

export interface LogSelector {
  environmentId?: string
  serviceId?: string
  traceId?: string
  spanId?: string
  severity?: LogRecord['severity']
}

export interface MetricSelector {
  environmentId?: string
  serviceId?: string
  metric?: string
}

export interface RuleSelector {
  serviceId?: string
  severity?: AlertRule['severity']
  enabled?: boolean
}

export interface IncidentSelector {
  serviceId?: string
  ruleId?: string
  state?: Incident['state']
  severity?: Incident['severity']
}

function cutoff(dataset: TelemetryDataset, snapshot: ReplayClockSnapshot): number {
  if (snapshot.baselineInstant !== dataset.baselineInstant) throw new Error('Replay snapshot baseline does not match the dataset')
  if (!Number.isInteger(snapshot.tick) || snapshot.tick < 0 || !Number.isInteger(snapshot.stepMs) || snapshot.stepMs <= 0) {
    throw new Error('Replay snapshot requires a non-negative integer tick and positive integer step')
  }
  return snapshot.tick * snapshot.stepMs
}

function includesText(values: readonly string[], search: string | undefined): boolean {
  const normalized = search?.trim().toLocaleLowerCase()
  return !normalized || values.some((value) => value.toLocaleLowerCase().includes(normalized))
}

export function selectServices(
  dataset: TelemetryDataset,
  indexes: DatasetIndexes,
  snapshot: ReplayClockSnapshot,
  selector: ServiceSelector,
): readonly Service[] {
  cutoff(dataset, snapshot)
  const candidates = selector.environmentId ? (indexes.servicesByEnvironment.get(selector.environmentId) ?? []) : dataset.services
  return candidates.filter(
    (service) =>
      (!selector.health || service.health === selector.health) &&
      includesText([service.name, service.owner, ...service.operations.map(({ name }) => name)], selector.search),
  )
}

export function selectTraces(dataset: TelemetryDataset, indexes: DatasetIndexes, snapshot: ReplayClockSnapshot, selector: TraceSelector): readonly Trace[] {
  const visibleThrough = cutoff(dataset, snapshot)
  const candidates = selector.serviceId ? (indexes.tracesByService.get(selector.serviceId) ?? []) : dataset.traces
  return candidates.filter(
    (trace) =>
      trace.startOffsetMs <= visibleThrough &&
      (!selector.environmentId || trace.environmentId === selector.environmentId) &&
      (!selector.operation || trace.rootOperation === selector.operation) &&
      (!selector.status || trace.status === selector.status),
  )
}

export function selectLogs(dataset: TelemetryDataset, indexes: DatasetIndexes, snapshot: ReplayClockSnapshot, selector: LogSelector): readonly LogRecord[] {
  const visibleThrough = cutoff(dataset, snapshot)
  const candidates = selector.traceId
    ? (indexes.logsByTrace.get(selector.traceId) ?? [])
    : selector.spanId
      ? (indexes.logsBySpan.get(selector.spanId) ?? [])
      : selector.serviceId
        ? (indexes.logsByService.get(selector.serviceId) ?? [])
        : dataset.logs
  return candidates.filter(
    (log) =>
      log.timestampOffsetMs <= visibleThrough &&
      (!selector.environmentId || log.environmentId === selector.environmentId) &&
      (!selector.serviceId || log.serviceId === selector.serviceId) &&
      (!selector.traceId || log.traceId === selector.traceId) &&
      (!selector.spanId || log.spanId === selector.spanId) &&
      (!selector.severity || log.severity === selector.severity),
  )
}

export function selectMetricSeries(
  dataset: TelemetryDataset,
  indexes: DatasetIndexes,
  snapshot: ReplayClockSnapshot,
  selector: MetricSelector,
): readonly MetricSeries[] {
  const visibleThrough = cutoff(dataset, snapshot)
  const candidates = selector.serviceId
    ? (indexes.metricSeriesByService.get(selector.serviceId) ?? [])
    : selector.metric
      ? (indexes.metricSeriesByMetric.get(selector.metric) ?? [])
      : dataset.metricSeries
  return candidates
    .filter(
      (series) =>
        (!selector.environmentId || series.environmentId === selector.environmentId) &&
        (!selector.serviceId || series.serviceId === selector.serviceId) &&
        (!selector.metric || series.metric === selector.metric),
    )
    .map((series) => {
      const points = series.points.filter(({ offsetMs }) => offsetMs <= visibleThrough)
      Object.freeze(points)
      return Object.freeze({ ...series, points })
    })
}

export function selectAlertRules(
  dataset: TelemetryDataset,
  indexes: DatasetIndexes,
  snapshot: ReplayClockSnapshot,
  selector: RuleSelector,
): readonly AlertRule[] {
  cutoff(dataset, snapshot)
  const candidates = selector.serviceId ? dataset.alertRules.filter((rule) => rule.serviceIds.includes(selector.serviceId!)) : dataset.alertRules
  return candidates.filter(
    (rule) =>
      (!selector.severity || rule.severity === selector.severity) &&
      (selector.enabled === undefined || rule.enabled === selector.enabled) &&
      indexes.rulesById.get(rule.id) === rule,
  )
}

export function selectIncidents(
  dataset: TelemetryDataset,
  indexes: DatasetIndexes,
  snapshot: ReplayClockSnapshot,
  selector: IncidentSelector,
): readonly Incident[] {
  const visibleThrough = cutoff(dataset, snapshot)
  const candidates = selector.serviceId
    ? (indexes.incidentsByService.get(selector.serviceId) ?? [])
    : selector.ruleId
      ? (indexes.incidentsByRule.get(selector.ruleId) ?? [])
      : dataset.incidents
  return candidates.flatMap((incident) => {
    if (
      incident.startedOffsetMs > visibleThrough ||
      (selector.ruleId && incident.ruleId !== selector.ruleId) ||
      (selector.severity && incident.severity !== selector.severity)
    ) {
      return []
    }
    const timeline = incident.timeline.filter(({ offsetMs }) => offsetMs <= visibleThrough)
    const latest = timeline.at(-1)
    if (!latest) return []
    const state = latest.state === 'triggered' ? 'active' : latest.state
    if (selector.state && state !== selector.state) return []
    return [
      {
        ...incident,
        state,
        timeline,
        annotations: incident.annotations.filter(({ offsetMs }) => offsetMs <= visibleThrough),
        resolvedOffsetMs: state === 'resolved' ? latest.offsetMs : null,
      },
    ]
  })
}

export function findCorrelatedLogs(indexes: DatasetIndexes, traceId: string, spanId?: string): readonly LogRecord[] {
  const logs = spanId ? (indexes.logsBySpan.get(spanId) ?? []) : (indexes.logsByTrace.get(traceId) ?? [])
  return logs.filter((log) => log.traceId === traceId && (!spanId || log.spanId === spanId))
}
