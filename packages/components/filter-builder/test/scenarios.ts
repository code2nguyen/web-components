// Loaded before the filter builder so `npm run test:type-check` reads the number input's source before the declaration
// file that `@c2n/number-input` resolves to; the reverse order reports the tag map declared twice. One module at runtime.
import '../../number-input/src/number-input'
import '../src/filter-builder'
import type { FilterField, FilterGroup, FilterOption } from '../src/filter-builder'

const scenario = new URLSearchParams(location.search).get('scenario') ?? 'default'
const main = document.querySelector('main')!

const people: FilterOption[] = [
  { value: 'ana', label: 'Ana Ng' },
  { value: 'ben', label: 'Ben Kowalski' },
  { value: 'carla', label: 'Carla Ruiz' },
]

// Async people: resolved by the test through `window.resolvePeople`, so no timer decides the order.
const pending: { query: string; resolve: (options: FilterOption[]) => void }[] = []
Object.assign(window, {
  pendingQueries: () => pending.map((entry) => entry.query),
  resolvePeople: () => {
    for (const entry of pending.splice(0)) entry.resolve(people.filter((person) => person.label.toLowerCase().includes(entry.query.toLowerCase())))
  },
})

const fields: FilterField[] = [
  {
    id: 'status',
    label: 'Status',
    type: 'enum',
    options: [
      { value: 'todo', label: 'To do', color: '#a1a1aa', count: 120 },
      { value: 'doing', label: 'In progress', color: '#0265dc', count: 41 },
      { value: 'review', label: 'In review', color: '#b45309', count: 9 },
      { value: 'done', label: 'Done', color: '#15803d', count: 142 },
    ],
  },
  {
    id: 'assignee',
    label: 'Assignee',
    type: 'person',
    summary: { one: 'person', other: 'people' },
    loadOptions: (query, signal) =>
      new Promise((resolve, reject) => {
        pending.push({ query, resolve })
        signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      }),
    resolveOptions: async (values) => people.filter((person) => values.includes(person.value)),
  },
  { id: 'title', label: 'Title', type: 'text' },
  { id: 'estimate', label: 'Estimate', type: 'number', unit: 'pts' },
  { id: 'due', label: 'Due', type: 'date' },
  { id: 'blocked', label: 'Blocked', type: 'boolean' },
]

const values: Record<string, FilterGroup> = {
  applied: {
    op: 'and',
    rules: [
      { field: 'status', operator: 'in', value: ['doing', 'review'] },
      { field: 'assignee', operator: 'eq', value: 'ana' },
    ],
  },
  'many-values': { op: 'and', rules: [{ field: 'status', operator: 'in', value: ['todo', 'doing', 'review'] }] },
  group: {
    op: 'and',
    rules: [
      { field: 'status', operator: 'eq', value: 'todo' },
      {
        op: 'or',
        rules: [
          { field: 'estimate', operator: 'gt', value: 5 },
          { field: 'blocked', operator: 'is_true' },
        ],
      },
    ],
  },
  unknown: { op: 'and', rules: [{ field: 'priority', operator: 'eq', value: 'p1' }] },
}

const width = scenario === 'compact' ? 'width: 360px' : 'width: 760px'
main.innerHTML = `<c2-filter-builder id="subject" style="${width}"></c2-filter-builder><output aria-label="Tree"></output>`

const subject = document.querySelector('c2-filter-builder')!
const output = document.querySelector('output')!
subject.fields = fields
if (scenario === 'disabled') subject.toggleAttribute('disabled', true)
const initial = values[scenario] ?? (scenario === 'disabled' || scenario === 'compact' ? values.applied : undefined)
if (initial) subject.value = initial
if (scenario === 'labels') subject.labels = { addFilter: 'Filtrer', clear: 'Effacer', operators: { eq: 'est' } }
if (scenario === 'render-value') {
  fields[0].renderValue = ({ options }) => {
    const span = document.createElement('span')
    span.className = 'custom-value'
    span.textContent = options.map((option) => option.label.toUpperCase()).join(' + ')
    return span
  }
  subject.fields = [...fields]
  subject.value = values.applied
}
subject.addEventListener('filter-change', (event) => {
  output.textContent = JSON.stringify(event.detail.value)
})

await subject.updateComplete
await new Promise(requestAnimationFrame)
main.dataset.ready = 'true'
