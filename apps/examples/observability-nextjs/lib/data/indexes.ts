import type { AlertRule, Environment, Incident, LogRecord, MetricSeries, Service, Span, TelemetryDataset, Trace } from '../domain/telemetry.ts'

export interface DatasetIndexes {
  environmentsById: ReadonlyMap<string, Environment>
  servicesById: ReadonlyMap<string, Service>
  servicesByEnvironment: ReadonlyMap<string, readonly Service[]>
  tracesById: ReadonlyMap<string, Trace>
  tracesByService: ReadonlyMap<string, readonly Trace[]>
  tracesByOperation: ReadonlyMap<string, readonly Trace[]>
  tracesByStatus: ReadonlyMap<Trace['status'], readonly Trace[]>
  spansById: ReadonlyMap<string, Span>
  spansByTrace: ReadonlyMap<string, readonly Span[]>
  spanChildrenByParent: ReadonlyMap<string, readonly Span[]>
  logsById: ReadonlyMap<string, LogRecord>
  logsByService: ReadonlyMap<string, readonly LogRecord[]>
  logsByTrace: ReadonlyMap<string, readonly LogRecord[]>
  logsBySpan: ReadonlyMap<string, readonly LogRecord[]>
  logsBySeverity: ReadonlyMap<LogRecord['severity'], readonly LogRecord[]>
  metricSeriesById: ReadonlyMap<string, MetricSeries>
  metricSeriesByMetric: ReadonlyMap<string, readonly MetricSeries[]>
  metricSeriesByEnvironment: ReadonlyMap<string, readonly MetricSeries[]>
  metricSeriesByService: ReadonlyMap<string, readonly MetricSeries[]>
  metricSeriesByDimensions: ReadonlyMap<string, readonly MetricSeries[]>
  rulesById: ReadonlyMap<string, AlertRule>
  incidentsById: ReadonlyMap<string, Incident>
  incidentsByRule: ReadonlyMap<string, readonly Incident[]>
  incidentsByService: ReadonlyMap<string, readonly Incident[]>
}

function immutableMap<K, V>(entries: Iterable<readonly [K, V]>): ReadonlyMap<K, V> {
  const map = new Map(entries)
  return new Proxy(map, {
    get(target, property) {
      if (property === 'set' || property === 'delete' || property === 'clear') {
        return () => {
          throw new TypeError('Cannot mutate an immutable index')
        }
      }
      const value: unknown = Reflect.get(target, property, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}

function freezeGroups<K, V>(groups: Map<K, V[]>): ReadonlyMap<K, readonly V[]> {
  return immutableMap([...groups].map(([key, values]) => [key, Object.freeze([...values])] as const))
}

function groupBy<K, V>(values: readonly V[], keys: (value: V) => readonly K[]): ReadonlyMap<K, readonly V[]> {
  const groups = new Map<K, V[]>()
  for (const value of values) {
    for (const key of new Set(keys(value))) groups.set(key, [...(groups.get(key) ?? []), value])
  }
  return freezeGroups(groups)
}

function dimensionKey(dimensions: Readonly<Record<string, string>>): string {
  return Object.entries(dimensions)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('&')
}

export function buildDatasetIndexes(dataset: TelemetryDataset): DatasetIndexes {
  const spansByTrace = groupBy(dataset.spans, (span) => [span.traceId])
  const traceServiceIds = new Map(
    dataset.traces.map((trace) => [trace.id, [...new Set([trace.rootServiceId, ...(spansByTrace.get(trace.id) ?? []).map(({ serviceId }) => serviceId)])]]),
  )

  return Object.freeze({
    environmentsById: immutableMap(dataset.environments.map((environment) => [environment.id, environment] as const)),
    servicesById: immutableMap(dataset.services.map((service) => [service.id, service] as const)),
    servicesByEnvironment: groupBy(dataset.services, (service) => [service.environmentId]),
    tracesById: immutableMap(dataset.traces.map((trace) => [trace.id, trace] as const)),
    tracesByService: groupBy(dataset.traces, (trace) => traceServiceIds.get(trace.id) ?? []),
    tracesByOperation: groupBy(dataset.traces, (trace) => [trace.rootOperation]),
    tracesByStatus: groupBy(dataset.traces, (trace) => [trace.status]),
    spansById: immutableMap(dataset.spans.map((span) => [span.id, span] as const)),
    spansByTrace,
    spanChildrenByParent: groupBy(
      dataset.spans.filter((span) => span.parentSpanId !== null),
      (span) => [span.parentSpanId!],
    ),
    logsById: immutableMap(dataset.logs.map((log) => [log.id, log] as const)),
    logsByService: groupBy(dataset.logs, (log) => [log.serviceId]),
    logsByTrace: groupBy(
      dataset.logs.filter((log) => log.traceId !== null),
      (log) => [log.traceId!],
    ),
    logsBySpan: groupBy(
      dataset.logs.filter((log) => log.spanId !== null),
      (log) => [log.spanId!],
    ),
    logsBySeverity: groupBy(dataset.logs, (log) => [log.severity]),
    metricSeriesById: immutableMap(dataset.metricSeries.map((series) => [series.id, series] as const)),
    metricSeriesByMetric: groupBy(dataset.metricSeries, (series) => [series.metric]),
    metricSeriesByEnvironment: groupBy(dataset.metricSeries, (series) => [series.environmentId]),
    metricSeriesByService: groupBy(
      dataset.metricSeries.filter((series) => series.serviceId !== null),
      (series) => [series.serviceId!],
    ),
    metricSeriesByDimensions: groupBy(dataset.metricSeries, (series) => [dimensionKey(series.dimensions)]),
    rulesById: immutableMap(dataset.alertRules.map((rule) => [rule.id, rule] as const)),
    incidentsById: immutableMap(dataset.incidents.map((incident) => [incident.id, incident] as const)),
    incidentsByRule: groupBy(dataset.incidents, (incident) => [incident.ruleId]),
    incidentsByService: groupBy(dataset.incidents, (incident) => incident.serviceIds),
  })
}
