import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { test } from 'node:test'
import { analyse, callsSince } from './readiness.mjs'

// The registry is git-ignored (`pnpm --dir packages/tools/mcp run build:registry`): the tests that read it skip without it.
const registry = { skip: !existsSync(new URL('../../packages/tools/mcp/data/registry.json', import.meta.url)) && 'no MCP registry built' }

const call = (tool, extra = {}) => ({ time: '2026-11-19T10:00:00Z', pid: 1, tool, args: {}, ...extra })

test('only get_component counts as looking a component up, and the best-ranked search is credited', registry, () => {
  const rows = new Map([['R1', { outcome: 'met', components: ['c2-table'] }]])
  const calls = [
    call('search_components', { args: { query: 'grid' }, results: ['list', 'virtual-list', 'table'] }),
    call('search_components', { args: { query: 'sortable data table' }, results: ['table'] }),
    call('get_examples', { args: { tag: 'c2-table' }, component: 'table' }),
  ]
  const [table] = analyse({ rows, calls, files: [] }).found
  assert.deepEqual(table.search, { query: '"sortable data table"', rank: 1, index: 2 })
  assert.equal(table.lookedUp, false)
  const looked = analyse({ rows, calls: [...calls, call('get_component', { args: { tag: 'c2-table' }, component: 'table' })], files: [] })
  assert.equal(looked.found[0].lookedUp, true)
})

test('calls made before the build started are left out', () => {
  const log = [call('list_components', { time: '2026-11-19T09:00:00Z' }), call('list_components')].map((c) => JSON.stringify(c)).join('\n')
  assert.equal(callsSince(log, Date.parse('2026-11-19T09:30:00Z')).length, 1)
  assert.equal(callsSince(log).length, 2)
})

test('--since compares times, not strings: milliseconds and offsets count', async () => {
  const { parseSince } = await import('./readiness.mjs')
  const log = [call('a', { time: '2026-11-19T10:00:00.400Z' }), call('b', { time: '2026-11-19T09:59:59.900Z' })].map((c) => JSON.stringify(c)).join('\n')
  assert.deepEqual(
    callsSince(log, parseSince('2026-11-19T10:00:00Z')).map((c) => c.tool),
    ['a'],
  )
  assert.deepEqual(
    callsSince(log, parseSince('2026-11-19T11:00:00+01:00')).map((c) => c.tool),
    ['a'],
  )
  assert.throws(() => parseSince('yesterday'))
})

test('damaged section markers stop the run instead of adding a second section', async () => {
  const { withSection, START, END } = await import('./readiness.mjs')
  const fresh = withSection('# R\n\n## Friction outside the requirements\n', `${START}\nx\n${END}`)
  assert.equal(withSection(fresh, `${START}\ny\n${END}`), fresh.replace('\nx\n', '\ny\n'))
  assert.throws(() => withSection(`# R\n${START}\nx\n`, `${START}\ny\n${END}`))
  assert.throws(() => withSection(`${fresh}\n${END}\n`, `${START}\ny\n${END}`))
})

test('calls are put back in the order they started', () => {
  const log = [call('slow', { time: '2026-11-19T10:00:00.100Z' }), call('fast', { time: '2026-11-19T10:00:00.050Z' })].map((c) => JSON.stringify(c)).join('\n')
  assert.deepEqual(
    callsSince(log).map((c) => c.tool),
    ['fast', 'slow'],
  )
})

test('a torn line in the log is skipped, not fatal', () => {
  const log = `${JSON.stringify(call('a'))}\n{"time":"2026-11-19T10:0`
  assert.deepEqual(
    callsSince(log).map((c) => c.tool),
    ['a'],
  )
})

test('a hand-rolled or failed row does not count its component as used', registry, () => {
  const rows = new Map([
    ['R1', { outcome: 'hand-rolled', components: ['c2-table'] }],
    ['R2', { outcome: 'met', components: ['c2-rate'] }],
  ])
  assert.deepEqual(
    analyse({ rows, calls: [], files: [] }).found.map((f) => f.id),
    ['rate'],
  )
})

test("an icon's own tag resolves to its icon set", registry, () => {
  const rows = new Map([['R1', { outcome: 'met', components: ['c2-feather-search'] }]])
  assert.deepEqual(
    analyse({ rows, calls: [], files: [] }).found.map((f) => f.id),
    ['feather-icons'],
  )
})

test("a child element counts as looked up through its parent's get_component", registry, () => {
  const rows = new Map([['R1', { outcome: 'met', components: ['c2-select', 'c2-list-item'] }]])
  const calls = [call('get_component', { args: { tag: 'c2-select' }, component: 'select' })]
  const found = Object.fromEntries(analyse({ rows, calls, files: [] }).found.map((f) => [f.id, f.lookedUp]))
  assert.deepEqual(found, { 'list-item': true, select: true })
})

test('an entry with no time is skipped, not sorted at random', () => {
  const log = [JSON.stringify({ pid: 1, tool: 'x', args: {} }), JSON.stringify(call('a'))].join('\n')
  assert.deepEqual(
    callsSince(log).map((c) => c.tool),
    ['a'],
  )
})

test('only a slotted child is credited to its parent: a component the parent draws itself is not', registry, () => {
  const rows = new Map([['R1', { outcome: 'met', components: ['c2-select', 'c2-pagination'] }]])
  const calls = [call('get_component', { args: { tag: 'c2-pagination' }, component: 'pagination' })]
  const found = Object.fromEntries(analyse({ rows, calls, files: [] }).found.map((f) => [f.id, f.lookedUp]))
  assert.deepEqual(found, { pagination: true, select: false })
})

test('a skipped line is reported by its line number in the file', (t) => {
  const warn = t.mock.method(console, 'warn', () => {})
  callsSince(['{"torn', '', JSON.stringify({ pid: 1, tool: 'x' }), JSON.stringify(call('a'))].join('\n'))
  assert.deepEqual(
    warn.mock.calls.map((c) => c.arguments[0]),
    ['call log line 1 is not JSON; skipped', 'call log line 3 has no time; skipped'],
  )
})

test('a parent the build does not use credits nothing', registry, () => {
  const rows = new Map([['R1', { outcome: 'met', components: ['c2-list-item'] }]])
  const calls = [call('get_component', { args: { tag: 'c2-select' }, component: 'select' })]
  assert.equal(analyse({ rows, calls, files: [] }).found[0].lookedUp, false)
})

test('a search_examples hit counts as a search that found the component', registry, () => {
  const rows = new Map([['R1', { outcome: 'met', components: ['c2-rate'] }]])
  const calls = [call('search_examples', { args: { query: 'stars' }, results: ['rate'] })]
  assert.deepEqual(analyse({ rows, calls, files: [] }).found[0].search, { query: 'search_examples "stars"', rank: 1, index: 1 })
})

test('a list_components hit never counts as the search that found a component', registry, () => {
  const rows = new Map([['R1', { outcome: 'met', components: ['c2-rate'] }]])
  const calls = [
    call('list_components', { args: { keyword: 'r' }, results: ['rate'] }),
    call('search_components', { args: { query: 'stars' }, results: ['x', 'rate'] }),
  ]
  assert.deepEqual(analyse({ rows, calls, files: [] }).found[0].search, { query: '"stars"', rank: 2, index: 2 })
  // A listing alone never counts as the search that found it.
  assert.equal(analyse({ rows, calls: calls.slice(0, 1), files: [] }).found[0].search, null)
})

test('a call that already named the component is a lookup, not a search', registry, () => {
  const rows = new Map([['R1', { outcome: 'met', components: ['c2-rate'] }]])
  const calls = [
    call('search_examples', { args: { query: 'compact', tag: 'c2-rate' }, results: ['rate'] }),
    call('list_components', { args: { keyword: 'c2-rate' }, results: ['rate'] }),
  ]
  assert.equal(analyse({ rows, calls, files: [] }).found[0].search, null)
})

test('calls after the build ended are left out', () => {
  const log = [call('a', { time: '2026-11-19T10:00:00Z' }), call('b', { time: '2026-11-19T11:00:00Z' })].map((c) => JSON.stringify(c)).join('\n')
  assert.deepEqual(
    callsSince(log, undefined, Date.parse('2026-11-19T10:30:00Z')).map((c) => c.tool),
    ['a'],
  )
})

test('a package name stands for the components of it the build uses', registry, () => {
  const rows = new Map([['R1', { outcome: 'met', components: ['@c2n/chart'] }]])
  const files = [{ name: 'index.html', source: '<c2-bar-chart aria-label="Sales"></c2-bar-chart>' }]
  assert.deepEqual(
    analyse({ rows, calls: [], files }).found.map((f) => [f.id, f.requirements]),
    [['bar-chart', ['R1']]],
  )
})

test('a bare word that equals a component id is still a search; a tag is a lookup', registry, () => {
  const rows = new Map([['R1', { outcome: 'met', components: ['c2-rate'] }]])
  const asWord = [call('search_components', { args: { query: 'rate' }, results: ['rate'] })]
  assert.equal(analyse({ rows, calls: asWord, files: [] }).found[0].search.query, '"rate"')
  const asTag = [call('list_components', { args: { keyword: 'c2-rate' }, results: ['rate'] })]
  assert.equal(analyse({ rows, calls: asTag, files: [] }).found[0].search, null)
})

test('a list_components keyword is matched without case, as the tool matches it', registry, () => {
  const rows = new Map([['R1', { outcome: 'met', components: ['c2-rate'] }]])
  assert.equal(analyse({ rows, calls: [call('list_components', { args: { keyword: 'C2-Rate' }, results: ['rate'] })], files: [] }).found[0].search, null)
})

test('a build folder whose name starts with two dots is still under lab/apps/', async () => {
  const { outsideApps } = await import('./readiness.mjs')
  assert.equal(outsideApps('..draft/x'), false)
  assert.equal(outsideApps('../packages'), true)
  assert.equal(outsideApps(''), true)
})

test('a bad --until is reported as --until', async () => {
  const { parseSince } = await import('./readiness.mjs')
  assert.throws(() => parseSince('yesterday', '--until'), /^Error: --until yesterday/)
})

test('a search whose query is the component’s own name is a lookup', registry, () => {
  const rows = new Map([['R1', { outcome: 'met', components: ['c2-rate'] }]])
  const calls = [call('search_components', { args: { query: 'c2-rate' }, results: ['rate'] })]
  assert.equal(analyse({ rows, calls, files: [] }).found[0].search, null)
})

test('a package name in a list_components keyword is a search (that tool does not match packages)', registry, () => {
  const rows = new Map([['R1', { outcome: 'met', components: ['c2-rate'] }]])
  const calls = [call('list_components', { args: { keyword: '@c2n/rate' }, results: [] })]
  assert.deepEqual(
    analyse({ rows, calls, files: [] }).missedSearches.map((s) => s.query),
    ['list_components "@c2n/rate"'],
  )
})
