import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { telemetryDataset } from '../../lib/data/dataset.ts'
import { buildDatasetIndexes } from '../../lib/data/indexes.ts'
import { parseNavigationState } from '../../lib/query/navigation-state.ts'
import { buildLogsCorrelationHref, highlightMatches, projectTraceSearch, type TraceSearchOptions } from '../../features/traces/trace-search.ts'
import { buildTraceCorrelationHref, parseTraceReturnContext, projectLogSearch } from '../../features/logs/log-search.ts'

const indexes = buildDatasetIndexes(telemetryDataset)

describe('trace search projection', () => {
  it('intersects filters, sorts canonically, and resets an invalid page', () => {
    const slowError = telemetryDataset.traces.find((trace) => trace.status === 'error' && trace.durationMs > 500)
    assert.ok(slowError)
    const state = parseNavigationState('traces', `service=${slowError.rootServiceId}&status=error&duration=over-500ms&page=999&pageSize=25`)
    const result = projectTraceSearch(telemetryDataset, indexes, state, { operation: slowError.rootOperation })

    assert.ok(result.total > 0)
    assert.equal(result.page, result.pageCount)
    assert.ok(result.items.every((row) => row.trace.rootServiceId === slowError.rootServiceId))
    assert.ok(result.items.every((row) => row.trace.status === 'error' && row.trace.durationMs > 500))
    assert.ok(result.items.every((row) => row.trace.rootOperation === slowError.rootOperation))
    assert.deepEqual(
      result.items.map(({ trace }) => trace.startOffsetMs),
      [...result.items].map(({ trace }) => trace.startOffsetMs).sort((left, right) => right - left),
    )
  })

  it('supports every allowed page size and exposes independently removable criteria', () => {
    for (const pageSize of [25, 50, 100] as const) {
      const state = parseNavigationState('traces', `pageSize=${pageSize}&status=error`)
      const result = projectTraceSearch(telemetryDataset, indexes, state)
      assert.ok(result.items.length <= pageSize)
      assert.equal(result.pageSize, pageSize)
      assert.deepEqual(
        result.criteria.map(({ key }) => result.criteria.filter((criterion) => criterion.key === key).length),
        [1],
      )
    }
  })
})

describe('log search projection', () => {
  it('intersects severity, service, time, and text and validates a selected log', () => {
    const target = telemetryDataset.logs.find((log) => log.severity === 'error' && log.traceId !== null)
    assert.ok(target)
    const state = parseNavigationState(
      'logs',
      `env=${target.environmentId}&service=${target.serviceId}&severity=error&q=${encodeURIComponent(target.message.slice(0, 12))}&log=${target.id}`,
    )
    const result = projectLogSearch(telemetryDataset, indexes, state)

    assert.ok(result.total > 0)
    assert.ok(result.items.every((row) => row.log.serviceId === target.serviceId && row.log.severity === 'error'))
    assert.equal(result.selected?.id, target.id)
    assert.equal(projectLogSearch(telemetryDataset, indexes, parseNavigationState('logs', 'log=unknown-log')).selected, null)
  })

  it('keeps sorting stable and bounds pages at 25, 50, and 100 records', () => {
    for (const pageSize of [25, 50, 100] as const) {
      const result = projectLogSearch(telemetryDataset, indexes, parseNavigationState('logs', `page=2&pageSize=${pageSize}&sort=timestamp&dir=asc`))
      assert.ok(result.items.length <= pageSize)
      assert.equal(result.pageSize, pageSize)
      assert.deepEqual(
        result.items.map(({ log }) => log.timestampOffsetMs),
        [...result.items].map(({ log }) => log.timestampOffsetMs).sort((left, right) => left - right),
      )
    }
  })
})

describe('match and correlation helpers', () => {
  it('applies one replay snapshot to trace and log range projections', () => {
    const traceState = parseNavigationState('traces', 'range=30m')
    const logState = parseNavigationState('logs', 'range=30m')
    const baseline = { baselineInstant: telemetryDataset.baselineInstant, tick: 0, status: 'paused' as const, stepMs: 15_000 }
    const advanced = { ...baseline, tick: 12 }
    const baselineTraces = projectTraceSearch(telemetryDataset, indexes, traceState, { snapshot: baseline })
    const advancedTraces = projectTraceSearch(telemetryDataset, indexes, traceState, { snapshot: advanced })
    const baselineLogs = projectLogSearch(telemetryDataset, indexes, logState, baseline)
    const advancedLogs = projectLogSearch(telemetryDataset, indexes, logState, advanced)

    assert.notDeepEqual(
      advancedTraces.items.map(({ trace }) => trace.id),
      baselineTraces.items.map(({ trace }) => trace.id),
    )
    assert.notDeepEqual(
      advancedLogs.items.map(({ log }) => log.id),
      baselineLogs.items.map(({ log }) => log.id),
    )
  })

  it('highlights every case-insensitive text match without changing source text', () => {
    assert.deepEqual(highlightMatches('Checkout checkout complete', 'checkOUT'), [
      { text: 'Checkout', match: true },
      { text: ' ', match: false },
      { text: 'checkout', match: true },
      { text: ' complete', match: false },
    ])
  })

  it('preserves shared scope and explicit return context across signals', () => {
    const trace = telemetryDataset.traces.find((item) => indexes.logsByTrace.has(item.id))
    assert.ok(trace)
    const traceState = parseNavigationState('traces', `env=staging&range=24h&status=error&page=2&pageSize=50`)
    const logsHref = buildLogsCorrelationHref(trace.id, traceState, '/traces/trace-1/?return=%2Ftraces%2F')
    const log = indexes.logsByTrace.get(trace.id)?.[0]
    assert.ok(log)
    const logState = parseNavigationState('logs', `env=staging&range=24h&severity=error&page=3&pageSize=100&log=${log.id}`)
    const traceHref = buildTraceCorrelationHref(log, logState)

    assert.match(logsHref, /^\/logs\?/)
    assert.match(logsHref, /env=staging/)
    assert.match(logsHref, /range=24h/)
    assert.match(logsHref, new RegExp(`trace=${trace.id}`))
    assert.match(logsHref, /return=/)
    assert.ok(traceHref.startsWith(`/traces/${trace.id}?`))
    assert.match(traceHref, /return=/)
    assert.equal(parseTraceReturnContext(logsHref.slice(logsHref.indexOf('?'))), '/traces/trace-1/?return=%2Ftraces%2F')
    assert.equal(parseTraceReturnContext('return=https%3A%2F%2Fevil.example%2Ftraces%2Ftrace-1'), null)
  })

  it('accepts an optional operation criterion independently of free text', () => {
    const target = telemetryDataset.traces[0]
    const options: TraceSearchOptions = { operation: target.rootOperation }
    const result = projectTraceSearch(telemetryDataset, indexes, parseNavigationState('traces', ''), options)
    assert.ok(result.items.every(({ trace }) => trace.rootOperation === target.rootOperation))
  })

  it('keeps operation in canonical trace detail and return context', () => {
    const target = telemetryDataset.traces[0]
    const state = parseNavigationState('traces', `operation=${encodeURIComponent(target.rootOperation)}&page=2&pageSize=50`)
    const result = projectTraceSearch(telemetryDataset, indexes, state)
    assert.ok(result.items.every(({ trace }) => trace.rootOperation === target.rootOperation))
    assert.equal(state.filters.operation, target.rootOperation)
  })
})
