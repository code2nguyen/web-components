# Description List

`c2-description-list` shows read-only label and value pairs for a detail page, in columns that wrap with the available width. Each pair is a `c2-description-item`. It ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/description-list'
```

```html
<c2-description-list aria-label="Customer">
  <span slot="heading">Customer</span>
  <c2-description-item label="Name">Ada Lovelace</c2-description-item>
  <c2-description-item label="Email">ada@example.com</c2-description-item>
  <c2-description-item label="Phone"></c2-description-item>
  <c2-description-item label="Address" style="--c2-description-item--grid-column: 1 / -1">12 St James's Square, London</c2-description-item>
</c2-description-list>
```

- `c2-description-list` slots: default (the items), `heading`, `actions`. Parts: `header`, `grid`.
- `c2-description-item` attributes: `label`, `empty-text` (default `—`, shown while the value is empty). Slots: default (the value), `label`, `actions`. Parts: `label`, `value`, `empty`, `actions`.
- Layout is CSS: `--c2-description-list__grid--columns` (most columns, default 3) and `--c2-description-list__grid--min-column-width` (default 200px) decide how many columns fit; `--c2-description-item__label--width` set to a length (`160px`) puts each label beside its value instead of above it; `--c2-description-item--grid-column: 1 / -1` makes an item span the row. Item variables set on the list apply to every item.
- Accessibility: the list is a `list`, each item a `listitem` holding a `term` and its `definition`. Give the list an `aria-label` when the page has several.
