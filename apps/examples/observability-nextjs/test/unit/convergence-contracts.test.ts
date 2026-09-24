import assert from 'node:assert/strict'
import test from 'node:test'
import { serviceDetailHref } from '../../features/services/service-navigation.ts'
import { telemetryDataset } from '../../lib/data/dataset.ts'
import { parseNavigationState } from '../../lib/query/navigation-state.ts'
import { APP_BASE_PATH, parseDetailReturnContext, withAppBasePath } from '../../lib/query/internal-href.ts'
import { baselineReplaySnapshot, isOffsetVisible } from '../../lib/query/time-window.ts'
import { projectAlertScope } from '../../features/alerts/alert-scope.ts'
import { buildDatasetIndexes } from '../../lib/data/indexes.ts'
import { overviewProjection } from '../../features/overview/overview-selectors.ts'
import { serviceDetailProjection } from '../../features/services/service-selectors.ts'
import { projectTraceSearch } from '../../features/traces/trace-search.ts'
import { projectLogSearch } from '../../features/logs/log-search.ts'
import { selectDashboardProjections } from '../../features/dashboards/dashboard-selectors.ts'
import { selectIncidents, selectLogs, selectMetricSeries, selectTraces } from '../../lib/query/selectors.ts'

const indexes = buildDatasetIndexes(telemetryDataset)

test('deployment hrefs prefix root-relative custom-element links exactly once', () => {
  assert.equal(withAppBasePath('/services/'), `${APP_BASE_PATH}/services/`)
  assert.equal(withAppBasePath(`${APP_BASE_PATH}/services/`), `${APP_BASE_PATH}/services/`)
  assert.equal(withAppBasePath('./?page=2'), './?page=2')
  assert.equal(withAppBasePath('https://example.test'), 'https://example.test')
})

test('service detail links retain normalized scope and an exact collection return context', () => {
  const state = parseNavigationState('services', 'env=staging&range=30m&q=checkout&status=warning&sort=latency&dir=asc')
  const href = serviceDetailHref('staging-checkout', state)
  const url = new URL(href, 'https://local.invalid')
  assert.equal(url.searchParams.get('env'), 'staging')
  assert.equal(url.searchParams.get('range'), '30m')
  assert.match(url.searchParams.get('return') ?? '', /^\/services\/\?env=staging&range=30m&q=checkout&status=warning/)
})

test('detail return parsing accepts only known investigation detail routes', () => {
  assert.equal(parseDetailReturnContext('return=%2Fservices%2Fproduction-api-gateway%2F%3Frange%3D30m'), '/services/production-api-gateway/?range=30m')
  assert.equal(parseDetailReturnContext('return=%2Fincidents%2Fincident-01%2F%3Fenv%3Dstaging'), '/incidents/incident-01/?env=staging')
  assert.equal(parseDetailReturnContext('return=https%3A%2F%2Fevil.test%2Fservices%2Fx'), null)
  assert.equal(parseDetailReturnContext('return=%2Falerts%2F'), null)
})

test('replay windows move every time-bearing projection from the shared logical tick', () => {
  const baseline = baselineReplaySnapshot(telemetryDataset)
  const range = { kind: 'relative', value: '30m' } as const
  assert.equal(isOffsetVisible(-29 * 60_000, telemetryDataset, baseline, range), true)
  assert.equal(isOffsetVisible(-31 * 60_000, telemetryDataset, baseline, range), false)
  assert.equal(isOffsetVisible(2 * 60_000, telemetryDataset, baseline, range), false)
  assert.equal(isOffsetVisible(2 * 60_000, telemetryDataset, { ...baseline, tick: 12, stepMs: 15_000 }, range), true)
})

test('alert and incident data follows the global environment and time scope', () => {
  const snapshot = baselineReplaySnapshot(telemetryDataset)
  const production = projectAlertScope(telemetryDataset, telemetryDataset.alertRules, snapshot, {
    environmentId: 'production',
    range: { kind: 'relative', value: '24h' },
  })
  const staging = projectAlertScope(telemetryDataset, telemetryDataset.alertRules, snapshot, {
    environmentId: 'staging',
    range: { kind: 'relative', value: '24h' },
  })
  assert.ok(production.rules.length > 0)
  assert.ok(production.incidents.length > 0)
  assert.ok(production.services.every(({ environmentId }) => environmentId === 'production'))
  assert.ok(staging.services.every(({ environmentId }) => environmentId === 'staging'))
  assert.equal(staging.rules.length, 0)
  assert.equal(staging.incidents.length, 0)
})

test('baseline and completed replay snapshots bound every time-bearing projection to one exact window', () => {
  const range = { kind: 'relative', value: '2h' } as const
  const state = parseNavigationState('traces', 'range=2h')
  const logState = parseNavigationState('logs', 'range=2h')
  for (const snapshot of [baselineReplaySnapshot(telemetryDataset), { ...baselineReplaySnapshot(telemetryDataset), tick: 12 }]) {
    const visible = (offsetMs: number) => isOffsetVisible(offsetMs, telemetryDataset, snapshot, range)
    const overview = overviewProjection(telemetryDataset, indexes, snapshot, 'production', range)
    const service = serviceDetailProjection(telemetryDataset, indexes, snapshot, 'production-payment-orchestrator', range)
    const traces = projectTraceSearch(telemetryDataset, indexes, state, { snapshot })
    const logs = projectLogSearch(telemetryDataset, indexes, logState, snapshot)
    const alerts = projectAlertScope(telemetryDataset, telemetryDataset.alertRules, snapshot, { environmentId: 'production', range })
    const dashboard = selectDashboardProjections(telemetryDataset, indexes, snapshot, { environmentId: 'production', range })

    assert.ok(overview.recentChanges.every(({ timestampOffsetMs }) => visible(timestampOffsetMs)))
    assert.ok(overview.activeIncidents.every(({ startedOffsetMs }) => visible(startedOffsetMs)))
    assert.ok(service?.deployments.every(({ timestampOffsetMs }) => visible(timestampOffsetMs)))
    assert.ok(service?.traces.every(({ startOffsetMs }) => visible(startOffsetMs)))
    assert.ok(service?.logs.every(({ timestampOffsetMs }) => visible(timestampOffsetMs)))
    assert.ok(service?.incidents.every(({ startedOffsetMs }) => visible(startedOffsetMs)))
    assert.ok(service?.metrics.every(({ points }) => points.every(({ offsetMs }) => visible(offsetMs))))
    assert.ok(traces.items.every(({ trace }) => visible(trace.startOffsetMs)))
    assert.ok(logs.items.every(({ log }) => visible(log.timestampOffsetMs)))
    assert.ok(alerts.incidents.every(({ startedOffsetMs }) => visible(startedOffsetMs)))
    assert.ok(
      dashboard
        .flatMap(({ chartRows }) => chartRows)
        .filter(({ label }) => label === undefined)
        .every(({ offsetMs }) => visible(offsetMs)),
    )
  }
})

function replaySignalSignature(snapshot: ReturnType<typeof baselineReplaySnapshot>) {
  const range = { kind: 'relative', value: '30m' } as const
  const traces = selectTraces(telemetryDataset, indexes, snapshot, { environmentId: 'production' }).filter(({ startOffsetMs }) =>
    isOffsetVisible(startOffsetMs, telemetryDataset, snapshot, range),
  )
  const logs = selectLogs(telemetryDataset, indexes, snapshot, { environmentId: 'production' }).filter(({ timestampOffsetMs }) =>
    isOffsetVisible(timestampOffsetMs, telemetryDataset, snapshot, range),
  )
  const metrics = selectMetricSeries(telemetryDataset, indexes, snapshot, { environmentId: 'production' })
    .flatMap(({ points }) => points)
    .filter(({ offsetMs }) => isOffsetVisible(offsetMs, telemetryDataset, snapshot, range))
  const incidents = selectIncidents(telemetryDataset, indexes, snapshot, {}).filter(({ startedOffsetMs }) =>
    isOffsetVisible(startedOffsetMs, telemetryDataset, snapshot, range),
  )
  const overview = overviewProjection(telemetryDataset, indexes, snapshot, 'production', range)
  return {
    services: overview.services.map(({ id, health, throughputPerMinute, latencyP95Ms, errorRate }) => ({
      id,
      health,
      throughputPerMinute,
      latencyP95Ms,
      errorRate,
    })),
    metricOffsets: [...new Set(metrics.map(({ offsetMs }) => offsetMs))],
    traceIds: traces.map(({ id }) => id),
    logIds: logs.map(({ id }) => id),
    incidents: incidents.map(({ id, state }) => ({ id, state })),
  }
}

test('every telemetry signal advances coherently through deterministic replay milestones', () => {
  const baseline = baselineReplaySnapshot(telemetryDataset)
  const snapshots = [baseline, { ...baseline, tick: 6, status: 'playing' as const }, { ...baseline, tick: 12 }]
  const sequence = snapshots.map(replaySignalSignature)

  assert.notDeepEqual(sequence[0].services, sequence[1].services)
  assert.notDeepEqual(sequence[1].services, sequence[2].services)
  assert.notDeepEqual(sequence[0].metricOffsets, sequence[1].metricOffsets)
  assert.notDeepEqual(sequence[1].metricOffsets, sequence[2].metricOffsets)
  assert.notDeepEqual(sequence[0].traceIds, sequence[1].traceIds)
  assert.notDeepEqual(sequence[1].traceIds, sequence[2].traceIds)
  assert.notDeepEqual(sequence[0].logIds, sequence[1].logIds)
  assert.notDeepEqual(sequence[1].logIds, sequence[2].logIds)
  assert.notDeepEqual(sequence[0].incidents, sequence[1].incidents)
  assert.notDeepEqual(sequence[1].incidents, sequence[2].incidents)
  assert.deepEqual(sequence, snapshots.map(replaySignalSignature))
  assert.deepEqual(replaySignalSignature({ ...snapshots[1], status: 'paused' }), sequence[1])
  assert.deepEqual(replaySignalSignature({ ...snapshots[2], tick: 0, status: 'paused' }), sequence[0])
})

test('the full replay horizon has correlated metric, trace, and log evidence at every tick', () => {
  const baseline = baselineReplaySnapshot(telemetryDataset)
  for (let tick = 1; tick <= 12; tick += 1) {
    const offsetMs = tick * baseline.stepMs
    assert.ok(telemetryDataset.metricSeries.every(({ points }) => points.some((point) => point.offsetMs === offsetMs)))
    const traces = telemetryDataset.traces.filter(({ startOffsetMs }) => startOffsetMs === offsetMs)
    assert.ok(traces.length > 0)
    for (const trace of traces) {
      const logs = telemetryDataset.logs.filter(({ traceId, timestampOffsetMs }) => traceId === trace.id && timestampOffsetMs === offsetMs)
      assert.ok(logs.length > 0)
      assert.ok(
        logs.every(({ spanId, serviceId }) => spanId !== null && indexes.spansById.get(spanId)?.traceId === trace.id && serviceId === trace.rootServiceId),
      )
    }
  }

  const replayIncident = telemetryDataset.incidents.find(({ startedOffsetMs }) => startedOffsetMs > 0)
  assert.ok(replayIncident)
  const triggeringTrace = telemetryDataset.traces.find(({ startOffsetMs }) => startOffsetMs === replayIncident.startedOffsetMs)
  assert.ok(triggeringTrace)
  assert.ok(replayIncident.serviceIds.includes(triggeringTrace.rootServiceId))
  const stateAt = (tick: number) => selectIncidents(telemetryDataset, indexes, { ...baseline, tick }, {}).find(({ id }) => id === replayIncident.id)?.state
  assert.equal(stateAt(2), undefined)
  assert.equal(stateAt(3), 'active')
  assert.equal(stateAt(6), 'acknowledged')
  assert.equal(stateAt(11), 'resolved')
})
