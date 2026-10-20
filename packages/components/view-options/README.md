# View Options

`c2-view-options` is the "Display" popover of a collection: layout, grouping and sub-grouping, ordering on several
levels, Show switches and the properties each item shows. It holds no data and renders no items. It edits one
`ViewOptionsValue` and fires `view-change`; the app applies the value to whatever draws the collection (`orderBy` has
the shape of `c2-table`'s `sortModel`).

It ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/view-options'
```

```html
<c2-view-options layouts="list board table" value='{"groupBy":"status"}'>
  <c2-view-field field="status" label="Status" groupable orderable property></c2-view-field>
  <c2-view-field field="priority" label="Priority" groupable orderable property></c2-view-field>
  <c2-view-toggle key="completed" label="Completed issues"></c2-view-toggle>
</c2-view-options>
```

Fields can also be set as an array (`options.fields = [{ id, label, groupable, orderable, property }]`), which replaces
the `c2-view-field` children; `toggles` does the same for `c2-view-toggle`. See the docs site for every attribute,
event and CSS custom property.
