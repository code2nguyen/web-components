import type { DatasetIndexes } from '../../lib/data/indexes.ts'
import type { InvestigationRange } from '../../lib/query/navigation-state.ts'
import { isOffsetVisible } from '../../lib/query/time-window.ts'
import type { AlertRule, ReplayClockSnapshot, Service, TelemetryDataset } from '../../lib/domain/telemetry.ts'
import { findCorrelatedLogs, selectIncidents, selectLogs, selectMetricSeries, selectTraces } from '../../lib/query/selectors.ts'
import { projectServices } from '../../lib/query/service-projection.ts'

export function serviceDetailProjection(
  dataset: TelemetryDataset,
  indexes: DatasetIndexes,
  snapshot: ReplayClockSnapshot,
  serviceId: string,
  range: InvestigationRange = { kind: 'relative', value: '2h' },
  rules: readonly AlertRule[] = dataset.alertRules,
) {
  const baselineService = indexes.servicesById.get(serviceId)
  if (!baselineService) return null
  const projectedServices = projectServices(dataset, indexes, snapshot, range, baselineService.environmentId)
  const service = projectedServices.find(({ id }) => id === serviceId)!
  const traces = [...selectTraces(dataset, indexes, snapshot, { environmentId: service.environmentId, serviceId })]
    .filter(({ startOffsetMs }) => isOffsetVisible(startOffsetMs, dataset, snapshot, range))
    .sort((left, right) => right.startOffsetMs - left.startOffsetMs)
    .slice(0, 8)
  const directLogs = selectLogs(dataset, indexes, snapshot, { environmentId: service.environmentId, serviceId }).filter(({ timestampOffsetMs }) =>
    isOffsetVisible(timestampOffsetMs, dataset, snapshot, range),
  )
  const correlated = traces.flatMap((trace) => findCorrelatedLogs(indexes, trace.id))
  const logs = [...new Map([...directLogs, ...correlated].map((log) => [log.id, log])).values()]
    .filter(({ timestampOffsetMs }) => isOffsetVisible(timestampOffsetMs, dataset, snapshot, range))
    .sort((left, right) => right.timestampOffsetMs - left.timestampOffsetMs)
    .slice(0, 8)
  return {
    service,
    operations: [...service.operations].sort((left, right) => right.latencyP95Ms - left.latencyP95Ms),
    dependencies: service.dependencies
      .map((id) => projectedServices.find((candidate) => candidate.id === id))
      .filter((value): value is Service => value !== undefined),
    deployments: service.deployments
      .filter(({ timestampOffsetMs }) => isOffsetVisible(timestampOffsetMs, dataset, snapshot, range))
      .sort((left, right) => right.timestampOffsetMs - left.timestampOffsetMs),
    traces,
    logs,
    alerts: rules.filter((rule) => rule.serviceIds.includes(serviceId)),
    incidents: selectIncidents(dataset, indexes, snapshot, { serviceId }).filter(({ startedOffsetMs }) =>
      isOffsetVisible(startedOffsetMs, dataset, snapshot, range),
    ),
    metrics: selectMetricSeries(dataset, indexes, snapshot, { environmentId: service.environmentId, serviceId }).map((series) => ({
      ...series,
      points: series.points.filter(({ offsetMs }) => isOffsetVisible(offsetMs, dataset, snapshot, range)),
    })),
  }
}
