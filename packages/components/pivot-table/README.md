# Pivot Table

`c2-pivot-table` ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/pivot-table'
```

```html
<c2-pivot-table rows="region;country" columns="quarter" values='[{"field":"revenue"}]'></c2-pivot-table>
```

Groups flat rows by the fields on `rows` and `columns` and aggregates `values` in every cell.

- Aggregates `sum`, `count`, `avg`, `min`, `max` and `distinct`, with `Intl.NumberFormat` options per value.
- Expandable row groups with subtotals, grand totals, sorting by column, and a `heatmap`.
- `configurable` adds a field list to drag fields between rows, columns and values; `pivot-change` gives the layout.
- `cell-click` gives the records behind a cell; `toCSV()` exports; `pivot()` is the computation as a function.
- Colours and spacing are `--c2-pivot-table*` custom properties; see the API page of the docs site.
