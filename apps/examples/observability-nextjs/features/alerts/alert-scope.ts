import type { AlertRule, ReplayClockSnapshot, TelemetryDataset } from '../../lib/domain/telemetry.ts'
import type { GlobalScope } from '../../providers/ScopeProvider.tsx'
import { isOffsetVisible } from '../../lib/query/time-window.ts'

export function projectAlertScope(dataset: TelemetryDataset, rules: readonly AlertRule[], snapshot: ReplayClockSnapshot, scope: GlobalScope) {
  const services = dataset.services.filter(({ environmentId }) => environmentId === scope.environmentId)
  const serviceIds = new Set(services.map(({ id }) => id))
  return {
    services,
    rules: rules.filter((rule) => rule.serviceIds.some((id) => serviceIds.has(id))),
    incidents: dataset.incidents.filter(
      (incident) => incident.serviceIds.some((id) => serviceIds.has(id)) && isOffsetVisible(incident.startedOffsetMs, dataset, snapshot, scope.range),
    ),
  }
}
