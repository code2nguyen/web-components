# @c2n/menu

`c2-menu` is a menu of commands: a trigger plus a popover of `c2-menu-item` rows, positioned by `c2-overlay` on the
browser's top layer.

```html
<c2-menu aria-label="File">
  <button slot="trigger">Actions</button>
  <c2-menu-item value="new">New file<kbd slot="shortcut">⌘N</kbd></c2-menu-item>
  <c2-menu-item value="rename" disabled>Rename</c2-menu-item>
  <hr />
  <c2-menu-item value="delete" destructive>Delete file</c2-menu-item>
</c2-menu>
```

- The trigger goes in the `trigger` slot, or stays anywhere on the page and is named by `anchor` (an element id).
- Rows are `c2-menu-item` children: a command, a link (`href`), a `checkbox` or `radio` (`type` + `checked`, radios
  grouped by `name`), or the parent of a nested `c2-menu` slotted into `submenu`. `<hr>` separates, `<h1>`–`<h6>` head
  a group.
- `menu-select` bubbles from the activated row with `detail.value`, `detail.checked` and `detail.data`; the menu then
  closes unless it (or that row) is marked `keep-open`.
- `open`, `placement`, `fit-anchor`, `disabled`, plus `show()`, `hide()` and `toggle()`.
- Width: as wide as the rows, with `--c2-menu--min-width` (128px) as a floor, and never narrower than a slotted
  trigger. `fit-anchor` pins it to exactly the trigger's width.
- Keyboard: Enter / Space / ArrowDown opens on the first row (ArrowUp on the last); arrows, Home / End and typeahead
  move; ArrowRight and ArrowLeft enter and leave a submenu; Escape and Tab close and restore focus to the trigger.
- Theming: `--c2-menu--*` (surface), `--c2-menu__separator--*`, `--c2-menu__heading--*`, and `--c2-menu-item--*` for
  the rows. See the docs site for the full list.
