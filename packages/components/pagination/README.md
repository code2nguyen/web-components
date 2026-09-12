# @c2n/pagination

Pagination built with Lit: page navigation for a list, a table or search results, in three layouts.

```bash
npm install @c2n/pagination
```

```html
<script type="module">
  import '@c2n/pagination'
</script>

<!-- Numbered: previous/next around the page numbers -->
<c2-pagination total-items="240" page-size="10" page="4"></c2-pagination>

<!-- Simple: previous/next around a page status -->
<c2-pagination variant="simple" total-pages="12" page="3"></c2-pagination>

<!-- Compact: the table-footer row -->
<c2-pagination variant="compact" total-items="100" page-size="10" page="3"></c2-pagination>
```

```js
document.querySelector('c2-pagination').addEventListener('page-change', (event) => {
  const { startIndex, endIndex } = event.detail
  render(rows.slice(startIndex, endIndex))
})
```

- **Variants**: `numbered` (default), `simple` and `compact`. `hide-nav-labels` keeps the chevrons and drops the visible "Previous"/"Next" text, and `hide-page-size` / `hide-range` strip the compact row down.
- **Range**: `total-items` + `page-size`, or `total-pages` when the item count is unknown. The element owns `page`, reflects it and clamps it, so listening to `page-change` is enough.
- **Numbers shown**: `boundary-count` (default `1`) pins numbers at each end, `sibling-count` (default `1`) surrounds the current page; the rest collapses into an ellipsis, and an ellipsis standing for a single page is replaced by that page, so the row keeps the same number of slots as the current page moves.
- **Ellipsis**: a button, not decoration — it jumps into the middle of the pages it hides (`1 … 9` jumps to 5) and shows the direction on hover and focus. `jump-label-template` names it.
- **One row**: the controls never wrap. Numbers that do not fit the host's width are shed (siblings first, then boundaries) and come back when the container grows; only the three groups of the `compact` variant may drop onto a second line. Because `boundary-count="1"` keeps the first and last page one click away, `show-first-last` is for `simple` and `compact` — or for `boundary-count="0"`.
- **Rows per page**: the `compact` variant uses a `c2-select` (registered by this package) fed by `page-size-options`. Picking another size keeps the first item of the current page on screen and fires `page-size-change`.
- **Inside a `c2-table`**: slotted into the table's `footer` the pager becomes a controlled view — the table owns `page`, `page-size` and `total-items` and feeds them through the `@c2n/core` pager context, so nothing needs wiring up. Anywhere else it keeps managing its own state.
- **Events**: `page-change` (`page`, `previousPage`, `pageSize`, `pageCount`, `startIndex`, `endIndex`) and `page-size-change` (`pageSize`, `previousPageSize`, `page`).
- **Text**: every label is an attribute — `previous-label`, `next-label`, `first-label`, `last-label`, `page-size-label` — plus `range-template` (`{start}`, `{end}`, `{total}`), `page-template` (`{page}`, `{pageCount}`), `page-label-template` (`{page}`) and `jump-label-template` (`{page}`, `{from}`, `{to}`, `{count}`).
- **Accessibility**: a `nav` landmark named "Pagination" (`aria-label` overrides), `aria-current="page"` on the current number, polite live regions for the status text, and focus handed to the opposite control when the one just pressed reaches an end.

`--c2-pagination__item--*` styles the page numbers (`__selected` the current one), `--c2-pagination__nav--*` the previous/next/first/last controls, `--c2-pagination__label--*` the status text and rows-per-page label, and `--c2-pagination--justify-content` places the row in the host's width. The rows-per-page select wears those same variables. The full list is in `custom-elements.json` and on the docs site.
