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

- `c2-description-list` attributes: `value-labels`, `label-heading`. Slots: default (the items), `heading`, `actions`. Parts: `header`, `value-header`, `grid`.
- `c2-description-value`: one value of a multi-value item. Part `caption` (the column name, shown while stacked), `content`.
- `c2-description-item` attributes: `label`, `empty-text` (default `—`, shown while the value is empty). Slots: default (the value), `label`, `actions`. Parts: `label`, `value`, `empty`, `actions`.
- Several values per label: put one `c2-description-value` per value in the item. They line up in columns across the items; `value-labels="Starter;Pro;Enterprise"` on the list names them in a header row and `label-heading` heads the label column. When the label and the columns do not fit on one line the columns move under the label; when the columns themselves are narrower than `--c2-description-item__value-column--min-width` (120px) the values stack, each with its column name as a caption, and the header hides.

```html
<c2-description-list aria-label="Plans" value-labels="Starter;Pro;Enterprise" style="--c2-description-item__label--width: 140px">
  <c2-description-item label="Price">
    <c2-description-value>€0</c2-description-value>
    <c2-description-value>€20</c2-description-value>
    <c2-description-value>Custom</c2-description-value>
  </c2-description-item>
</c2-description-list>
```

- Layout is CSS: `--c2-description-list__grid--columns` (most columns, default 3) and `--c2-description-list__grid--min-column-width` (default 200px) decide how many columns fit; `--c2-description-item__label--width` set to a length (`160px`) puts each label beside its value instead of above it; `--c2-description-item--grid-column: 1 / -1` makes an item span the row. Item variables set on the list apply to every item.
- Accessibility: the list is a `list`, each item a `listitem` holding a `term` and its `definition`. Give the list an `aria-label` when the page has several.
