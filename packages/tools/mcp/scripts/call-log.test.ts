import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { callLogEntry, logCall } from '../src/call-log.ts'
import { installedPackage } from '../src/installed.ts'
import type { Registry } from '../src/registry-types.ts'

// The built registry is a build artifact (absent before `build:registry`, as in CI's unit step): skip without it.
const built = new URL('../data/registry.json', import.meta.url)
const needsRegistry = { skip: !existsSync(built) && 'data/registry.json not built' }
const registry = (existsSync(built) ? JSON.parse(readFileSync(built, 'utf8')) : {}) as Registry

test('a search entry records what the agent saw, a tag entry the component it resolved to', needsRegistry, () => {
  const search = callLogEntry(registry, 'search_components', { query: 'star rating' }, 't')
  assert.equal(search.results?.[0], 'rate')
  assert.equal(search.time, 't')
  assert.equal(callLogEntry(registry, 'get_component', { tag: 'c2-table-column' }).component, 'table')
  const validate = callLogEntry(registry, 'validate_markup', { code: '<c2-rate foo="1"></c2-rate>', filename: 'index.html' })
  assert.equal(validate.component, undefined)
  // The code is logged by length only, with what the validator reported.
  assert.equal(validate.args.code, '27 characters')
  assert.deepEqual(validate.findings, ['error unknown-attribute'])
  assert.equal(callLogEntry(registry, 'generate_variant', { tag: 'c2-button', css: { '--a': 'red', '--b': '0' } }).args.css, '2 entries')
  assert.equal(validate.pid, process.pid)
  assert.equal(callLogEntry(registry, 'report_issue', { component: 'c2-table-column' }).component, 'table')
  assert.equal(callLogEntry(registry, 'get_presets', { tag: 'c2-button', name: 'pill' }).args.name, 'pill')
  assert.equal(callLogEntry(registry, 'generate_variant', { tag: 'c2-button', name: 'acme-danger-button' }).args.name, '18 characters')
  assert.equal(callLogEntry(registry, 'validate_markup', { code: '', filename: '/Users/someone/project/src/App.tsx' }).args.filename, '*.tsx')
  assert.equal(callLogEntry(registry, 'validate_markup', { code: '', filename: 'C:\\Users\\someone\\App.tsx' }).args.filename, '*.tsx')
})

test('calls append one JSON line each while the file exists, and a failure never throws', needsRegistry, () => {
  const file = join(mkdtempSync(join(tmpdir(), 'c2n-log-')), 'calls.jsonl')
  // Not armed: nothing is written, nothing is created.
  logCall(file, () => registry, 'list_components', {})
  assert.equal(existsSync(file), false)
  writeFileSync(file, '')
  logCall(file, () => registry, 'list_components', {})
  logCall(file, () => registry, 'get_component', { tag: 'c2-rate' })
  logCall(file, () => registry, 'report_issue', { summary: 'x'.repeat(300) })
  const lines = readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as { tool: string })
  assert.deepEqual(
    lines.map((l) => l.tool),
    ['list_components', 'get_component', 'report_issue'],
  )
  assert.match(readFileSync(file, 'utf8'), /"summary":"300 characters"/)
  // Short issue text is not kept either.
  assert.equal(callLogEntry(registry, 'report_issue', { title: 'Acme grid', tag: 'c2-table' }).args.title, '9 characters')
  // A registry that cannot be built is a logging failure, not a failed call.
  assert.doesNotThrow(() =>
    logCall(
      file,
      () => {
        throw new Error('bad manifest')
      },
      'list_components',
      {},
    ),
  )
})

test('search_examples and list_components with a keyword record the components they answered with', needsRegistry, () => {
  assert.ok(callLogEntry(registry, 'list_components', { keyword: 'rating' }).results?.includes('rate'))
  assert.ok((callLogEntry(registry, 'search_examples', { query: 'star rating' }).results ?? []).length > 0)
  assert.equal(callLogEntry(registry, 'list_components', {}).results, undefined)
})

test("list_components' installedOnly filter is applied to the logged results too", needsRegistry, () => {
  const all = callLogEntry(registry, 'list_components', { keyword: 'chart' }).results ?? []
  const installed = callLogEntry(registry, 'list_components', { keyword: 'chart', installedOnly: true }).results ?? []
  assert.deepEqual(
    installed,
    all.filter((id) => installedPackage(registry.components[id].package)),
  )
})

test('search_examples with a tag it does not know logs no search', needsRegistry, () => {
  assert.deepEqual(callLogEntry(registry, 'search_examples', { query: 'compact', tag: 'c2-tabel' }).results, undefined)
})

test('list_components with an empty keyword is a listing, not a search', needsRegistry, () => {
  assert.equal(callLogEntry(registry, 'list_components', { keyword: '' }).results, undefined)
})

test('creating a server with the log on adds no process listeners (the CLI owns shutdown)', needsRegistry, async () => {
  const { createServer } = await import('../src/server.ts')
  const before = ['SIGTERM', 'SIGINT', 'exit'].map((e) => process.listenerCount(e))
  process.env.C2N_MCP_LOG = join(mkdtempSync(join(tmpdir(), 'c2n-log-')), 'calls.jsonl')
  try {
    createServer(registry)
    createServer(registry)
  } finally {
    delete process.env.C2N_MCP_LOG
  }
  assert.deepEqual(
    ['SIGTERM', 'SIGINT', 'exit'].map((e) => process.listenerCount(e)),
    before,
  )
})
