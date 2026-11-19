import assert from 'node:assert/strict'
import fs, { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mock, test } from 'node:test'
import { installedPackage, publicProperties, scriptApi, withInstalledApi, withInstalledComponents, type InstalledInfo } from '../src/installed.ts'
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

type TestManifest = {
  modules: {
    path?: string
    declarations?: {
      kind?: string
      tagName?: string
      name?: string
      description?: string
      members?: object[]
      attributes?: object[]
      slots?: object[]
      events?: object[]
      cssParts?: object[]
      cssProperties?: object[]
    }[]
  }[]
}

/** What `installedPackage` read per package before the manifest index: parse the whole manifest, own the tags under `directory`. */
function expectedFromManifest(manifestPath: string, directory: string) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as TestManifest
  const elements = new Map<string, unknown>()
  const owned = new Set<string>()
  const declared = new Map<string, { path: string; description: string }>()
  for (const mod of manifest.modules) {
    for (const decl of mod.declarations ?? []) {
      if (!decl.tagName) continue
      if ((mod.path ?? '').startsWith(directory)) owned.add(decl.tagName)
      declared.set(decl.tagName, { path: mod.path ?? '', description: decl.description ?? '' })
      elements.set(decl.tagName, {
        className: decl.name ?? '',
        properties: publicProperties(decl.members as Parameters<typeof publicProperties>[0]),
        scriptApi: scriptApi(decl.members as Parameters<typeof scriptApi>[0], decl.attributes as Parameters<typeof scriptApi>[1]),
        attributes: decl.attributes ?? [],
        slots: decl.slots ?? [],
        events: decl.events ?? [],
        cssParts: decl.cssParts ?? [],
        cssProperties: ((decl.cssProperties ?? []) as { name?: string }[]).filter((p) => p.name),
      })
    }
  }
  return { elements, owned, declared }
}

test("through the umbrella, the merged manifest is read once for every package, and each package's API is what a full read gives", () => {
  const names = Array.from({ length: 40 }, (_, i) => `pkg-${i}`)
  const root = mkdtempSync(join(tmpdir(), 'c2n-installed-'))
  writeFileSync(join(root, 'package.json'), JSON.stringify({ dependencies: { '@c2n/components': '*', '@c2n/standalone': '*' } }))
  const umbrellaDir = join(root, 'node_modules', '@c2n/components')
  mkdirSync(umbrellaDir, { recursive: true })
  const exports = Object.fromEntries([...names, 'empty'].map((name) => [`./${name}`, `./dist/${name}.js`]))
  writeFileSync(
    join(umbrellaDir, 'package.json'),
    JSON.stringify({ name: '@c2n/components', version: '2.0.0', customElements: 'custom-elements.json', exports }),
  )
  const modules: TestManifest['modules'] = names.flatMap((name, i) => [
    {
      path: `${name}/src/${name}.js`,
      declarations: [
        {
          kind: 'class',
          tagName: `c2-${name}`,
          name: `C2${i}`,
          description: `Element ${i}`,
          members: [
            { kind: 'field', name: 'value' },
            { kind: 'field', name: '_hidden' },
            { kind: 'method', name: 'focus' },
          ],
          attributes: [{ name: 'value' }],
          slots: [{ name: '' }, { name: `${name}-icon` }],
          events: [{ name: 'change' }],
          cssParts: [{ name: 'label' }],
          cssProperties: [{ name: `--c2-${name}--color` }, { description: 'no name' }],
        },
        { kind: 'function', name: 'helper' },
      ],
    },
    { path: `${name}/src/${name}-item.js`, declarations: [{ kind: 'class', tagName: `c2-${name}-item`, name: `C2${i}Item` }] },
  ])
  // A tag declared by two packages (the last module wins `declared`, both own it), and a module at the root.
  modules.push({ path: 'pkg-1/src/shared.js', declarations: [{ kind: 'class', tagName: 'c2-pkg-10', name: 'Dup' }] })
  modules.push({ path: 'root.js', declarations: [{ kind: 'class', tagName: 'c2-root', name: 'Root' }] })
  const manifestPath = join(umbrellaDir, 'custom-elements.json')
  writeFileSync(manifestPath, JSON.stringify({ modules }))
  // A package the project declares itself is read from its own manifest, every tag of it owned.
  const standaloneDir = join(root, 'node_modules', '@c2n/standalone')
  mkdirSync(standaloneDir, { recursive: true })
  writeFileSync(join(standaloneDir, 'package.json'), JSON.stringify({ name: '@c2n/standalone', version: '1.0.0', customElements: 'custom-elements.json' }))
  writeFileSync(
    join(standaloneDir, 'custom-elements.json'),
    JSON.stringify({ modules: [{ path: 'src/a.js', declarations: [{ kind: 'class', tagName: 'c2-a', name: 'A' }] }] }),
  )

  // Count the reads `installed.ts` makes: its named import of `readFileSync` follows `fs` once the exports are synced.
  const reads: string[] = []
  const original = fs.readFileSync
  const tracked = mock.method(fs, 'readFileSync', (...args: Parameters<typeof fs.readFileSync>) => {
    if (typeof args[0] === 'string') reads.push(args[0])
    return original(...args)
  })
  syncBuiltinESMExports()
  try {
    withProject(root, () => {
      const packages = ['@c2n/components', '@c2n/standalone', '@c2n/empty', '@c2n/missing', ...names.map((n) => `@c2n/${n}`)]
      const results = packages.map((name) => [name, installedPackage(name)] as [string, InstalledInfo | null])
      const manifestReads = reads.filter((path) => path.endsWith('custom-elements.json'))
      assert.equal(manifestReads.filter((path) => path.includes(join('@c2n', 'components'))).length, 1)
      assert.equal(manifestReads.filter((path) => path.includes(join('@c2n', 'standalone'))).length, 1)
      // The package.json files are read once too, not once per package (the umbrella's may be read under two spellings).
      assert.ok(reads.length <= 7, `${reads.length} reads for ${packages.length} packages`)
      // Compared while the files still exist: withProject removes the project afterwards.
      for (const [name, info] of results) {
        if (name === '@c2n/missing') {
          assert.equal(info, null)
          continue
        }
        assert.ok(info?.elements, name)
        const standalone = name === '@c2n/standalone'
        const throughUmbrella = name !== '@c2n/components' && !standalone
        const expected = expectedFromManifest(
          standalone ? join(standaloneDir, 'custom-elements.json') : manifestPath,
          throughUmbrella ? `${name.slice('@c2n/'.length)}/` : '',
        )
        assert.deepEqual(info.elements, expected.elements, name)
        assert.deepEqual(info.owned, expected.owned, name)
        assert.deepEqual(info.declared, expected.declared, name)
        assert.equal(info.version, standalone ? '1.0.0' : '2.0.0', name)
        assert.deepEqual(info.via, throughUmbrella ? { package: '@c2n/components', version: '2.0.0' } : undefined, name)
        assert.equal(info.entries?.size, standalone ? 0 : names.length + 1, name)
      }
      const owned = new Map(results.map(([name, info]) => [name, info?.owned]))
      assert.deepEqual([...(owned.get('@c2n/pkg-1') ?? [])], ['c2-pkg-1', 'c2-pkg-1-item', 'c2-pkg-10'])
      assert.deepEqual([...(owned.get('@c2n/pkg-10') ?? [])], ['c2-pkg-10', 'c2-pkg-10-item'])
      assert.deepEqual([...(owned.get('@c2n/empty') ?? [])], [])
      assert.equal(owned.get('@c2n/components')?.has('c2-root'), true)
    })
  } finally {
    tracked.mock.restore()
    syncBuiltinESMExports()
  }
})
