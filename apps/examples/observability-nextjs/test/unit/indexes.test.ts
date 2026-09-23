import assert from 'node:assert/strict'
import test from 'node:test'

import { telemetryDataset } from '../../lib/data/dataset.ts'
import { buildDatasetIndexes } from '../../lib/data/indexes.ts'
import {
  findCorrelatedLogs,
  selectIncidents,
  selectLogs,
  selectMetricSeries,
  selectServices,
  selectTraces,
  type ReplayClockSnapshot,
} from '../../lib/query/selectors.ts'

const indexes = buildDatasetIndexes(telemetryDataset)
const snapshot: ReplayClockSnapshot = {
  baselineInstant: telemetryDataset.baselineInstant,
  tick: 0,
  status: 'paused',
  stepMs: 15_000,
}

test('indexes resolve every primary entity and grouping', () => {
  const service = telemetryDataset.services[0]
  const trace = telemetryDataset.traces[0]
  const span = telemetryDataset.spans.find((candidate) => candidate.traceId === trace.id)!
  const log = telemetryDataset.logs[0]
  const metric = telemetryDataset.metricSeries[0]
  const rule = telemetryDataset.alertRules[0]
  const incident = telemetryDataset.incidents[0]

  assert.equal(indexes.environmentsById.get(service.environmentId)?.id, service.environmentId)
  assert.equal(indexes.servicesById.get(service.id), service)
  assert.ok(indexes.servicesByEnvironment.get(service.environmentId)?.includes(service))
  assert.equal(indexes.tracesById.get(trace.id), trace)
  assert.ok(indexes.tracesByService.get(trace.rootServiceId)?.includes(trace))
  assert.equal(indexes.spansById.get(span.id), span)
  assert.ok(indexes.spansByTrace.get(trace.id)?.includes(span))
  assert.equal(indexes.logsById.get(log.id), log)
  assert.ok(indexes.logsByService.get(log.serviceId)?.includes(log))
  assert.equal(indexes.metricSeriesById.get(metric.id), metric)
  assert.ok(indexes.metricSeriesByMetric.get(metric.metric)?.includes(metric))
  assert.equal(indexes.rulesById.get(rule.id), rule)
  assert.equal(indexes.incidentsById.get(incident.id), incident)
  assert.ok(indexes.incidentsByRule.get(incident.ruleId)?.includes(incident))
})

test('derived index arrays and maps reject accidental mutation', () => {
  const service = telemetryDataset.services[0]
  const grouped = indexes.servicesByEnvironment.get(service.environmentId)!

  assert.ok(Object.isFrozen(grouped))
  assert.throws(() => (grouped as (typeof service)[]).push(service), TypeError)
  assert.throws(() => (indexes.servicesById as Map<string, typeof service>).set('other', service), /immutable index/)
})

test('snapshot-aware selectors filter services, traces, logs, metrics, rules, and incidents', () => {
  const environmentId = telemetryDataset.environments.find(({ isDefault }) => isDefault)!.id
  const services = selectServices(telemetryDataset, indexes, snapshot, { environmentId })
  assert.ok(services.length > 0)
  assert.ok(services.every((service) => service.environmentId === environmentId))

  const serviceId = services[0].id
  assert.ok(selectTraces(telemetryDataset, indexes, snapshot, { environmentId, serviceId }).every((trace) => trace.rootServiceId === serviceId))
  assert.ok(selectLogs(telemetryDataset, indexes, snapshot, { environmentId, serviceId }).every((log) => log.serviceId === serviceId))
  assert.ok(selectMetricSeries(telemetryDataset, indexes, snapshot, { environmentId, serviceId }).every((series) => series.serviceId === serviceId))
  assert.ok(selectIncidents(telemetryDataset, indexes, snapshot, { serviceId }).every((incident) => incident.serviceIds.includes(serviceId)))
})

test('trace and span correlation lookups return only consistent logs', () => {
  const trace = telemetryDataset.traces.find((candidate) => (indexes.logsByTrace.get(candidate.id)?.length ?? 0) > 0)!
  const logs = findCorrelatedLogs(indexes, trace.id)

  assert.ok(logs.length > 0)
  assert.ok(logs.every((log) => log.traceId === trace.id))
  assert.ok(logs.every((log) => log.spanId === null || indexes.spansById.get(log.spanId)?.traceId === trace.id))
})

test('replay tick bounds time-bearing selector results without mutating indexes', () => {
  const before = indexes.logsById.size
  const initial = selectLogs(telemetryDataset, indexes, snapshot, {})
  const later = selectLogs(telemetryDataset, indexes, { ...snapshot, tick: 4 }, {})

  assert.ok(later.length >= initial.length)
  assert.equal(indexes.logsById.size, before)
})
