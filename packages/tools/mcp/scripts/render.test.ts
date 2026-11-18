import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { installedPackage, typeText } from '../src/installed.ts'
import { COMPONENT_MAX_CHARS, COMPONENT_SECTIONS, renderComponent, renderComponentFitted, type ComponentRenderOptions } from '../src/render.ts'
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
    description: 'Charts (e.g. Line, bar) drawn on a canvas. Second sentence.',
    composition: { internal: ['c2-overlay'], slotted: ['c2-chart-series'], usedBy: [] },
    presets: { items: [{ name: 'Dense', css: { '--c2-line-chart--gap': '2px' } }] },
    elements: [
      { ...badge.elements[0], tag: 'c2-line-chart', className: 'LineChart', description: 'A line chart.' },
      { ...badge.elements[0], tag: 'c2-chart-series', className: 'ChartSeries', description: 'One series.' },
    ],
  }
  const out = renderComponent(table, {
    include: new Set(['attributes', 'composition', 'presets']),
    installed: null,
    concrete: { tag: 'c2-chart-series', modulePath: '@c2n/chart', className: 'ChartSeries' },
  })
  assert.match(out, /Part of `@c2n\/chart`: Charts \(e\.g\. Line, bar\) drawn on a canvas\.$/m)
  assert.doesNotMatch(out.split('\n- Package')[0], /c2-line-chart/)
  assert.doesNotMatch(out, /Expects slotted|Renders internally|## Presets/)
})

test('get_component on a secondary element of a package with no description prints no empty summary', () => {
  const out = renderComponent(
    { ...badge, description: '', elements: [badge.elements[0], { ...badge.elements[0], tag: 'c2-badge-dot', className: 'BadgeDot' }] },
    { include, installed: null, concrete: { tag: 'c2-badge-dot', modulePath: '@c2n/badge', className: 'BadgeDot' } },
  )
  assert.match(out, /^Part of `@c2n\/badge`\.$/m)
})

test('the summary of a secondary element ends at an etc. that ends a sentence', () => {
  const out = renderComponent(
    {
      ...badge,
      description: 'Shows rows, columns, filters, etc. Sorting is built in.',
      elements: [badge.elements[0], { ...badge.elements[0], tag: 'c2-badge-dot', className: 'BadgeDot' }],
    },
    { include, installed: null, concrete: { tag: 'c2-badge-dot', modulePath: '@c2n/badge', className: 'BadgeDot' } },
  )
  assert.match(out, /^Part of `@c2n\/badge`: Shows rows, columns, filters, etc\.$/m)
})

test('the summary of a secondary element is capped when the description has no sentence break', () => {
  const out = renderComponent(
    {
      ...badge,
      description: `Data grid ${'with sorting and grouping '.repeat(40)}. supports more`,
      elements: [badge.elements[0], { ...badge.elements[0], tag: 'c2-badge-dot', className: 'BadgeDot' }],
    },
    { include, installed: null, concrete: { tag: 'c2-badge-dot', modulePath: '@c2n/badge', className: 'BadgeDot' } },
  )
  const summary = out.split('\n').find((line) => line.startsWith('Part of'))!
  assert.ok(summary.length < 240, `${summary.length} characters`)
  assert.ok(summary.endsWith('…'))
})

/** A component whose full API is far past one response: long descriptions, many CSS variables, a second element. */
function large(): ComponentEntry {
  const long = 'Explains the behaviour in a first sentence. '.repeat(1) + 'Then a long tail of usage notes that an agent can do without. '.repeat(8)
  const element = (tag: string) => ({
    tag,
    className: 'Big',
    modulePath: '@c2n/big',
    description: `${long}\n\nA second paragraph of notes.`,
    attributes: Array.from({ length: 100 }, (_, i) => ({ name: `attr-${i}`, type: 'string', description: long })),
    slots: [],
    events: [],
    cssParts: Array.from({ length: 20 }, (_, i) => ({ name: `part-${i}`, description: long })),
    cssProperties: Array.from({ length: 80 }, (_, i) => ({
      name: `--c2-big__part-${i % 8}--color-${i}`,
      type: 'color',
      part: `part-${i % 8}`,
      property: 'color',
      description: long,
    })),
  })
  return { ...badge, id: 'big', title: 'Big', elements: [element('c2-big'), element('c2-big-item')] }
}

test('a long answer is shortened to fit one response and says how to ask for the rest', () => {
  const big = large()
  assert.ok(renderComponent(big, { include: new Set(COMPONENT_SECTIONS), installed: null }).length > COMPONENT_MAX_CHARS)
  const text = renderComponentFitted(big, { include: new Set(COMPONENT_SECTIONS), installed: null })
  assert.ok(text.length <= COMPONENT_MAX_CHARS, `${text.length} characters`)
  assert.match(text, /_Shortened to fit one response: .*include: \["css"\]/)
  // The attributes, the most used part, are all still there.
  for (let i = 0; i < 100; i++) assert.ok(text.includes(`\`attr-${i}\``), `attr-${i}`)
  // The other element of the package is named with the call that returns it.
  assert.match(text, /## c2-big-item\n\n.*`get_component` with `tag: "c2-big-item"`/)
})

test('a short answer is not touched, and a section asked for by name is never summarized', () => {
  const short = renderComponentFitted(badge, { include: new Set(COMPONENT_SECTIONS), installed: null })
  assert.equal(short, renderComponent(badge, { include: new Set(COMPONENT_SECTIONS), installed: null }))
  const css = renderComponentFitted(large(), { include: new Set(['css']), requested: new Set(['css']), installed: null })
  assert.ok(css.includes('--c2-big__part-0--color-0'), 'the variables are listed, not counted')
})

test('sections asked for by name are never summarized, and an element left out says how to get its sections', () => {
  const big = large()
  const include = new Set(['attributes'] as const)
  const text = renderComponentFitted(big, { include, requested: include, installed: null })
  assert.ok(text.length <= COMPONENT_MAX_CHARS, `${text.length} characters`)
  // The element asked for keeps every attribute row; the other is either there in full or named with its call.
  for (let i = 0; i < 100; i++) assert.ok(text.includes(`\`attr-${i}\``), `attr-${i}`)
  assert.match(text, /## c2-big-item[\s\S]*(`attr-0`|`get_component` with `tag: "c2-big-item"`)/)
})

test('an answer still too long after every step starts with the note, which a cut at the limit keeps', () => {
  const big = large()
  const huge = { ...big, elements: Array.from({ length: 6 }, (_, i) => ({ ...big.elements[0], tag: `c2-big-${i}` })) }
  const text = renderComponentFitted(huge, { include: new Set(['attributes'] as const), requested: new Set(['attributes'] as const), installed: null })
  if (text.length > COMPONENT_MAX_CHARS) assert.match(text, /^_Shortened to fit one response/)
})

test('a narrowed answer still too long focuses on the element asked for, and asking by tag returns that element', () => {
  const big = large()
  const huge = { ...big, elements: Array.from({ length: 6 }, (_, i) => ({ ...big.elements[0], tag: `c2-big-${i}` })) }
  const include = new Set(['attributes'] as const)
  const first = renderComponentFitted(huge, { include, requested: include, installed: null })
  assert.ok(first.length <= COMPONENT_MAX_CHARS, `${first.length} characters`)
  assert.match(first, /one element at a time/)
  // Following the advice: the element asked for comes first, in full, and fits.
  const third = renderComponentFitted(huge, { include, requested: include, installed: null, concrete: huge.elements[3] })
  assert.ok(third.length <= COMPONENT_MAX_CHARS, `${third.length} characters`)
  assert.match(third, /c2-big-3[\s\S]*`attr-99`/)
})
