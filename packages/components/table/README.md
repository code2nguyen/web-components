# @c2n/table

`c2-table` is a virtualized data grid: one CSS grid whose header and body rows are `subgrid` items, so columns stay aligned with no scroll syncing and pinned columns are sticky cells rather than separate containers. Columns are declared as `c2-table-column` children — definitions that render nothing themselves.

```html
<c2-table row-key="id" sortable stripe selection="multiple" checkbox-selection style="height: 320px" rows='[{ "id": "1", "name": "Ada", "score": 128000 }]'>
  <c2-table-column field="name" header="Name" width="2fr" pinned="start"></c2-table-column>
  <c2-table-column field="score" header="Score" width="120px" align="end" format="number"></c2-table-column>
</c2-table>
```

- Rows come from `rows` (an array in the property, JSON in the attribute) or from an async `dataSource` that is asked for one block at a time as rows scroll into view.
- Columns: `field` (dotted paths allowed), `header`, `width` (any grid track), `min-width`, `align`, `sortable`, `resizable`, `pinned="start|end"`, `hidden`, `format` (`number`, `percent`, `currency`, `date`, `datetime`, `time`) with `format-options` / `currency` / `locale`, `cell-class`, and the `renderCell` / `renderHeader` / `comparator` properties.
- Table: `selection="single|multiple"`, `checkbox-selection`, `value` (selected row keys), `sort` (`field:asc;other:desc`), `multi-sort`, `sortable`, `resizable`, `stripe`, `virtual="auto|always|never"`, `row-height`, `overscan`, `virtual-threshold`, `block-size`, `page`, `page-size`, `loading`, `error`, `empty-message`.
- **Paging**: slot a `c2-pagination` into `footer` and the table pages, driving the pager's `page` / `page-size` / `total-items` through the `@c2n/core` pager context. `page-size` turns it on, or the table adopts the pager's. `rows` are sliced in place; a `dataSource` is asked for one page per request. `@c2n/pagination` is not a dependency — install it yourself.
- Events: `selection-change`, `sort-change`, `row-click`, `cell-click`, `column-resize`, `page-change`. Slots: `toolbar`, `footer`, `empty`, `loading`, `error`.
- Keyboard: arrows walk cells, Home/End and ⌘/ctrl+Home/End jump, PageUp/PageDown page, Enter sorts the focused column, Space selects the focused row.
- Theming: `--c2-table--*` (surface), `--c2-table__header--*` / `__header-cell--*`, `--c2-table__row--*` (plus `__hover`, `__selected`, `__odd`), `--c2-table__cell--*`, `--c2-table__sort-icon--*`, `--c2-table__resizer--*`. See the docs site for the full list.

Virtualization needs a uniform row height: it measures the first rendered row, so theme the height with `--c2-table__row--height` (`row-height` is only the estimate used for the first paint), and give the host a height or `--c2-table--max-height`.
