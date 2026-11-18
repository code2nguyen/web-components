import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { grade as gradeAgent } from './readiness/agent.ts'
import {
  grade,
  nestedTags,
  needFromDescription,
  propertyOnly,
  publicMethods,
  runDiscovery,
  scoreComponent,
  type Sources,
  type Task,
} from './readiness/score.ts'
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
  members: () => [],
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
  const api = result.dimensions.find((d) => d.id === 'api')!
  assert.equal(api.checks.length, 0)
  assert.equal(api.score, 1)
})

test('an example that fails validation costs validation points', () => {
  const c = component('widget', { examples: [{ kind: 'usage', label: 'bad', html: '<c2-widgte></c2-widgte>' }] })
  const result = scoreComponent(registry(c), c, sources())
  const valid = result.dimensions.find((d) => d.id === 'validation')!.checks.find((x) => x.id === 'examples-valid')!
  assert.equal(valid.score, 0)
  assert.match(valid.detail ?? '', /Unknown element/)
})

test('property-only API skips attributes, private, static and form-associated members', () => {
  const element = { ...component('t').elements[0], attributes: [{ name: 'rows', type: 'Row[]' }] }
  const names = propertyOnly(element, [
    { kind: 'field', name: 'rows' },
    { kind: 'field', name: 'renderCell', description: 'Renders a cell.' },
    { kind: 'field', name: 'sorted', attribute: 'sorted' },
    { kind: 'field', name: '_cache' },
    { kind: 'field', name: 'secret', privacy: 'private' },
    { kind: 'field', name: 'styles', static: true },
    { kind: 'field', name: 'validity' },
  ]).map((m) => m.name)
  assert.deepEqual(names, ['renderCell'])
  assert.deepEqual(
    publicMethods([
      { kind: 'method', name: 'render' },
      { kind: 'method', name: 'selectAll' },
      { kind: 'method', name: 'checkValidity' },
    ]).map((m) => m.name),
    ['selectAll'],
  )
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
