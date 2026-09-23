import type { DatasetIndexes } from '../data/indexes.ts'
import type { InvestigationRange } from './navigation-state.ts'
import type { Incident, ReplayClockSnapshot, Service, ServiceHealth, TelemetryDataset } from '../domain/telemetry.ts'
import { isOffsetVisible } from './time-window.ts'
import { selectIncidents, selectMetricSeries } from './selectors.ts'

function latestMetricValue(
  dataset: TelemetryDataset,
  indexes: DatasetIndexes,
  snapshot: ReplayClockSnapshot,
  range: InvestigationRange,
  serviceId: string,
  metric: string,
): number | null {
  const series = selectMetricSeries(dataset, indexes, snapshot, { serviceId, metric })[0]
  return series?.points.filter(({ offsetMs, value }) => value !== null && isOffsetVisible(offsetMs, dataset, snapshot, range)).at(-1)?.value ?? null
}

function healthFromEvidence(errorRate: number | null, incidents: readonly Incident[]): ServiceHealth {
  if (errorRate === null) return 'unknown'
  if (incidents.some(({ severity, state }) => severity === 'critical' && state !== 'resolved') || errorRate > 0.06) return 'critical'
  if (incidents.some(({ state }) => state !== 'resolved') || errorRate > 0.018) return 'warning'
  return 'healthy'
}

function scale(value: number, baseline: number, current: number): number {
  return baseline <= 0 ? current : value * (current / baseline)
}

export function projectServices(
  dataset: TelemetryDataset,
  indexes: DatasetIndexes,
  snapshot: ReplayClockSnapshot,
  range: InvestigationRange,
  environmentId?: string,
): readonly Service[] {
  const candidates = environmentId ? (indexes.servicesByEnvironment.get(environmentId) ?? []) : dataset.services
  const scopedIncidents = selectIncidents(dataset, indexes, snapshot, {}).filter(({ startedOffsetMs }) =>
    isOffsetVisible(startedOffsetMs, dataset, snapshot, range),
  )

  return candidates.map((service) => {
    const requestRate = latestMetricValue(dataset, indexes, snapshot, range, service.id, 'request-rate')
    const latencyP95 = latestMetricValue(dataset, indexes, snapshot, range, service.id, 'latency-p95')
    const errorPercent = latestMetricValue(dataset, indexes, snapshot, range, service.id, 'error-rate')
    const hasEvidence = requestRate !== null && latencyP95 !== null && errorPercent !== null
    const throughputPerMinute = hasEvidence ? Math.max(0, Math.round(requestRate * 60)) : 0
    const projectedP95 = hasEvidence ? Math.max(0, Math.round(latencyP95)) : 0
    const projectedP50 = hasEvidence ? Math.min(projectedP95, Math.max(0, Math.round(scale(service.latencyP50Ms, service.latencyP95Ms, projectedP95)))) : 0
    const projectedP99 = hasEvidence ? Math.max(projectedP95, Math.round(scale(service.latencyP99Ms, service.latencyP95Ms, projectedP95))) : 0
    const errorRate = hasEvidence ? Number(Math.min(1, Math.max(0, errorPercent / 100)).toFixed(4)) : 0
    const incidents = scopedIncidents.filter(({ serviceIds }) => serviceIds.includes(service.id))

    return {
      ...service,
      health: healthFromEvidence(hasEvidence ? errorRate : null, incidents),
      throughputPerMinute,
      latencyP50Ms: projectedP50,
      latencyP95Ms: projectedP95,
      latencyP99Ms: projectedP99,
      errorRate,
      operations: service.operations.map((operation) => ({
        ...operation,
        throughputPerMinute: hasEvidence ? Math.max(0, Math.round(scale(operation.throughputPerMinute, service.throughputPerMinute, throughputPerMinute))) : 0,
        latencyP95Ms: hasEvidence ? Math.max(0, Math.round(scale(operation.latencyP95Ms, service.latencyP95Ms, projectedP95))) : 0,
        errorRate: hasEvidence ? Number(Math.min(1, Math.max(0, errorRate + operation.errorRate - service.errorRate)).toFixed(4)) : 0,
      })),
    }
  })
}
