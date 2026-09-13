# @c2n/virtual-list

`<c2-virtual-list>` renders only the rows you can see. It windows `items` to the visible range plus an overscan
margin, so 50 000 rows cost the same DOM as twenty — and every visible row is a real `c2-list-item`, so the markup,
slots, selection styling and theming are the ones you already know from `c2-list`.

```bash
npm install @c2n/virtual-list
```

```html
<c2-virtual-list
  style="height: 320px"
  aria-label="People"
  searchable
  highlight
  selection="single"
  item-key="id"
  label-field="name"
  description-field="team"
></c2-virtual-list>
```

```js
import '@c2n/virtual-list'

const list = document.querySelector('c2-virtual-list')
list.items = people
list.addEventListener('selection-change', (event) => console.log(event.detail.value, event.detail.items))
```

- **Search** — `searchable` adds a field above the list; `search` is also a plain property, so an external input can
  drive it. `search-fields` narrows what a query is matched against, `matcher` replaces the matching outright,
  `min-search-length` and `search-debounce` tune when it runs, and `highlight` wraps what matched in `<mark>`.
- **Sorting** — `sort="score:desc"`, or the `sort` property with an optional `comparator`, orders the rows.
- **Selection** — `selection="single|multiple"` with `value` as the array of keys; ⌘/Ctrl-click toggles, shift-click
  extends, ⌘/Ctrl-A selects everything. `item-key` decides identity.
- **Async data** — set `dataSource` to `{ getItems({ start, count, search, sort }) }` and the list holds nothing: it
  asks for one `block-size` block at a time as rows scroll into view, and hands the query and the sort to the server.
  Rows whose block has not arrived render as skeletons.
- **Keyboard and a11y** — the rows are a `listbox` of `option`s with a roving tab stop, `aria-posinset`/`aria-setsize`
  (most rows are not in the DOM), arrow keys, Home/End, PageUp/PageDown and Enter/Space. Set `aria-label` on the host
  to name the list.

Give the host a height (or `--c2-virtual-list--max-height`). Windowing needs a **uniform** row height, which comes
from `--c2-virtual-list__item--height` and is re-measured from the first rendered row; `item-height` is only the
first-paint estimate. Two-line rows have to raise the variable.

Theming is the usual `--c2-virtual-list__<part>--<property>` set: the root box, `search--*` and `search-field--*`
(which drive the composed `c2-text-field`), `item--height`, `highlight--*`, `skeleton--*`,
`state--*` and `footer--*`. Everything inside a row is themed through `c2-list-item`'s own variables.
