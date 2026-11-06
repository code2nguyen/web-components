import assert from 'node:assert/strict'
import test from 'node:test'
import { hasGlobalTestImpact, rootManifestImpact, selectComponentTestDirectories, shardCount } from './run-changed-component-tests.mjs'

const suites = ['open-packages/chatbot/test', 'packages/components/button/test', 'packages/components/select/test']

test('selects only directly changed component packages', () => {
  assert.deepEqual(selectComponentTestDirectories(['packages/components/button/src/button.ts', 'apps/ui/src/pages/index.astro'], suites), [
    'packages/components/button/test',
  ])
})

test('selects every changed component package once', () => {
  assert.deepEqual(
    selectComponentTestDirectories(
      ['packages/components/select/src/select.ts', 'open-packages/chatbot/test/chatbot.spec.ts', 'packages/components/select/src/select.scss'],
      suites,
    ),
    ['open-packages/chatbot/test', 'packages/components/select/test'],
  )
})

test('runs all suites for shared runtime and test infrastructure changes', () => {
  for (const file of ['packages/core/src/dom-helper.ts', 'packages/tools/sass/variables.scss', 'tests/component-fixture.ts', 'playwright.config.ts']) {
    assert.equal(hasGlobalTestImpact([file]), true)
    assert.deepEqual(selectComponentTestDirectories([file], suites), suites)
  }
})

test('ignores packages without a component suite', () => {
  assert.deepEqual(selectComponentTestDirectories(['packages/components/table/src/table.ts'], suites), [])
})

test('runs the @c2n/components suite for any component change and for its own', () => {
  const withUmbrella = [...suites, 'packages/umbrella/test']
  assert.deepEqual(selectComponentTestDirectories(['packages/components/table/src/table.ts'], withUmbrella), ['packages/umbrella/test'])
  assert.deepEqual(selectComponentTestDirectories(['packages/components/button/src/button.ts'], withUmbrella), [
    'packages/components/button/test',
    'packages/umbrella/test',
  ])
  assert.deepEqual(selectComponentTestDirectories(['packages/umbrella/index.js'], withUmbrella), ['packages/umbrella/test'])
  assert.deepEqual(selectComponentTestDirectories(['apps/ui/src/pages/index.astro'], withUmbrella), [])
})

const graph = {
  packages: [
    { directory: 'packages/components/button', name: '@c2n/button', specifiers: ['@c2n/core/lit-helper.js', '@c2n/feather-icons/icons/x.js'] },
    { directory: 'packages/components/select', name: '@c2n/select', specifiers: ['@c2n/core/dom-helper.js', '@c2n/button'] },
    { directory: 'open-packages/chatbot', name: '@c2n/chatbot', specifiers: ['@c2n/core/contexts/field.js', '@c2n/symbols/symbols/empty.js'] },
    { directory: 'packages/icons/feather-icons', name: '@c2n/feather-icons', specifiers: [] },
    { directory: 'packages/icons/symbols', name: '@c2n/symbols', specifiers: ['@c2n/core/element-helper.js'] },
  ],
  iconPackages: { 'feather-icons': '@c2n/feather-icons', symbols: '@c2n/symbols' },
  coreImports: { 'dom-helper': [], 'lit-helper': [], 'element-helper': [], 'contexts/field': ['dom-helper'], 'pan-zoom': [] },
}
const withUmbrella = [...suites, 'packages/umbrella/test']
const noManifestImpact = { 'package.json': false, 'package-lock.json': false, 'packages/core/package.json': false }

test('with an import graph, a core module runs every package loading it, directly or through another package', () => {
  // Select loads Button, which imports lit-helper.
  assert.deepEqual(selectComponentTestDirectories(['packages/core/src/lit-helper.ts'], withUmbrella, { graph }), [
    'packages/components/button/test',
    'packages/components/select/test',
    'packages/umbrella/test',
  ])
  // contexts/field imports dom-helper.
  assert.deepEqual(selectComponentTestDirectories(['packages/core/src/dom-helper.ts'], withUmbrella, { graph }), [
    'open-packages/chatbot/test',
    'packages/components/select/test',
    'packages/umbrella/test',
  ])
  // Through an icon set: the chatbot loads symbols, which imports element-helper.
  assert.deepEqual(selectComponentTestDirectories(['packages/core/src/element-helper.ts'], withUmbrella, { graph }), [
    'open-packages/chatbot/test',
    'packages/umbrella/test',
  ])
  // A module nothing imports yet, and core's unit tests, reach no suite.
  assert.deepEqual(selectComponentTestDirectories(['packages/core/src/pan-zoom.ts', 'packages/core/src/pan-zoom.test.ts'], withUmbrella, { graph }), [])
})

test('with an import graph, an icon set runs the packages loading it; core config still runs everything', () => {
  assert.deepEqual(
    selectComponentTestDirectories(['packages/icons/feather-icons/src/icons/x.ts', 'packages/icons/feather-icons/src/icons/y.ts'], withUmbrella, { graph }),
    ['packages/components/button/test', 'packages/components/select/test', 'packages/umbrella/test'],
  )
  assert.deepEqual(selectComponentTestDirectories(['packages/core/tsconfig.json'], withUmbrella, { graph }), withUmbrella)
})

test('a component change runs its own suite, not those of the components built on it', () => {
  assert.deepEqual(selectComponentTestDirectories(['packages/components/button/src/button.ts'], withUmbrella, { graph }), [
    'packages/components/button/test',
    'packages/umbrella/test',
  ])
})

test('root manifests run everything unless the change cannot reach the suites', () => {
  const files = ['package.json', 'package-lock.json', 'packages/core/package.json']
  for (const file of files) {
    assert.equal(hasGlobalTestImpact([file], { graph }), true)
    assert.equal(hasGlobalTestImpact([file], { graph, manifestImpact: { [file]: true } }), true)
    assert.equal(hasGlobalTestImpact([file], { graph, manifestImpact: noManifestImpact }), false)
  }
})

test('rootManifestImpact: the wireit build list, new lockfile packages, workspace links and new core exports do not count', () => {
  const root = (extra) => JSON.stringify({ name: 'root', devDependencies: { vite: '7.0.0' }, wireit: { build: { dependencies: ['a'] } }, ...extra })
  assert.equal(rootManifestImpact('package.json', root(), root({ wireit: { build: { dependencies: ['a', 'b'] } } })), false)
  assert.equal(rootManifestImpact('package.json', root(), root({ devDependencies: { vite: '7.1.0' } })), true)
  assert.equal(rootManifestImpact('package.json', root(), root({ wireit: { build: { dependencies: ['a'], files: ['x'] } } })), true)
  assert.equal(rootManifestImpact('package.json', undefined, root()), true)

  const lock = (packages) => JSON.stringify({ lockfileVersion: 3, packages: { '': { name: 'root' }, 'node_modules/lit': { version: '3.0.0' }, ...packages } })
  const added = {
    'packages/components/new': { name: '@c2n/new' },
    'node_modules/@c2n/new': { resolved: 'packages/components/new', link: true },
    'node_modules/d3-geo': { version: '3.1.0' },
  }
  assert.equal(rootManifestImpact('package-lock.json', lock(), lock(added)), false)
  assert.equal(rootManifestImpact('package-lock.json', lock(), lock({ 'node_modules/lit': { version: '3.1.0' } })), true)
  assert.equal(rootManifestImpact('package-lock.json', lock({ 'node_modules/old': { version: '1.0.0' } }), lock()), true)
  assert.equal(rootManifestImpact('package-lock.json', lock(), '{'), true)

  const core = (exports, extra) => JSON.stringify({ name: '@c2n/core', exports, ...extra })
  const domHelper = { './dom-helper.js': { types: './dist/dom-helper.d.ts', default: './dist/dom-helper.js' } }
  const panZoom = { './pan-zoom.js': { types: './dist/pan-zoom.d.ts', default: './dist/pan-zoom.js' } }
  assert.equal(rootManifestImpact('packages/core/package.json', core(domHelper), core({ ...domHelper, ...panZoom })), false)
  assert.equal(rootManifestImpact('packages/core/package.json', core({ ...domHelper, ...panZoom }), core(domHelper)), true)
  assert.equal(rootManifestImpact('packages/core/package.json', core(domHelper), core(domHelper, { dependencies: { lit: '3' } })), true)
})

test('shardCount spreads a full run over four shards and keeps a small one in one', () => {
  assert.equal(shardCount(0), 1)
  assert.equal(shardCount(3), 1)
  assert.equal(shardCount(15), 1)
  assert.equal(shardCount(16), 2)
  assert.equal(shardCount(202), 4)
})
