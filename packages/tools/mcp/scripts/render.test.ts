import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { installedPackage, typeText } from '../src/installed.ts'
import { renderComponent, type ComponentRenderOptions } from '../src/render.ts'
import type { ComponentEntry } from '../src/registry-types.ts'

const badge: ComponentEntry = {
  id: 'badge',
  package: '@c2n/badge',
  title: 'Badge',
  description: 'A count or label.',
  category: 'Data display',
  status: 'stable',
  docsUrl: '',
  elements: [
    {
      tag: 'c2-badge',
      className: 'Badge',
      modulePath: '@c2n/badge',
      description: '',
      attributes: [{ name: 'kind', type: "'count' | 'label' | 'none'", default: "'count'" }],
      slots: [],
      events: [{ name: 'badge-change', type: 'CustomEvent<{ value: number }>' }],
      cssParts: [],
      cssProperties: [],
    },
  ],
  composition: { internal: [], slotted: [], usedBy: [] },
  install: { npm: 'npm i @c2n/badge', import: '', importClass: '' },
  examples: [],
  hasGallery: false,
}

const include: ComponentRenderOptions['include'] = new Set(['attributes', 'events'])

test('typeText reads a manifest type object and passes the registry text through', () => {
  assert.equal(typeText({ text: "'a' | 'b'" }), "'a' | 'b'")
  assert.equal(typeText('boolean'), 'boolean')
  assert.equal(typeText(undefined), undefined)
  assert.equal(typeText({}), undefined)
})

test('get_component markdown prints the type text of attributes and events from the registry', () => {
  const out = renderComponent(badge, { include, installed: null })
  assert.match(out, /\| `kind` \| `'count' \\\| 'label' \\\| 'none'` \|/)
  assert.match(out, /\| `badge-change` \| `CustomEvent<\{ value: number \}>` \|/)
})

test('get_component markdown prints the type text from an installed manifest, never [object Object]', () => {
  // An installed package's manifest is the analyzer's raw output: `type` is `{ text }` there.
  const root = mkdtempSync(join(tmpdir(), 'c2n-render-'))
  const previous = process.env.C2N_PROJECT_ROOT
  try {
    writeFileSync(join(root, 'package.json'), JSON.stringify({ dependencies: { '@c2n/badge': '*' } }))
    const dir = join(root, 'node_modules', '@c2n/badge')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: '@c2n/badge', version: '9.9.9', customElements: 'custom-elements.json' }))
    const declaration = {
      kind: 'class',
      name: 'Badge',
      tagName: 'c2-badge',
      attributes: [{ name: 'kind', type: { text: "'count' | 'label' | 'none'" }, default: "'count'", fieldName: 'kind' }],
      events: [{ name: 'badge-change', type: { text: 'CustomEvent<{ value: number }>' } }, { name: 'plain' }],
    }
    writeFileSync(join(dir, 'custom-elements.json'), JSON.stringify({ modules: [{ path: 'src/badge.js', declarations: [declaration] }] }))
    process.env.C2N_PROJECT_ROOT = root
    const installed = installedPackage('@c2n/badge')
    assert.ok(installed?.elements?.has('c2-badge'))
    const out = renderComponent(badge, { include, installed })
    assert.doesNotMatch(out, /object Object/)
    assert.match(out, /\| `kind` \| `'count' \\\| 'label' \\\| 'none'` \|/)
    assert.match(out, /\| `badge-change` \| `CustomEvent<\{ value: number \}>` \|/)
    assert.match(out, /\| `plain` \| — \|/)
  } finally {
    if (previous === undefined) delete process.env.C2N_PROJECT_ROOT
    else process.env.C2N_PROJECT_ROOT = previous
    rmSync(root, { recursive: true, force: true })
  }
})

test('get_component on a secondary element leads with its own API, not the package description', () => {
  const table: ComponentEntry = {
    ...badge,
    id: 'table',
    package: '@c2n/table',
    title: 'Table',
    description: `A data table. ${'Long description of the table. '.repeat(500)}`,
    elements: [
      { ...badge.elements[0], tag: 'c2-table', className: 'Table', description: 'The table.', attributes: [{ name: 'rows', type: 'TableRow[]' }] },
      { ...badge.elements[0], tag: 'c2-table-column', className: 'TableColumn', description: 'One column.', attributes: [{ name: 'pinned', type: 'boolean' }] },
    ],
  }
  const concrete = { tag: 'c2-table-column', modulePath: '@c2n/table', className: 'TableColumn' }
  const out = renderComponent(table, { include, installed: null, concrete })
  assert.ok(out.length < 3000, `the package description is shortened (${out.length} characters)`)
  assert.match(out, /^# Table \(c2-table-column\)\nOne column\.\n\nPart of `@c2n\/table`: A data table\.$/m)
  assert.ok(out.indexOf('`pinned`') < out.indexOf('`rows`'), 'the requested element is listed first')
  // The main element still prints the whole description.
  assert.ok(renderComponent(table, { include, installed: null }).includes('Long description of the table. Long description'))
})

test('get_component on a secondary element drops the main element composition and keeps an abbreviation in the summary', () => {
  const table: ComponentEntry = {
    ...badge,
    id: 'chart',
    package: '@c2n/chart',
    title: 'Chart',
    description: 'Charts (e.g. line, bar) drawn on a canvas. Second sentence.',
    composition: { internal: ['c2-overlay'], slotted: ['c2-chart-series'], usedBy: [] },
    elements: [
      { ...badge.elements[0], tag: 'c2-line-chart', className: 'LineChart', description: 'A line chart.' },
      { ...badge.elements[0], tag: 'c2-chart-series', className: 'ChartSeries', description: 'One series.' },
    ],
  }
  const out = renderComponent(table, {
    include: new Set(['attributes', 'composition']),
    installed: null,
    concrete: { tag: 'c2-chart-series', modulePath: '@c2n/chart', className: 'ChartSeries' },
  })
  assert.match(out, /Part of `@c2n\/chart`: Charts \(e\.g\. line, bar\) drawn on a canvas\.$/m)
  assert.doesNotMatch(out.split('\n- Package')[0], /c2-line-chart/)
  assert.doesNotMatch(out, /Expects slotted|Renders internally/)
})
