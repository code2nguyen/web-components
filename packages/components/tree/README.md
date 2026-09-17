# @c2n/tree

Hierarchical tree view with expansion, selection, checkbox selection and lazy loading, built with Lit.

```bash
npm install @c2n/tree
```

```html
<script type="module">
  import '@c2n/tree'
</script>

<c2-tree aria-label="Files" expanded-items="src" value="app">
  <c2-tree-item value="src" label="src">
    <c2-tree-item value="app" label="app.ts"></c2-tree-item>
    <c2-tree-item value="main" label="main.ts"></c2-tree-item>
  </c2-tree-item>
  <c2-tree-item value="readme" label="README.md"></c2-tree-item>
</c2-tree>
```

- **Two authoring modes, one result**: nest `c2-tree-item` elements as above, or set `items` to an array of
  `{ value, label, children?, disabled?, hasChildren?, data? }` nodes and the tree renders the same elements
  itself. Both produce identical DOM and the same events, so a docs example and a data-driven app agree.
- **The tree owns the state**: `value` holds the selected rows and `expanded-items` the expanded ones, both
  `;`-separated in the attribute and arrays in the property. Every row's `level`, `expanded`, `selected`,
  `indeterminate` and roving `tabindex` are written from the tree on each sync — drive the two arrays, not the
  rows.
- **Expansion**: the toggle opens a branch. `expand-on-click` widens that to the whole row — and to Enter and
  Space — which is what a navigation tree wants, where a branch row is a heading with nothing to select. A leaf
  is never a branch, so a row that is only a link still just follows it.
- **Selection**: `selection` is `none`, `single` or `multiple`. `checkbox-selection` adds a `c2-checkbox` per
  row and implies `multiple`; `selection-propagation` (`none` | `descendants` | `parents` | `both`) controls how
  far a tick travels, and a partly-selected branch is left indeterminate. Disabled rows are never selected by a
  relative and are left out of the tally, so a branch is not stuck half-ticked by a row nobody can click.
- **Lazy loading**: mark a branch `has-children` and set `loadChildren` to a promise-returning function. The row
  shows a `c2-spinner` while it runs, a rejection fires `item-load-error` and the branch stays retryable. When
  authoring in markup, listen for `item-expand` and append the children yourself instead.
- **Keyboard**: a `tree` with a roving `tabindex`. Arrow Up/Down walk the visible rows, Arrow Right expands then
  descends, Arrow Left collapses then ascends, Home/End jump to the ends, Enter and Space select, `*` expands
  the focused row's siblings, and typing jumps to a matching row. Shift extends a range and Ctrl/Cmd toggles.
- **Cost**: only expanded rows render their children slot, so a collapsed subtree is not laid out and stays
  out of the accessibility tree. The elements are still created, so a tree of many thousands of rows wants
  virtualization rather than this component.

`selection-change` and `expansion-change` do not bubble — several components fire `selection-change`, so listen
on the tree itself rather than an ancestor.

Theming: `--c2-tree--*` for the container and `--c2-tree-item--*` for the rows, which inherit through the tree.
`row--indent`, `row--border-radius` and `guide--color` do most of the work: set `row--border-radius: 0` for the
edge-to-edge bands of a layers panel, and `actions--opacity: 1` to stop the trailing actions hiding until hover.
The full list is in `custom-elements.json` and on the docs site.
