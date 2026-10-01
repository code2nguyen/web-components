# @c2n/context-menu

`c2-context-menu` wraps an area and opens a `c2-menu` at the pointer when that area is right-clicked, long-pressed on a
touch screen, or asked for with the context-menu key or Shift+F10. Only its default-slot children open it.

```html
<c2-context-menu>
  <canvas></canvas>
  <c2-menu slot="menu" aria-label="Canvas">
    <c2-menu-item value="zoom-in">Zoom in</c2-menu-item>
    <c2-menu-item value="zoom-out">Zoom out</c2-menu-item>
  </c2-menu>
</c2-context-menu>
```

- **Static:** a `c2-menu` slotted into `menu`.
- **Dynamic:** `renderContextMenu(context)` returns the rows (a Lit template, a node or an array) for the spot that was
  clicked, or `null` to fall back to the slotted menu. With neither, the browser shows its own menu.
- `context` holds `target` (the innermost element under the pointer), `data` and `source` (what a component under the
  pointer said it stands for), `x`, `y`, `trigger` (`pointer`, `touch`, `keyboard`, `api`) and `originalEvent`.
- A wrapped `c2-table` answers with the right-clicked cell (`row`, `rowIndex`, `key`, `column`, `value`). Other
  components answer the composed `c2-context-menu-request` event with `provideContextMenuData` from
  `@c2n/core/context-menu-helper.js`.
- Events: `context-menu-open` (cancelable, before opening), `context-menu-select` (row `value`, `checked`, `data`, plus
  `context`), `toggle`.
- `disabled`, `long-press-duration` (500 ms), `menu-label`, plus `show(x, y, target?)`, `hide()`, `open` and `context`.
- A nested context menu wins over the one around it. Theme the surface with `--c2-menu--*` on this element.
