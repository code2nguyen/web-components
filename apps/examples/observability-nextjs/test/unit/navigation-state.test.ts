import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildDetailHref,
  buildNavigationHref,
  buildScopedHref,
  changeFilters,
  changePageSize,
  parseNavigationState,
  parseReturnContext,
  serializeNavigationState,
} from '../../lib/query/navigation-state.ts'

test('parses the documented trace defaults', () => {
  assert.deepEqual(parseNavigationState('traces', ''), {
    environmentId: 'production',
    range: { kind: 'relative', value: '2h' },
    filters: { q: '', service: [], operation: '', status: [], duration: [] },
    sortField: 'start',
    sortDirection: 'desc',
    page: 1,
    pageSize: 25,
  })
})

test('serializes canonical values in stable order and omits defaults', () => {
  const state = parseNavigationState('traces', 'pageSize=50&status=error&operation=POST%20%2Fcheckout&env=staging&q=%20checkout%20&page=2')
  assert.equal(serializeNavigationState('traces', state), 'env=staging&q=checkout&operation=POST+%2Fcheckout&status=error&page=2&pageSize=50')
  assert.equal(serializeNavigationState('traces', parseNavigationState('traces', '')), '')
})

test('recovers malformed fields independently and bounds authored input', () => {
  const state = parseNavigationState(
    'logs',
    `env=staging&range=seven&page=-2&pageSize=37&severity=warn,bogus,error&sort=nope&dir=sideways&q=${'x'.repeat(500)}&trace=${'y'.repeat(200)}`,
  )
  assert.equal(state.environmentId, 'staging')
  assert.deepEqual(state.range, { kind: 'relative', value: '2h' })
  assert.equal(state.page, 1)
  assert.equal(state.pageSize, 25)
  assert.deepEqual(state.filters.severity, ['warn', 'error'])
  assert.equal(state.sortField, 'timestamp')
  assert.equal(state.sortDirection, 'desc')
  assert.equal(state.filters.q.length, 120)
  assert.equal(state.filters.trace, '')
})

test('accepts only complete ordered absolute ranges and preserves valid neighbors', () => {
  const valid = parseNavigationState('services', 'from=2026-01-01T00%3A00%3A00.000Z&to=2026-01-01T01%3A00%3A00.000Z&status=degraded')
  assert.deepEqual(valid.range, { kind: 'absolute', from: '2026-01-01T00:00:00.000Z', to: '2026-01-01T01:00:00.000Z' })
  assert.deepEqual(valid.filters.status, ['degraded'])

  const partial = parseNavigationState('services', 'from=2026-01-01T00%3A00%3A00.000Z&status=degraded')
  assert.deepEqual(partial.range, { kind: 'relative', value: '2h' })
  assert.deepEqual(partial.filters.status, ['degraded'])
})

test('URL values take precedence over supplied preferences', () => {
  const state = parseNavigationState('traces', 'env=production&page=3', {
    preferences: { environmentId: 'staging', page: 9, pageSize: 100 },
  })
  assert.equal(state.environmentId, 'production')
  assert.equal(state.page, 3)
  assert.equal(state.pageSize, 25)
})

test('supports only the contract page sizes and resets page on filter changes', () => {
  for (const pageSize of [25, 50, 100] as const) {
    assert.equal(parseNavigationState('logs', `pageSize=${pageSize}`).pageSize, pageSize)
  }
  assert.equal(parseNavigationState('logs', 'pageSize=10').pageSize, 25)

  const current = parseNavigationState('logs', 'page=7&pageSize=50&q=old')
  assert.equal(changeFilters('logs', current, { q: 'timeout' }).page, 1)
  assert.deepEqual(changePageSize(current, 100), { ...current, page: 4, pageSize: 100 })
})

test('builds canonical hrefs and validates explicit detail return context', () => {
  const state = parseNavigationState('traces', 'env=staging&status=error&page=2&pageSize=50')
  assert.equal(buildNavigationHref('/traces/', 'traces', state), '/traces/?env=staging&status=error&page=2&pageSize=50')

  const detail = buildDetailHref('/traces/trace-007/', '/traces/', 'traces', state)
  assert.equal(detail, '/traces/trace-007/?return=%2Ftraces%2F%3Fenv%3Dstaging%26status%3Derror%26page%3D2%26pageSize%3D50')
  assert.equal(
    parseReturnContext(new URL(detail, 'https://example.test').searchParams, ['/traces/', '/logs/']),
    '/traces/?env=staging&status=error&page=2&pageSize=50',
  )
  assert.equal(parseReturnContext('return=https%3A%2F%2Fevil.example', ['/traces/']), null)
})

test('builds primary navigation destinations with exact relative or absolute scope', () => {
  assert.equal(buildScopedHref('/logs/', { environmentId: 'staging', range: { kind: 'relative', value: '30m' } }), '/logs/?env=staging&range=30m')
  assert.equal(
    buildScopedHref('/dashboards/?panel=errors', {
      environmentId: 'production',
      range: { kind: 'absolute', from: '2026-08-17T12:00:00.000Z', to: '2026-08-17T13:00:00.000Z' },
    }),
    '/dashboards/?panel=errors&from=2026-08-17T12%3A00%3A00.000Z&to=2026-08-17T13%3A00%3A00.000Z',
  )
})
