import { html } from 'lit'
import '../src/autocomplete'
import type { Autocomplete } from '../src/autocomplete'

const scenario = new URLSearchParams(location.search).get('scenario') ?? 'local'
const main = document.querySelector('main')!
main.innerHTML = `<form><c2-autocomplete id="subject" name="destination" aria-label="Search destinations" placeholder="Search…"></c2-autocomplete></form>`

const subject = document.querySelector<Autocomplete>('c2-autocomplete')!
subject.itemKey = 'value'
subject.labelField = 'label'
subject.descriptionField = 'description'
subject.disabledField = 'disabled'

const suggestions = [
  { value: 'paris', label: 'Paris', description: 'France' },
  { value: 'paris-texas', label: 'Paris', description: 'Texas, United States' },
  { value: 'cdg', label: 'Charles de Gaulle Airport', description: 'Paris, France' },
  { value: 'disabled', label: 'Paris private terminal', disabled: true },
]

if (scenario === 'local' || scenario === 'form') subject.suggestions = suggestions

if (scenario === 'preserve') {
  subject.selectionBehavior = 'preserve'
  subject.suggestions = suggestions
}

if (scenario === 'remote') {
  subject.debounce = 0
  subject.dataSource = async (query, signal) => {
    subject.dataset.request = query
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, query === 'p' ? 120 : 10)
      signal.addEventListener('abort', () => {
        clearTimeout(timer)
        subject.dataset.aborted = query
        reject(new DOMException('Aborted', 'AbortError'))
      })
    })
    return suggestions.filter((item) => item.label.toLowerCase().includes(query.toLowerCase()))
  }
}

if (scenario === 'empty') {
  subject.showEmpty = true
  subject.suggestions = suggestions
}

if (scenario === 'disabled') {
  subject.disabled = true
  subject.suggestions = suggestions
}

if (scenario === 'custom') {
  interface CustomItem {
    id: number
    code: string
    profile: { name: string; team: string }
  }
  subject.itemKey = 'id'
  subject.labelField = 'profile.name'
  subject.descriptionField = 'profile.team'
  subject.searchFields = ['profile.name', 'profile.team', 'code']
  subject.suggestions = [
    { id: 7, code: 'AL', profile: { name: 'Ada Lovelace', team: 'Platform' } },
    { id: 9, code: 'GH', profile: { name: 'Grace Hopper', team: 'Compilers' } },
  ] satisfies CustomItem[]
  subject.renderItem = ({ item }) => {
    const result = item as CustomItem
    return html`<strong>${result.code}</strong><span>${result.profile.name}</span><span slot="description">${result.profile.team}</span>`
  }
  subject.innerHTML = `<div slot="header">People directory</div><div slot="footer">View all people</div>`
}

subject.addEventListener('suggestion-select', (event) => {
  subject.dataset.selected = JSON.stringify(event.detail)
})
subject.addEventListener('query-change', (event) => {
  subject.dataset.query = event.detail.query
})

await subject.updateComplete
main.dataset.ready = 'true'
