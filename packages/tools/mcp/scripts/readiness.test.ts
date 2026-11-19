import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { grade as gradeAgent } from './readiness/agent.ts'
import { scriptApi } from '../src/installed.ts'
import { grade, nestedTags, needFromDescription, runDiscovery, scoreComponent, type Sources, type Task } from './readiness/score.ts'
import type { ComponentEntry, Registry } from '../src/registry-types.ts'

function component(id: string, overrides: Partial<ComponentEntry> = {}): ComponentEntry {
  return {
    id,
    package: `@c2n/${id}`,
    title: id[0].toUpperCase() + id.slice(1),
    description: `A ${id} that shows something useful to the reader of the page.`,
    category: 'Data display',
    status: 'stable',
    docsUrl: '',
    elements: [
      {
        tag: `c2-${id}`,
        className: 'X',
        modulePath: `@c2n/components/${id}`,
        description: 'The element itself, described in enough words.',
        attributes: [],
        properties: ['value'],
        slots: [],
        events: [],
        cssParts: [],
        cssProperties: [],
      },
    ],
    composition: { internal: [], slotted: [], usedBy: [] },
    install: { npm: 'npm install @c2n/components', import: `import '@c2n/components/${id}'`, importClass: '', umbrella: `@c2n/components/${id}` },
    examples: [],
    hasGallery: false,
    ...overrides,
  }
}

function registry(...components: ComponentEntry[]): Registry {
  return {
    schemaVersion: 1,
    c2nVersion: '0.0.0',
    categories: ['Data display'],
    components: Object.fromEntries(components.map((c) => [c.id, c])),
    tagIndex: Object.fromEntries(components.flatMap((c) => c.elements.map((e) => [e.tag, c.id]))),
    packageIndex: Object.fromEntries(components.map((c) => [c.package, c.id])),
    theme: { package: '@c2n/theme', install: { npm: '', imports: [] }, tokens: [], mapping: {}, darkMode: '' },
    guides: { workflow: '', theming: '', 'variant-components': '', frameworks: '' },
  }
}

const sources = (over: Partial<Sources> = {}): Sources => ({
  frameworkFile: (pkg) => `'c2-${pkg.slice(5)}'`,
  angularTags: new Set(),
  declaredTags: (pkg) => new Set([`c2-${pkg.slice(5)}`]),
  ...over,
})

test('grades follow the score bands', () => {
  assert.deepEqual([95, 85, 75, 65, 10].map(grade), ['A', 'B', 'C', 'D', 'F'])
})

test('dimension weights add up to 100 and every component scores 0-100', () => {
  const rich = component('rating', {
    intro:
      'Lets a reader give a score from one to five stars, with half values, a hover preview and keyboard control, inside a form or on its own in a review card.',
    elements: [
      {
        ...component('rating').elements[0],
        attributes: [{ name: 'max', type: 'number', default: '5', description: 'Number of stars drawn.' }],
        events: [{ name: 'change', type: 'Event', description: 'Fires when the value changes.' }],
        slots: [{ name: 'icon', description: 'Replaces the star icon.' }],
      },
    ],
    examples: [
      { kind: 'usage', label: 'a', html: '<c2-rating max="5"><svg slot="icon"></svg></c2-rating>' },
      { kind: 'usage', label: 'b', html: '<c2-rating></c2-rating>' },
      { kind: 'usage', label: 'c', html: '<c2-rating></c2-rating>' },
    ],
    hasGallery: true,
  })
  const bare = component('bare', { description: 'Bare.', elements: [{ ...component('bare').elements[0], description: '' }] })
  const reg = registry(rich, bare)
  const good = scoreComponent(reg, rich, sources())
  const poor = scoreComponent(reg, bare, sources({ frameworkFile: () => null, declaredTags: () => new Set() }))
  assert.equal(
    good.dimensions.reduce((s, d) => s + d.weight, 0),
    100,
  )
  assert.ok(good.score > 90, `rich component scored ${good.score}`)
  assert.ok(poor.score < good.score - 20, `bare component scored ${poor.score}`)
  const framework = poor.dimensions.find((d) => d.id === 'framework')!
  assert.ok(framework.checks.find((c) => c.id === 'react-types')!.score === 0)
})

test('a check that does not apply is left out instead of passing', () => {
  const c = component('plain')
  const result = scoreComponent(registry(c), c, sources())
  const composition = result.dimensions.find((d) => d.id === 'composition')!
  assert.equal(composition.checks.length, 0)
  assert.equal(composition.score, 1)
})

test('an example that fails validation costs validation points', () => {
  const c = component('widget', { examples: [{ kind: 'usage', label: 'bad', html: '<c2-widgte></c2-widgte>' }] })
  const result = scoreComponent(registry(c), c, sources())
  const valid = result.dimensions.find((d) => d.id === 'validation')!.checks.find((x) => x.id === 'examples-valid')!
  assert.equal(valid.score, 0)
  assert.match(valid.detail ?? '', /Unknown element/)
})

test('script-only API keeps renderers and methods, not attributes, private, static, lifecycle or form-associated members', () => {
  const api = scriptApi(
    [
      { kind: 'field', name: 'rows', attribute: 'rows' },
      { kind: 'field', name: 'rowKey' },
      { kind: 'field', name: 'renderCell', type: { text: 'Renderer' }, description: 'Renders a cell.' },
      { kind: 'field', name: '_cache' },
      { kind: 'field', name: 'secret', privacy: 'private' },
      { kind: 'field', name: 'styles', static: true },
      { kind: 'field', name: 'validity' },
      { kind: 'method', name: 'render' },
      { kind: 'method', name: 'checkValidity' },
      {
        kind: 'method',
        name: 'selectRows',
        parameters: [
          { name: 'rows', type: { text: 'Row[]' } },
          { name: '{ add = false }', type: { text: '{ add?: boolean }' } },
        ],
        return: { type: { text: 'void' } },
      },
    ],
    [{ name: 'row-key', fieldName: 'rowKey' }],
  )
  assert.deepEqual(api, [
    { kind: 'property', name: 'renderCell', type: 'Renderer', description: 'Renders a cell.', readonly: undefined },
    { kind: 'method', name: 'selectRows', type: '(rows: Row[], options: { add?: boolean }) => void', description: undefined },
  ])
})

test('nested tags are the ones inside the component, not around it', () => {
  const html = '<c2-card><c2-list><c2-list-item></c2-list-item><c2-badge></c2-badge></c2-list></c2-card><c2-button></c2-button>'
  assert.deepEqual(nestedTags(html, new Set(['c2-list'])), ['c2-list-item', 'c2-badge'])
})

test('the need from a description drops the component own names', () => {
  const c = component('tree-select', { title: 'Tree select', description: 'A dropdown for picking rows from a tree hierarchy.' })
  assert.equal(needFromDescription(c), 'A dropdown for picking rows from a hierarchy')
})

test('discovery ranks the expected component and computes MRR', () => {
  const reg = registry(
    component('rate', { description: 'Star rating input for reviews.' }),
    component('table', { description: 'Data grid with sorting and selection.' }),
  )
  const tasks: Task[] = [
    { id: 'a', requirement: 'star rating for reviews', expect: ['rate'] },
    { id: 'b', requirement: 'sortable data grid', expect: ['table'] },
    { id: 'c', requirement: 'calendar', expect: ['scheduler'] },
  ]
  const result = runDiscovery(reg, tasks)
  assert.deepEqual(
    result.tasks.map((t) => t.rank),
    [1, 1, null],
  )
  assert.equal(Math.round(result.mrr * 100), 67)
})

test('the benchmark tasks name real components and tags', () => {
  const tasks = (JSON.parse(readFileSync(new URL('./readiness/tasks.json', import.meta.url), 'utf8')) as { tasks: Task[] }).tasks
  const ids = new Set(tasks.map((t) => t.id))
  assert.equal(ids.size, tasks.length, 'task ids are unique')
  for (const t of tasks) {
    assert.ok(t.expect.length > 0, t.id)
    assert.ok(
      (t.tags ?? []).every((tag) => tag.startsWith('c2-')),
      t.id,
    )
  }
})

test('agent grading checks the tag, the validator and the required attributes', () => {
  const reg = registry(component('modal', { elements: [{ ...component('modal').elements[0], slots: [{ name: 'footer' }] }] }))
  const task: Task = { id: 'm', requirement: '', expect: ['modal'], tags: ['c2-modal'], attributes: ['slot:footer'] }
  const pass = gradeAgent(reg, task, '<c2-modal><div slot="footer"></div></c2-modal>')
  assert.deepEqual([pass.found, pass.valid, pass.correct], [true, true, true])
  const wrong = gradeAgent(reg, task, '<c2-modal></c2-modal><c2-dialog></c2-dialog>')
  assert.deepEqual([wrong.found, wrong.valid, wrong.correct], [true, false, false])
  assert.ok(wrong.notes.some((n) => n.includes('missing slot:footer')))
})

test('a changed run scores the components whose package, docs page or gallery changed, and no test file counts', async () => {
  const { changedComponents } = await import('./readiness.ts')
  const reg = registry(component('button'), component('badge'), component('stat'))
  const { ids, full } = changedComponents(reg, 'HEAD', [
    'packages/components/button/src/button.ts',
    'packages/components/badge/test/badge.spec.ts',
    'apps/ui/src/content/gallery/stat.mdx',
    'README.md',
  ])
  assert.deepEqual([...ids].sort(), ['button', 'stat'])
  assert.equal(full, undefined)
  // A change to the scoring or to what the MCP server serves moves every score: the run goes full.
  assert.equal(changedComponents(reg, 'HEAD', ['packages/tools/mcp/src/search.ts']).full, 'packages/tools/mcp/src/search.ts')
  // The benchmark requirements are not scoring: discovery runs every time anyway.
  assert.equal(changedComponents(reg, 'HEAD', ['packages/tools/mcp/scripts/readiness/tasks.json']).full, undefined)
  // Neither the lab reader nor the call log feeds a component score.
  assert.equal(changedComponents(reg, 'HEAD', ['packages/tools/mcp/scripts/readiness/lab.ts', 'packages/tools/mcp/src/call-log.ts']).full, undefined)
})

test('a component is compared with its last score check by check', async () => {
  const { compare, aggregate } = await import('./readiness.ts')
  const before = { score: 90, grade: 'A', dimensions: { api: 80 }, checks: { 'api/slots-described': 50, 'examples/usage': 60 } }
  const now = { score: 88.5, grade: 'B', dimensions: { api: 70 }, checks: { 'examples/usage': 30, 'composition/slots-shown': 0 } }
  const result = compare(before, now)
  assert.equal(result.delta, -1.5)
  assert.deepEqual(result.fixed, ['api/slots-described'])
  assert.deepEqual(result.worse.sort(), ['composition/slots-shown', 'examples/usage'])
  assert.deepEqual(compare(undefined, now), { delta: null, fixed: [], worse: [] })
  const library = aggregate({ a: before, b: now })
  assert.equal(library.score, 89.3)
  assert.deepEqual(library.grades, { A: 1, B: 1, C: 0, D: 0, F: 0 })
})

// The built registry is a build artifact, absent in CI's unit step.
const builtRegistry = new URL('../data/registry.json', import.meta.url)
test(
  'the committed lab reports give tasks with real components, no generic button and no cross-cutting row',
  { skip: !existsSync(builtRegistry) && 'data/registry.json not built' },
  async () => {
    const { labTasks } = await import('./readiness/lab.ts')
    const reg = JSON.parse(readFileSync(builtRegistry, 'utf8')) as Registry
    const tasks = labTasks(reg, fileURLToPath(new URL('../../../..', import.meta.url)))
    assert.ok(tasks.length > 0)
    for (const t of tasks) {
      assert.match(t.id, /^lab:[a-z0-9-]+\/R\d+$/)
      for (const id of t.expect) assert.ok(reg.components[id], `${t.id}: ${id}`)
    }
    const chips = tasks.find((t) => t.id === 'lab:catalog-filter/R6')
    assert.deepEqual(chips?.expect, ['chip', 'chip-group'])
    // R12 is all a11y: a screen reader reads every component, there is nothing to search for.
    assert.equal(
      tasks.find((t) => t.id === 'lab:catalog-filter/R12'),
      undefined,
    )
  },
)

test("a lab-only run replaces report.md's lab section, or adds it before the agent run", async () => {
  const { withLabSection } = await import('./readiness.ts')
  const report = '# R\n\n## Discovery misses\n\nx\n\n## Lab requirements\n\nold\n\n## Agent run\n\ny\n'
  assert.equal(
    withLabSection(report, ['', '## Lab requirements', '', 'new']),
    '# R\n\n## Discovery misses\n\nx\n\n## Lab requirements\n\nnew\n\n## Agent run\n\ny\n',
  )
  assert.equal(withLabSection('# R\n\n## Agent run\n\ny\n', ['', '## Lab requirements', '', 'new']), '# R\n\n## Lab requirements\n\nnew\n\n## Agent run\n\ny\n')
})

test('a report.md without the usual headings still gets its lab section, at the end', async () => {
  const { withLabSection } = await import('./readiness.ts')
  assert.equal(withLabSection('# R\n', ['', '## Lab requirements', '', 'new']), '# R\n\n## Lab requirements\n\nnew\n')
})

test('a lab row naming an icon by its own tag expects the icon set', { skip: !existsSync(builtRegistry) && 'data/registry.json not built' }, async () => {
  const { labTasks } = await import('./readiness/lab.ts')
  const reg = JSON.parse(readFileSync(builtRegistry, 'utf8')) as Registry
  const root = mkdtempSync(join(tmpdir(), 'c2n-lab-'))
  mkdirSync(join(root, 'lab/specs/scenarios'), { recursive: true })
  mkdirSync(join(root, 'lab/reports/s'), { recursive: true })
  mkdirSync(join(root, 'lab/apps/s/default'), { recursive: true })
  mkdirSync(join(root, 'lab/apps/s/dense'), { recursive: true })
  writeFileSync(join(root, 'lab/specs/scenarios/s.md'), '## Requirements\n\n- R1 [input.search] A search icon in the field.\n')
  writeFileSync(
    join(root, 'lab/reports/s/default.md'),
    '## Requirements\n\n| Req | Outcome | Components | Notes |\n| --- | --- | --- | --- |\n| R1 | met | c2-feather-search | |\n',
  )
  assert.deepEqual(
    labTasks(reg, root).map((t) => t.expect),
    [['feather-icons']],
  )
})

test(
  'a lab row keeps a button group as its answer: only a plain button and glyph icons are generic',
  { skip: !existsSync(builtRegistry) && 'data/registry.json not built' },
  async () => {
    const { labTasks } = await import('./readiness/lab.ts')
    const reg = JSON.parse(readFileSync(builtRegistry, 'utf8')) as Registry
    const root = mkdtempSync(join(tmpdir(), 'c2n-lab-'))
    mkdirSync(join(root, 'lab/specs/scenarios'), { recursive: true })
    mkdirSync(join(root, 'lab/reports/s'), { recursive: true })
    mkdirSync(join(root, 'lab/apps/s/default'), { recursive: true })
    mkdirSync(join(root, 'lab/apps/s/dense'), { recursive: true })
    writeFileSync(join(root, 'lab/specs/scenarios/s.md'), '## Requirements\n\n- R1 [input.choice] Monthly and Yearly, two options shown at once.\n')
    writeFileSync(
      join(root, 'lab/reports/s/default.md'),
      '## Requirements\n\n| Req | Outcome | Components | Notes |\n| --- | --- | --- | --- |\n| R1 | met | c2-button-group, c2-button, c2-card | |\n',
    )
    assert.deepEqual(
      labTasks(reg, root).map((t) => t.expect),
      [['button-group', 'card']],
    )
  },
)

test(
  'a requirement built in two directions counts once, with both builds’ components',
  { skip: !existsSync(builtRegistry) && 'data/registry.json not built' },
  async () => {
    const { labTasks } = await import('./readiness/lab.ts')
    const reg = JSON.parse(readFileSync(builtRegistry, 'utf8')) as Registry
    const root = mkdtempSync(join(tmpdir(), 'c2n-lab-'))
    mkdirSync(join(root, 'lab/specs/scenarios'), { recursive: true })
    mkdirSync(join(root, 'lab/reports/s'), { recursive: true })
    mkdirSync(join(root, 'lab/apps/s/default'), { recursive: true })
    mkdirSync(join(root, 'lab/apps/s/dense'), { recursive: true })
    writeFileSync(join(root, 'lab/specs/scenarios/s.md'), '## Requirements\n\n- R1 [input.rating] Rate the product.\n')
    const row = (tag: string) => `## Requirements\n\n| Req | Outcome | Components | Notes |\n| --- | --- | --- | --- |\n| R1 | met | ${tag} | |\n`
    writeFileSync(join(root, 'lab/reports/s/default.md'), row('c2-rate'))
    writeFileSync(join(root, 'lab/reports/s/dense.md'), row('c2-slider'))
    assert.deepEqual(
      labTasks(reg, root).map((t) => [t.id, t.expect]),
      [['lab:s/R1', ['rate', 'slider']]],
    )
  },
)

test(
  'a package name in a lab row expects the components of it the build uses',
  { skip: !existsSync(builtRegistry) && 'data/registry.json not built' },
  async () => {
    const { labTasks } = await import('./readiness/lab.ts')
    const reg = JSON.parse(readFileSync(builtRegistry, 'utf8')) as Registry
    const root = mkdtempSync(join(tmpdir(), 'c2n-lab-'))
    mkdirSync(join(root, 'lab/specs/scenarios'), { recursive: true })
    mkdirSync(join(root, 'lab/reports/s'), { recursive: true })
    mkdirSync(join(root, 'lab/apps/s/default'), { recursive: true })
    mkdirSync(join(root, 'lab/apps/s/dense'), { recursive: true })
    mkdirSync(join(root, 'lab/apps/s/default'), { recursive: true })
    writeFileSync(join(root, 'lab/specs/scenarios/s.md'), '## Requirements\n\n- R1 [chart.compare] Share of each plan.\n')
    writeFileSync(
      join(root, 'lab/reports/s/default.md'),
      '## Requirements\n\n| Req | Outcome | Components | Notes |\n| --- | --- | --- | --- |\n| R1 | met | @c2n/chart | |\n',
    )
    writeFileSync(join(root, 'lab/apps/s/default/index.html'), '<c2-pie-chart aria-label="Plans"></c2-pie-chart>')
    assert.deepEqual(
      labTasks(reg, root).map((t) => t.expect),
      [['pie-chart']],
    )
  },
)

test('the lab section is found by its heading line, not by a mention of it', async () => {
  const { withLabSection } = await import('./readiness.ts')
  const report = '# R\n\n### Lab requirements notes\n\nkeep\n\n## Lab requirements\n\nold\n\n## Agent run\n'
  assert.equal(
    withLabSection(report, ['', '## Lab requirements', '', 'new']),
    '# R\n\n### Lab requirements notes\n\nkeep\n\n## Lab requirements\n\nnew\n\n## Agent run\n',
  )
})

test('a spec id used twice is left out, and the other specs still count', { skip: !existsSync(builtRegistry) && 'data/registry.json not built' }, async () => {
  const { labTasks } = await import('./readiness/lab.ts')
  const reg = JSON.parse(readFileSync(builtRegistry, 'utf8')) as Registry
  const root = mkdtempSync(join(tmpdir(), 'c2n-lab-'))
  for (const dir of ['lab/specs/scenarios', 'lab/specs/features', 'lab/reports/s', 'lab/reports/t', 'lab/apps/s/default', 'lab/apps/t/default'])
    mkdirSync(join(root, dir), { recursive: true })
  const spec = '## Requirements\n\n- R1 [input.rating] Rate the product.\n'
  writeFileSync(join(root, 'lab/specs/scenarios/s.md'), spec)
  writeFileSync(join(root, 'lab/specs/features/s.md'), spec)
  writeFileSync(join(root, 'lab/specs/scenarios/t.md'), spec)
  const report = '## Requirements\n\n| Req | Outcome | Components | Notes |\n| --- | --- | --- | --- |\n| R1 | met | c2-rate | |\n'
  writeFileSync(join(root, 'lab/reports/s/default.md'), report)
  writeFileSync(join(root, 'lab/reports/t/default.md'), report)
  assert.deepEqual(
    labTasks(reg, root).map((t) => t.id),
    ['lab:t/R1'],
  )
})
