import assert from 'node:assert/strict'
import test from 'node:test'

import { createTelemetryDataset } from '../../lib/data/generator.ts'
import { assertDatasetIntegrity } from '../../lib/data/dataset.ts'

test('generation is repeatable for the fixed seed', () => {
  assert.deepEqual(createTelemetryDataset(), createTelemetryDataset())
})

test('generation is repeatable for an explicit non-zero seed', () => {
  assert.deepEqual(createTelemetryDataset(77), createTelemetryDataset(77))
  assert.notDeepEqual(createTelemetryDataset(77), createTelemetryDataset(78))
  assert.throws(() => createTelemetryDataset(0), /non-zero integer seed/)
})

test('dataset meets the required cardinalities and uses unique IDs', () => {
  const dataset = createTelemetryDataset()

  assert.ok(dataset.services.length >= 8)
  assert.ok(dataset.traces.length >= 150)
  assert.ok(dataset.logs.length >= 1_000)
  assert.ok(dataset.alertRules.length >= 8)
  assert.ok(dataset.incidents.length >= 6)

  for (const collection of [
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
  ]) {
    assert.equal(new Set(collection.map(({ id }) => id)).size, collection.length)
  }
})

test('all foreign keys resolve and timestamps stay within their owning intervals', () => {
  const dataset = createTelemetryDataset()
  const environments = new Set(dataset.environments.map(({ id }) => id))
  const services = new Set(dataset.services.map(({ id }) => id))
  const traces = new Map(dataset.traces.map((trace) => [trace.id, trace]))
  const spans = new Map(dataset.spans.map((span) => [span.id, span]))
  const rules = new Set(dataset.alertRules.map(({ id }) => id))
  const destinations = new Set(dataset.destinations.map(({ id }) => id))

  for (const service of dataset.services) {
    assert.ok(environments.has(service.environmentId))
    assert.ok(service.dependencies.every((id) => services.has(id) && id !== service.id))
  }

  for (const trace of dataset.traces) {
    assert.ok(environments.has(trace.environmentId))
    assert.ok(services.has(trace.rootServiceId))
    assert.equal(spans.get(trace.rootSpanId)?.parentSpanId, null)
    assert.ok(trace.spanIds.every((id) => spans.get(id)?.traceId === trace.id))
  }

  for (const span of dataset.spans) {
    const trace = traces.get(span.traceId)
    assert.ok(trace)
    assert.ok(services.has(span.serviceId))
    assert.ok(span.startOffsetMs >= trace.startOffsetMs)
    assert.ok(span.startOffsetMs + span.durationMs <= trace.startOffsetMs + trace.durationMs)
    if (span.parentSpanId !== null) assert.equal(spans.get(span.parentSpanId)?.traceId, span.traceId)
  }

  for (const log of dataset.logs) {
    assert.ok(environments.has(log.environmentId))
    assert.ok(services.has(log.serviceId))
    if (log.traceId !== null) assert.ok(traces.has(log.traceId))
    if (log.spanId !== null) {
      const span = spans.get(log.spanId)
      assert.ok(span)
      assert.equal(span.traceId, log.traceId)
    }
  }

  for (const rule of dataset.alertRules) {
    assert.ok(rule.serviceIds.every((id) => services.has(id)))
    assert.ok(rule.destinationIds.every((id) => destinations.has(id)))
  }

  for (const incident of dataset.incidents) {
    assert.ok(rules.has(incident.ruleId))
    assert.ok(incident.serviceIds.every((id) => services.has(id)))
  }
})

test('every trace is an acyclic tree with exactly one root', () => {
  const dataset = createTelemetryDataset()
  const spanById = new Map(dataset.spans.map((span) => [span.id, span]))

  for (const trace of dataset.traces) {
    const traceSpans = trace.spanIds.map((id) => spanById.get(id)!)
    assert.equal(traceSpans.filter(({ parentSpanId }) => parentSpanId === null).length, 1)

    for (const span of traceSpans) {
      const visited = new Set<string>()
      let cursor = span
      while (cursor.parentSpanId !== null) {
        assert.ok(!visited.has(cursor.id), `cycle detected in ${trace.id}`)
        visited.add(cursor.id)
        cursor = spanById.get(cursor.parentSpanId)!
      }
    }
  }
})

test('incident transitions are valid and state matches the final timeline event', () => {
  const dataset = createTelemetryDataset()
  const transitions: Record<string, Set<string>> = {
    triggered: new Set(['acknowledged', 'muted']),
    acknowledged: new Set(['resolved', 'muted']),
    muted: new Set(['active', 'resolved']),
    active: new Set(['acknowledged', 'muted', 'resolved']),
    resolved: new Set(),
  }

  for (const incident of dataset.incidents) {
    assert.equal(incident.timeline[0]?.state, 'triggered')
    for (let index = 1; index < incident.timeline.length; index += 1) {
      assert.ok(transitions[incident.timeline[index - 1].state]?.has(incident.timeline[index].state))
      assert.ok(incident.timeline[index].offsetMs >= incident.timeline[index - 1].offsetMs)
    }
    const finalState = incident.timeline.at(-1)?.state
    assert.equal(incident.state, finalState === 'triggered' ? 'active' : finalState)
  }
})

test('the complete integrity assertion accepts the generated dataset', () => {
  assert.doesNotThrow(() => assertDatasetIntegrity(createTelemetryDataset()))
})
