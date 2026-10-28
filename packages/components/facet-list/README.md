# Facet List

`c2-facet-list` ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/facet-list'
```

```html
<c2-facet-list label="Service" values='[{"value":"checkout","count":12400},{"value":"search","count":8100}]'></c2-facet-list>
```

One facet of a filter sidebar, like Datadog's: an attribute's values with counts, a checkbox to include a value, Only to
make it the only one, and Exclude to filter it out.

- `values`: `{ value, label, count }[]`; `include` / `exclude`: the selection.
- Each change fires a cancelable `filter-change` with the selection about to be set.
- `searchable`, `max-items`, `sort`, `count-format`; the title collapses the facet (`open`).
- Themed through `--c2-facet-list*` custom properties; see the API page of the docs site.
