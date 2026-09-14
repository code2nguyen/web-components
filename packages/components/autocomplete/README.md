# @c2n/autocomplete

`<c2-autocomplete>` is a keyboard-accessible combobox composed from `c2-overlay`, `c2-list` and `c2-list-item`.

```bash
npm install @c2n/autocomplete
```

```html
<c2-autocomplete aria-label="Search" placeholder="Search…"></c2-autocomplete>
```

```js
import '@c2n/autocomplete'

const autocomplete = document.querySelector('c2-autocomplete')
autocomplete.suggestions = [
  { label: 'Ada Lovelace', description: 'Platform engineering' },
  { label: 'Product roadmap', description: 'Updated yesterday' },
]
autocomplete.labelField = 'label'
autocomplete.descriptionField = 'description'

autocomplete.dataSource = async (query, signal) => {
  const response = await fetch(`/api/suggestions?q=${encodeURIComponent(query)}`, { signal })
  return response.json()
}
```

As in `c2-virtual-list`, the default row reads only `labelField` and optional `descriptionField`. No other presentation fields have special meaning. For arbitrary objects, configure `itemKey`, `labelField`, `descriptionField`, `disabledField` and `searchFields`, then assign `renderItem({ item, index, search })` for richer row contents. The contents stay wrapped in a selectable `c2-list-item`.

`selection-behavior="replace"` is the default and replaces the typed value with the selected key. Use `selection-behavior="preserve"` to keep the query unchanged and communicate selection only through `suggestion-select`; clicking the input then reopens the same results.

Add `slot="header"` and `slot="footer"` content for controls or actions around the scrolling list. Listen for `suggestion-select` to receive the original item as `event.detail.item`.
