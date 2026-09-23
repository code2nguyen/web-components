import assert from 'node:assert/strict'
import test from 'node:test'
import { telemetryDataset } from '../../lib/data/dataset.ts'
import { buildDatasetIndexes } from '../../lib/data/indexes.ts'
import { overviewProjection } from '../../features/overview/overview-selectors.ts'
import { serviceDetailProjection } from '../../features/services/service-selectors.ts'
import { isOffsetVisible } from '../../lib/query/time-window.ts'

const indexes = buildDatasetIndexes(telemetryDataset)
const snapshot = { baselineInstant: telemetryDataset.baselineInstant, tick: 0, status: 'paused' as const, stepMs: 30_000 }

test('overview prioritizes actionable health and derives coherent KPIs', () => {
  const range = { kind: 'relative', value: '2h' } as const
  const overview = overviewProjection(telemetryDataset, indexes, snapshot, 'production', range)
  assert.equal(overview.services.length, 8)
  assert.equal(overview.services[0]?.health, 'critical')
  assert.ok(overview.criticalServices >= 1)
  assert.ok(overview.requestRate > 0)
  assert.ok(overview.activeIncidents.length >= 1)
  assert.ok(overview.recentChanges.every((change) => change.serviceId.startsWith('production-')))
  assert.ok(overview.activeIncidents.every((incident) => isOffsetVisible(incident.startedOffsetMs, telemetryDataset, snapshot, range)))
  assert.ok(overview.recentChanges.every((change) => isOffsetVisible(change.timestampOffsetMs, telemetryDataset, snapshot, range)))
})

test('service detail uses the exact range and effective alert-rule overlay', () => {
  const range = { kind: 'relative', value: '30m' } as const
  const baselineRule = telemetryDataset.alertRules.find((rule) => rule.serviceIds.includes('production-payment-orchestrator'))
  assert.ok(baselineRule)
  const editedRule = { ...baselineRule, name: `${baselineRule.name} locally edited`, origin: 'local' as const }
  const rules = telemetryDataset.alertRules.map((rule) => (rule.id === editedRule.id ? editedRule : rule))
  const detail = serviceDetailProjection(telemetryDataset, indexes, snapshot, 'production-payment-orchestrator', range, rules)
  assert.ok(detail)
  assert.ok(detail.alerts.some((rule) => rule.name === editedRule.name))
  assert.ok(detail.deployments.every((deployment) => isOffsetVisible(deployment.timestampOffsetMs, telemetryDataset, snapshot, range)))
  assert.ok(detail.logs.every((log) => isOffsetVisible(log.timestampOffsetMs, telemetryDataset, snapshot, range)))
})

test('service detail orders operations, resolves dependencies, and preserves correlation identities', () => {
  const detail = serviceDetailProjection(telemetryDataset, indexes, snapshot, 'production-payment-orchestrator')
  assert.ok(detail)
  assert.equal(detail.service.health, 'critical')
  assert.ok(detail.operations.every((operation, index) => index === 0 || detail.operations[index - 1].latencyP95Ms >= operation.latencyP95Ms))
  assert.ok(detail.dependencies.every((service) => detail.service.dependencies.includes(service.id)))
  assert.ok(detail.traces.length > 0)
  assert.ok(detail.alerts.length > 0)
  assert.ok(detail.incidents.length > 0)
  assert.ok(detail.alerts.every((rule) => rule.serviceIds.includes(detail.service.id)))
  assert.ok(detail.incidents.every((incident) => incident.serviceIds.includes(detail.service.id)))
  for (const log of detail.logs) {
    if (log.traceId) assert.equal(indexes.tracesById.get(log.traceId)?.id, log.traceId)
    if (log.spanId) assert.equal(indexes.spansById.get(log.spanId)?.traceId, log.traceId)
  }
  assert.ok(detail.deployments.every((deployment, index) => index === 0 || detail.deployments[index - 1].timestampOffsetMs >= deployment.timestampOffsetMs))
})

test('unknown services return null instead of leaking a neighboring record', () => {
  assert.equal(serviceDetailProjection(telemetryDataset, indexes, snapshot, 'unknown'), null)
})

test('service summaries derive from the exact metric and incident window', () => {
  const serviceId = 'production-payment-orchestrator'
  const completed = { ...snapshot, tick: 12, stepMs: 15_000 }
  const replayWindow = {
    kind: 'absolute',
    from: '2026-08-17T14:02:00.000Z',
    to: '2026-08-17T14:03:00.000Z',
  } as const
  const detail = serviceDetailProjection(telemetryDataset, indexes, completed, serviceId, replayWindow)
  assert.ok(detail)

  const latest = (metric: string) =>
    telemetryDataset.metricSeries
      .find((series) => series.serviceId === serviceId && series.metric === metric)
      ?.points.filter(({ offsetMs }) => offsetMs >= 120_000 && offsetMs <= 180_000)
      .at(-1)?.value

  assert.equal(detail.service.throughputPerMinute, Math.round((latest('request-rate') ?? 0) * 60))
  assert.equal(detail.service.latencyP95Ms, Math.round(latest('latency-p95') ?? 0))
  assert.equal(detail.service.errorRate, Number(((latest('error-rate') ?? 0) / 100).toFixed(4)))
  assert.ok(detail.operations.every((operation) => operation.throughputPerMinute <= detail.service.throughputPerMinute))
})

test('a range without metric evidence produces unknown rather than stale baseline health', () => {
  const noDataRange = {
    kind: 'absolute',
    from: '2026-08-16T14:00:00.000Z',
    to: '2026-08-16T15:00:00.000Z',
  } as const
  const overview = overviewProjection(telemetryDataset, indexes, snapshot, 'production', noDataRange)

  assert.ok(overview.services.every(({ health }) => health === 'unknown'))
  assert.equal(overview.requestRate, 0)
  assert.equal(overview.latencyP95Ms, 0)
  assert.equal(overview.errorRate, 0)
})
