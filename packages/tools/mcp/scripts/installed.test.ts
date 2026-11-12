import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { withInstalledApi, withInstalledComponents } from '../src/installed.ts'
import { resolveElement } from '../src/registry.ts'
import type { ComponentEntry, Registry } from '../src/registry-types.ts'

function component(id: string, tags: string[], pkg = `@c2n/${id}`): ComponentEntry {
  return {
    id,
    package: pkg,
    title: id,
    description: '',
    category: 'Test',
    status: 'stable',
    docsUrl: '',
    elements: tags.map((tag) => ({
      tag,
      className: '',
      modulePath: pkg,
      description: '',
      attributes: [],
      slots: [],
      events: [],
      cssParts: [],
      cssProperties: [],
    })),
    composition: { internal: [], slotted: [], usedBy: [] },
    install: { npm: '', import: '', importClass: '', umbrella: `@c2n/components/${pkg.slice('@c2n/'.length)}` },
    examples: [],
    hasGallery: false,
  }
}
// Two pages document `@c2n/chart`, whose elements belong to two families; `line-chart` represents the package.
const components = [
  component('line-chart', ['c2-line-chart', 'c2-chart-series'], '@c2n/chart'),
  component('bar-chart', ['c2-bar-chart'], '@c2n/chart'),
  component('button', ['c2-button']),
]
const registry: Registry = {
  schemaVersion: 1,
  c2nVersion: '0.0.0',
  categories: ['Test'],
  components: Object.fromEntries(components.map((c) => [c.id, c])),
  tagIndex: { 'c2-line-chart': 'line-chart', 'c2-chart-series': 'line-chart', 'c2-bar-chart': 'bar-chart', 'c2-button': 'button' },
  packageIndex: { '@c2n/chart': 'line-chart', '@c2n/button': 'button' },
  theme: { package: '@c2n/theme', install: { npm: '', imports: [] }, tokens: [], mapping: {}, darkMode: '' },
  guides: { workflow: '', theming: '', 'variant-components': '', frameworks: '' },
}

function project(
  dependencies: Record<string, string>,
  packages: Record<string, { exports?: Record<string, string>; modules: { path: string; tags: string[] }[] }>,
) {
  const root = mkdtempSync(join(tmpdir(), 'c2n-installed-'))
  writeFileSync(join(root, 'package.json'), JSON.stringify({ dependencies }))
  for (const [name, { exports, modules }] of Object.entries(packages)) {
    const dir = join(root, 'node_modules', name)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, version: '9.9.9', customElements: 'custom-elements.json', exports }))
    const manifest = { modules: modules.map(({ path, tags }) => ({ path, declarations: tags.map((tagName) => ({ tagName, name: tagName, kind: 'class' })) })) }
    writeFileSync(join(dir, 'custom-elements.json'), JSON.stringify(manifest))
  }
  return root
}

function withProject<T>(root: string, run: () => T): T {
  const previous = process.env.C2N_PROJECT_ROOT
  process.env.C2N_PROJECT_ROOT = root
  try {
    return run()
  } finally {
    if (previous === undefined) delete process.env.C2N_PROJECT_ROOT
    else process.env.C2N_PROJECT_ROOT = previous
    rmSync(root, { recursive: true, force: true })
  }
}

test('a tag the installed package adds belongs to it whatever its prefix, and to the page representing it', () => {
  const root = project(
    { '@c2n/chart': '*' },
    { '@c2n/chart': { modules: [{ path: 'src/chart.ts', tags: ['c2-line-chart', 'c2-chart-series', 'c2-bar-chart', 'c2-chart-legend'] }] } },
  )
  const result = withProject(root, () => withInstalledApi(registry))
  assert.equal(result.tagIndex['c2-chart-legend'], 'line-chart')
  assert.deepEqual(
    result.components['line-chart'].elements.map((e) => e.tag),
    ['c2-line-chart', 'c2-chart-series', 'c2-chart-legend'],
  )
  assert.deepEqual(
    result.components['bar-chart'].elements.map((e) => e.tag),
    ['c2-bar-chart'],
  )
})

test('through the umbrella, a package owns only the tags of its own modules in the merged manifest', () => {
  const root = project(
    { '@c2n/components': '*' },
    {
      '@c2n/components': {
        exports: { './chart': './dist/chart.js', './button': './dist/button.js' },
        modules: [
          { path: 'chart/src/chart.ts', tags: ['c2-line-chart', 'c2-chart-series', 'c2-bar-chart', 'c2-chart-legend'] },
          { path: 'button/src/button.ts', tags: ['c2-button', 'c2-button-group'] },
        ],
      },
    },
  )
  const result = withProject(root, () => withInstalledApi(registry))
  assert.equal(result.tagIndex['c2-chart-legend'], 'line-chart')
  assert.equal(result.tagIndex['c2-button-group'], 'button')
  assert.equal(
    result.components['line-chart'].elements.some((e) => e.tag === 'c2-button-group'),
    false,
  )
})

test('a new tag extending one page family goes to that page, not to the package representative', () => {
  const root = project(
    { '@c2n/chart': '*' },
    {
      '@c2n/chart': {
        modules: [{ path: 'src/chart.ts', tags: ['c2-line-chart', 'c2-chart-series', 'c2-bar-chart', 'c2-bar-chart-stack', 'c2-line-chart-marker'] }],
      },
    },
  )
  const result = withProject(root, () => withInstalledApi(registry))
  assert.equal(result.tagIndex['c2-bar-chart-stack'], 'bar-chart')
  assert.equal(result.tagIndex['c2-line-chart-marker'], 'line-chart')
  assert.deepEqual(
    result.components['bar-chart'].elements.map((e) => e.tag),
    ['c2-bar-chart', 'c2-bar-chart-stack'],
  )
  assert.equal(result.components['bar-chart'].elements[1].modulePath, '@c2n/components/chart')
  assert.equal(
    result.components['line-chart'].elements.some((e) => e.tag === 'c2-bar-chart-stack'),
    false,
  )
})

test('a component the installed umbrella added, unknown to this server, is served from its manifest', () => {
  const root = project(
    { '@c2n/components': '*' },
    {
      '@c2n/components': {
        exports: { './button': './dist/button.js', './meter': './dist/meter.js' },
        modules: [
          { path: 'button/src/button.ts', tags: ['c2-button'] },
          { path: 'meter/src/meter-mark.ts', tags: ['c2-meter-mark'] },
          { path: 'meter/src/meter.ts', tags: ['c2-meter'] },
          // Not an entry of the umbrella: nothing an application can import.
          { path: 'internal/src/thing.ts', tags: ['c2-thing'] },
        ],
      },
    },
  )
  const [result, live] = withProject(root, () => [withInstalledApi(registry), withInstalledComponents(registry)])
  assert.equal(result.tagIndex['c2-meter'], 'meter')
  assert.equal(result.tagIndex['c2-meter-mark'], 'meter')
  assert.equal(result.packageIndex['@c2n/meter'], 'meter')
  assert.equal(result.tagIndex['c2-thing'], undefined)
  const meter = result.components['meter']
  assert.deepEqual(
    meter.elements.map((e) => e.tag),
    ['c2-meter', 'c2-meter-mark'],
  )
  assert.equal(meter.install.import, "import '@c2n/components/meter'")
  assert.equal(meter.status, 'undocumented')
  assert.match(meter.description, /9\.9\.9 and unknown to this server \(0\.0\.0\)/)
  // The server's tools find it the same way, by tag, id or package, next to the components the registry knows.
  for (const name of ['c2-meter', 'c2-meter-mark', 'meter', '@c2n/meter']) assert.equal(resolveElement(live, name)?.component.id, 'meter')
  assert.equal(live.components['button'], registry.components['button'])
  assert.equal(live.tagIndex['c2-thing'], undefined)
  // The registry handed in is left as it was.
  assert.equal(registry.components['meter'], undefined)
  assert.equal(registry.packageIndex['@c2n/meter'], undefined)
})
