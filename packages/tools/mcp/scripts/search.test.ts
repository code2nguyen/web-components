import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import { searchComponents } from '../src/search.ts'
import type { ComponentEntry, ElementEntry, Registry } from '../src/registry-types.ts'

type Api = Partial<Pick<ElementEntry, 'attributes' | 'slots' | 'events'>>

function component(id: string, title: string, description: string, api: Api = {}, category = 'Data display'): ComponentEntry {
  return {
    id,
    package: `@c2n/${id}`,
    title,
    description,
    category,
    status: 'stable',
    docsUrl: '',
    elements: [
      {
        tag: `c2-${id}`,
        className: '',
        modulePath: `@c2n/${id}`,
        description: '',
        attributes: api.attributes ?? [],
        slots: api.slots ?? [],
        events: api.events ?? [],
        cssParts: [],
        cssProperties: [],
      },
    ],
    composition: { internal: [], slotted: [], usedBy: [] },
    install: { npm: '', import: '', importClass: '' },
    examples: [],
    hasGallery: false,
  }
}

// A table-family API: many attributes, slots and events, each mentioning a word of the queries below. Summed over
// every field, that breadth outranked the component whose title or description names the need.
const tableApi: Api = {
  attributes: [
    { name: 'empty-text', type: 'string', description: 'Text shown in the empty state when there are no results.' },
    { name: 'no-results-text', type: 'string', description: 'Text shown when a search has no results.' },
    { name: 'state', type: 'string', description: 'Loading state of the rows.' },
    { name: 'format', type: 'string', description: 'Number format of a column: currency, percent or plain.' },
    { name: 'currency', type: 'string', description: 'Currency code of price columns.' },
    { name: 'price-column', type: 'string', description: 'The column holding a price.' },
    { name: 'filter', type: 'string', description: 'Column filter shown as removable chips.' },
    { name: 'filter-chips', type: 'boolean', description: 'Show active filters as chips.' },
    { name: 'removable-filters', type: 'boolean', description: 'Filters can be removed.' },
  ],
  slots: [
    { name: 'empty', description: 'Empty state content when there are no results.' },
    { name: 'filters', description: 'Filter chips above the table.' },
  ],
  events: [
    { name: 'filter-change', description: 'A filter chip was removed or added.' },
    { name: 'format-change', description: 'A column format (currency, price) changed.' },
  ],
}

const components = [
  component('table', 'Table', 'A data table with sorting, filtering and selection.', tableApi),
  component('group-table', 'Group Table', 'A table whose rows are grouped.', tableApi),
  component('tree-table', 'Tree Table', 'A table whose rows nest.', tableApi),
  component('status-panel', 'Status Panel', 'Communicate empty states, operation outcomes and recoverable errors with clear next steps.', {}, 'Feedback'),
  component('format-number', 'Format Number', 'A number formatted for its locale: currency, percent, units, compact counts and byte sizes.', {
    attributes: [{ name: 'type', type: "'decimal' | 'currency' | 'percent'", description: 'What the number counts.' }],
  }),
  component(
    'chip-group',
    'Chip Group',
    'A single row of chips or badges that collapses whatever does not fit into a +N indicator, recomputed when items are added or removed.',
  ),
  component('button', 'Button', 'A button.', {}, 'Actions'),
]

const registry: Registry = {
  schemaVersion: 1,
  c2nVersion: '0.0.0',
  categories: ['Data display', 'Feedback', 'Actions'],
  components: Object.fromEntries(components.map((c) => [c.id, c])),
  tagIndex: Object.fromEntries(components.map((c) => [`c2-${c.id}`, c.id])),
  packageIndex: Object.fromEntries(components.map((c) => [c.package, c.id])),
  theme: { package: '@c2n/theme', install: { npm: '', imports: [] }, tokens: [], mapping: {}, darkMode: '' },
  guides: { workflow: '', theming: '', 'variant-components': '', frameworks: '' },
}

const needs: [query: string, id: string][] = [
  ['empty state no results', 'status-panel'],
  ['format currency price', 'format-number'],
  ['filter chips removable', 'chip-group'],
]

function rank(reg: Registry, query: string, id: string): number {
  return searchComponents(reg, query, 25).findIndex((hit) => hit.component.id === id)
}

test('a title or description naming the need outranks a large API that mentions its words', () => {
  for (const [query, id] of needs) {
    const position = rank(registry, query, id)
    assert.ok(position !== -1 && position < 3, `"${query}" ranks ${id} at ${position}: ${searchComponents(registry, query).map((h) => h.component.id)}`)
  }
})

test('a query naming a component puts it first', () => {
  assert.equal(searchComponents(registry, 'table')[0].component.id, 'table')
  assert.equal(searchComponents(registry, 'buttons')[0].component.id, 'button')
  assert.equal(searchComponents(registry, 'chips')[0].component.id, 'chip-group')
})

test('a word that begins the query term is not a match unless it is most of it ("form" is not "format")', () => {
  const reg: Registry = { ...registry, components: { form: component('form', 'Form', 'A form.'), ...registry.components } }
  assert.equal(
    searchComponents(reg, 'format').some((hit) => hit.component.id === 'form'),
    false,
  )
})

// The built registry, when present (it is a build artifact, absent before `build:registry`).
const built = new URL('../data/registry.json', import.meta.url)
test('the built registry ranks the component each need describes in the top five', { skip: !existsSync(built) && 'data/registry.json not built' }, () => {
  const reg = JSON.parse(readFileSync(built, 'utf8')) as Registry
  for (const [query, id] of needs) {
    const position = rank(reg, query, id)
    assert.ok(position !== -1 && position < 5, `"${query}" ranks ${id} at ${position}: ${searchComponents(reg, query, 8).map((h) => h.component.id)}`)
  }
})

test('keywords and rare words find a component its description does not name', () => {
  const rate = {
    ...component('rate', 'Rate', 'Accessible rating input with hover preview and half values.', {}, 'Inputs'),
    keywords: ['star rating', 'review'],
  }
  const chart = component('overlap-chart', 'Overlap chart', 'Shows which customers start in several sets and leave together.', {}, 'Chart')
  const menu = { ...component('context-menu', 'Context menu', 'A menu opened on an area.', {}, 'Navigation'), keywords: ['right click'] }
  const list = component('list', 'List', 'Shows a list of files the user can open from the list.', {}, 'Data display')
  // Words most components use ("show", "user", "list", "file") weigh less than the ones few do ("star", "click").
  const filler = Object.fromEntries(
    Array.from({ length: 20 }, (_, i) => [`filler-${i}`, component(`filler-${i}`, `Filler ${i}`, 'Shows the user a list of files to open.')]),
  )
  const registry = { components: { rate, chart, menu, list, ...filler } } as unknown as Registry
  assert.equal(searchComponents(registry, 'Let customers leave a 5 star review')[0].component.id, 'rate')
  assert.equal(searchComponents(registry, 'Show a menu when the user right-clicks a file in the list')[0].component.id, 'context-menu')
})

test('icon names are searched only when the query asks for an icon', () => {
  const icons = { ...component('phosphor-icons', 'Phosphor icons', 'An icon set.', {}, 'Icons'), icons: ['bell', 'user', 'calendar'] }
  const avatar = component('avatar', 'Avatar', 'A picture or the initials of a person.', {}, 'Data display')
  const registry = { components: { icons, avatar } } as unknown as Registry
  // "user" is an icon name; without the gate the icon set ranked first for a requirement about people.
  assert.equal(searchComponents(registry, 'Show the initials of each user')[0].component.id, 'avatar')
  assert.ok(!searchComponents(registry, 'Show the initials of each user').some((h) => h.component.id === 'phosphor-icons'))
  assert.equal(searchComponents(registry, 'a bell icon in the header')[0].component.id, 'phosphor-icons')
})

test('intents find a component from what the requirement wants done, and the best one is reported', () => {
  const sw = {
    ...component('switch', 'Switch', 'A labelled control with a sliding thumb.', {}, 'Inputs'),
    intents: ['Let users turn a setting on or off with immediate effect.', 'Enable or disable a feature from a settings list.'],
  }
  const checkbox = component('checkbox', 'Checkbox', 'A box the user ticks in a form.', {}, 'Inputs')
  const registry = { components: { sw, checkbox } } as unknown as Registry
  const [hit] = searchComponents(registry, 'Admins can disable the feature for their workspace')
  assert.equal(hit.component.id, 'switch')
  assert.equal(hit.intent, 'Enable or disable a feature from a settings list.')
  assert.ok(hit.matches.includes('intents'))
  // A hit found by other fields reports no intent.
  assert.equal(searchComponents(registry, 'tick box')[0].intent, undefined)
})

test('a query that is an icon name finds the icon sets; "arrow keys" and icon-name phrases do not', () => {
  const icons = {
    ...component('phosphor-icons', 'Phosphor icons', 'An icon set for buttons and menus.', {}, 'Icons'),
    icons: ['trash', 'user-plus', 'arrow-left'],
  }
  const tabs = component('tabs', 'Tabs', 'Panels the user moves between with the arrow keys.', {}, 'Navigation')
  const menu = component('menu', 'Menu', 'A list of actions the user picks from.', {}, 'Navigation')
  const registry = { components: { icons, tabs, menu } } as unknown as Registry
  assert.equal(searchComponents(registry, 'trash')[0]?.component.id, 'phosphor-icons')
  assert.ok(!searchComponents(registry, 'Navigate with arrow keys').some((h) => h.matches.some((m) => m.startsWith('icon:'))))
  // "user plus" is an icon's name but the query is not about icons: no phrase bonus for it.
  const hit = searchComponents(registry, 'Pick a user plus action in the menu').find((h) => h.component.id === 'phosphor-icons')
  assert.ok(!hit?.matches.includes('phrase'))
  assert.equal(searchComponents(registry, 'Pick a user plus action in the menu')[0].component.id, 'menu')
})

test('an icon name that is also a component name, in either number, is not an icon query', () => {
  const icons = { ...component('feather-icons', 'Feather icons', 'An icon set.', {}, 'Icons'), icons: ['star', 'terminal', 'sliders'] }
  const rate = { ...component('rate', 'Rate', 'A rating input.', {}, 'Inputs'), keywords: ['stars'] }
  const terminal = component('terminal', 'Terminal', 'A command-line view.', {}, 'Data display')
  const slider = component('slider', 'Slider', 'Pick a value along a track.', {}, 'Inputs')
  const registry = { components: { icons, rate, terminal, slider } } as unknown as Registry
  for (const query of ['star', 'terminal', 'sliders'])
    assert.ok(!searchComponents(registry, query).some((h) => h.component.id === 'feather-icons'), `"${query}" found the icon set`)
  // Only the plural is folded: an icon named "book" is not the keyword "booking".
  const book = { ...icons, icons: ['book'] }
  const scheduler = { ...component('scheduler', 'Scheduler', 'Resource bookings.', {}, 'Data display'), keywords: ['booking'] }
  assert.ok(searchComponents({ components: { book, scheduler } } as unknown as Registry, 'book').some((h) => h.component.id === 'feather-icons'))
})
