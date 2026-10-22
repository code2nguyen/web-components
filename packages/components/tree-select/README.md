# Tree Select

`c2-tree-select` ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/tree-select'
```

A dropdown for picking one or several rows from a hierarchy: a form-associated trigger and a `c2-tree` inside a
`c2-overlay` popover. Give it rows as `items` (`{ value, label, children }` nodes) or nest `c2-tree-item` elements:

```html
<c2-tree-select aria-label="Owning team" name="team" show-path placeholder="Select a team">
  <c2-tree-item value="eng" label="Engineering">
    <c2-tree-item value="platform" label="Platform"></c2-tree-item>
    <c2-tree-item value="frontend" label="Frontend"></c2-tree-item>
  </c2-tree-item>
  <c2-tree-item value="design" label="Design"></c2-tree-item>
</c2-tree-select>
```

- `multiple` keeps the dropdown open and shows chips (`max-chips`, `0` for a count); `checkbox-selection` adds the
  tree's checkboxes and `value-display` (`parent` | `leaves` | `all`) picks which ticked rows `value` holds.
- `leaf-only` lets only rows without children be picked; `searchable` filters the rows; `clearable` adds a clear
  button; `show-path` writes the selected row's ancestors in the trigger.
- `loadChildren` loads a branch's rows the first time it opens, as on `c2-tree`.
- Fires `selection-change` (`detail.value`, `detail.nodes`, does not bubble), `input` and `change`; submits under
  `name`, one entry per value when it is multiple.

The API tab of the docs site lists every attribute and CSS custom property.
