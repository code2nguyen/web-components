// component-density, default direction: a measuring page for lab/specs/scenarios/component-density.md.
// `?tag=<c2-tag>&n=<count>` loads that component's module, then the M key (or `window.mount()`) creates `n`
// instances at once and reports in #status when every one has rendered. `tag=plain` is the control: plain spans.
import '@c2n/components/theme.css'

/** How each component is loaded, and one instance of it as a person would write it. */
const COMPONENTS = {
  plain: { load: async () => {}, make: () => text('span', 'New') },
  'c2-avatar': { load: () => import('@c2n/components/avatar'), make: () => attrs('c2-avatar', { name: 'Ada Moreau' }) },
  'c2-badge': { load: () => import('@c2n/components/badge'), make: () => text('c2-badge', 'New') },
  'c2-button': { load: () => import('@c2n/components/button'), make: () => text('c2-button', 'Save') },
  'c2-card': { load: () => import('@c2n/components/card'), make: () => text('c2-card', 'A card') },
  'c2-checkbox': { load: () => import('@c2n/components/checkbox'), make: () => text('c2-checkbox', 'Accept') },
  'c2-chip': { load: () => import('@c2n/components/chip'), make: () => text('c2-chip', 'Tents') },
  'c2-feather-check': { load: () => import('@c2n/feather-icons/icons/check.js'), make: () => attrs('c2-feather-check', {}) },
  'c2-format-number': { load: () => import('@c2n/components/format-number'), make: () => attrs('c2-format-number', { value: '1234.5' }) },
  'c2-highlight': { load: () => import('@c2n/components/highlight'), make: () => attrs('c2-highlight', { query: 'res' }, 'Search result') },
  'c2-icon-button': { load: () => import('@c2n/components/icon-button'), make: () => attrs('c2-icon-button', { 'aria-label': 'Edit' }) },
  'c2-list-item': { load: () => import('@c2n/components/list-item'), make: () => text('c2-list-item', 'An item') },
  'c2-progress': { load: () => import('@c2n/components/progress'), make: () => attrs('c2-progress', { value: '40', 'aria-label': 'Upload' }) },
  'c2-radio': { load: () => import('@c2n/components/radio'), make: () => text('c2-radio', 'Option') },
  'c2-relative-time': { load: () => import('@c2n/components/relative-time'), make: () => attrs('c2-relative-time', { date: '2026-01-01T00:00:00Z' }) },
  'c2-select': {
    load: () => import('@c2n/components/select'),
    make: () => {
      const select = attrs('c2-select', { 'aria-label': 'Size', value: 's' })
      for (const [value, label] of [
        ['s', 'Small'],
        ['m', 'Medium'],
        ['l', 'Large'],
      ])
        select.append(attrs('c2-list-item', { value }, label))
      return select
    },
  },
  'c2-switch': { load: () => import('@c2n/components/switch'), make: () => text('c2-switch', 'Wi-Fi') },
  'c2-text-field': { load: () => import('@c2n/components/text-field'), make: () => attrs('c2-text-field', { 'aria-label': 'Name' }) },
}

function text(tag, content) {
  const element = document.createElement(tag)
  element.textContent = content
  return element
}

function attrs(tag, attributes, content) {
  const element = document.createElement(tag)
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value)
  if (content) element.textContent = content
  return element
}

const params = new URLSearchParams(location.search)
const tag = params.get('tag') ?? 'plain'
const count = Number(params.get('n') ?? 1000)
const status = document.getElementById('status')
const component = COMPONENTS[tag]

async function mount() {
  const root = document.getElementById('root')
  const fragment = document.createDocumentFragment()
  for (let index = 0; index < count; index++) fragment.append(component.make())
  root.append(fragment)
  // Rendered: every instance's (and every nested component's) first update done, then two frames painted.
  const all = [root, ...root.querySelectorAll('*')].filter((element) => element.updateComplete)
  await Promise.all(all.map((element) => element.updateComplete))
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  status.textContent = `Mounted ${count} ${tag}`
}

window.mount = mount
if (!component) {
  status.textContent = `Unknown component ${tag}. Known: ${Object.keys(COMPONENTS).join(', ')}`
} else {
  await component.load()
  status.textContent = `Ready: ${tag}`
  document.addEventListener('keydown', (event) => {
    if (event.key === 'm') mount()
  })
}
