import assert from 'node:assert/strict'
import test from 'node:test'

import type { LogRecord, SeverityBand } from '../../lib/otlp.ts'
import { maskMessage, minePatterns, WILDCARD } from '../../lib/patterns.ts'

function records(bodies: Array<[string, SeverityBand?]>): LogRecord[] {
  return bodies.map(([body, severity = 'info'], index) => ({
    index,
    time: index * 1000,
    severity,
    severityText: '',
    severityNumber: 0,
    body,
    service: 'svc',
    scope: '',
    traceId: '',
    spanId: '',
    resource: {},
    attributes: {},
  }))
}

test('masks ids, numbers, durations, versions, IPs and quoted strings', () => {
  assert.deepEqual(maskMessage('GET /orders/42 200 in 31ms from 10.0.0.12:443 version=1.9.1 user="Ada Lovelace"'), [
    'GET',
    `/orders/${WILDCARD}`,
    WILDCARD,
    'in',
    WILDCARD,
    'from',
    WILDCARD,
    `version=${WILDCARD}`,
    `user=${WILDCARD}`,
  ])
  assert.deepEqual(maskMessage('trace 5b8efff798038103 order ORD-10428 id 123e4567-e89b-12d3-a456-426614174000'), [
    'trace',
    WILDCARD,
    'order',
    WILDCARD,
    'id',
    WILDCARD,
  ])
})

test('groups lines into templates and keeps what varied', () => {
  const patterns = minePatterns(
    records([
      ['payment authorized order_id=ORD-1 in 120ms'],
      ['payment authorized order_id=ORD-2 in 340ms'],
      ['payment authorized order_id=ORD-3 in 90ms'],
      ['payment failed order_id=ORD-4 reason=upstream_timeout', 'error'],
      ['payment failed order_id=ORD-5 reason=circuit_open', 'error'],
    ]),
  )
  assert.equal(patterns.length, 2)
  const [authorized, failed] = patterns
  assert.equal(authorized.id, 'P01')
  assert.equal(authorized.template, `payment authorized order_id=${WILDCARD} in ${WILDCARD}`)
  assert.equal(authorized.count, 3)
  const duration = authorized.slots.find((slot) => slot.label === 'in')
  assert.deepEqual(duration?.numeric, { min: 90, max: 340, avg: 550 / 3, unit: 'ms' })
  // Different reasons merge into one keyed wildcard, and the reasons stay inspectable.
  assert.equal(failed.template, `payment failed order_id=${WILDCARD} reason=${WILDCARD}`)
  assert.equal(failed.severity, 'error')
  assert.deepEqual(
    failed.slots
      .find((slot) => slot.label === 'reason')
      ?.top.map((value) => value.value)
      .sort(),
    ['circuit_open', 'upstream_timeout'],
  )
})

test('the same words at another severity are another pattern', () => {
  const patterns = minePatterns(records([['POST /api/checkout 200 in 40ms'], ['POST /api/checkout 502 in 1800ms', 'error']]))
  assert.equal(patterns.length, 2)
  assert.deepEqual(patterns.map((pattern) => pattern.severity).sort(), ['error', 'info'])
})
