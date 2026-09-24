import type { DatasetIndexes } from '../../lib/data/indexes.ts'
import type { Incident, ReplayClockSnapshot, Service, TelemetryDataset } from '../../lib/domain/telemetry.ts'
import type { InvestigationRange } from '../../lib/query/navigation-state.ts'
import { isOffsetVisible } from '../../lib/query/time-window.ts'
import { selectIncidents } from '../../lib/query/selectors.ts'
import { projectServices } from '../../lib/query/service-projection.ts'

const healthRank: Record<Service['health'], number> = { critical: 0, warning: 1, unknown: 2, healthy: 3 }

export interface OverviewProjection {
  services: readonly Service[]
  healthyServices: number
  criticalServices: number
  requestRate: number
  latencyP95Ms: number
  errorRate: number
  activeIncidents: readonly Incident[]
  recentChanges: readonly { serviceId: string; serviceName: string; version: string; summary: string; timestampOffsetMs: number }[]
}

export function overviewProjection(
  dataset: TelemetryDataset,
  indexes: DatasetIndexes,
  snapshot: ReplayClockSnapshot,
  environmentId: string,
  range: InvestigationRange = { kind: 'relative', value: '2h' },
): OverviewProjection {
  const services = [...projectServices(dataset, indexes, snapshot, range, environmentId)].sort(
    (left, right) => healthRank[left.health] - healthRank[right.health] || right.errorRate - left.errorRate,
  )
  const activeIncidents = selectIncidents(dataset, indexes, snapshot, {}).filter(
    (incident) =>
      incident.state !== 'resolved' &&
      incident.serviceIds.some((id) => indexes.servicesById.get(id)?.environmentId === environmentId) &&
      isOffsetVisible(incident.startedOffsetMs, dataset, snapshot, range),
  )
  const recentChanges = services
    .flatMap((service) => service.deployments.map((deployment) => ({ serviceId: service.id, serviceName: service.name, ...deployment })))
    .filter(({ timestampOffsetMs }) => isOffsetVisible(timestampOffsetMs, dataset, snapshot, range))
    .sort((left, right) => right.timestampOffsetMs - left.timestampOffsetMs)
    .slice(0, 5)
  return {
    services,
    healthyServices: services.filter(({ health }) => health === 'healthy').length,
    criticalServices: services.filter(({ health }) => health === 'critical').length,
    requestRate: services.reduce((sum, service) => sum + service.throughputPerMinute, 0),
    latencyP95Ms: Math.max(0, ...services.map(({ latencyP95Ms }) => latencyP95Ms)),
    errorRate: services.length === 0 ? 0 : services.reduce((sum, service) => sum + service.errorRate, 0) / services.length,
    activeIncidents,
    recentChanges,
  }
}
