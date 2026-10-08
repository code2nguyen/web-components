# Filter Builder

`c2-filter-builder` ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/filter-builder'
```

```js
const filters = document.querySelector('c2-filter-builder')
filters.fields = [
  { id: 'status', label: 'Status', type: 'enum', options: [{ value: 'doing', label: 'In progress', color: '#0265dc' }] },
  { id: 'due', label: 'Due', type: 'date' },
]
filters.addEventListener('filter-change', (event) => console.log(event.detail.value))
// { op: 'and', rules: [{ field: 'status', operator: 'eq', value: 'doing' }] }
```

A filter bar of chips that read as sentences (`Status | is any of | In progress, In review`), an add-filter picker and an
editor for each part of a condition. `fields` describes what can be filtered (`enum`, `person`, `multi`, `text`,
`number`, `date`, `boolean` or `custom`); `value` is a plain JSON tree of option values that the component reports on
every `filter-change` and never applies itself. Options carry their look as data (`color`, `icon`, `avatar`,
`description`, `count`), and `renderOption`, `renderValue` and `renderEditor` replace a row, the chip's value or the
editor. `loadOptions(query, signal)` loads options from a server. Below `compact-below` pixels the bar turns into a
Filters button that opens a bottom sheet.
