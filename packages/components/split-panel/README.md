# @c2n/split-panel

Split panel built with Lit: two panels separated by a divider the user drags (or moves with the keyboard) to resize them.

```bash
npm install @c2n/split-panel
```

```html
<script type="module">
  import '@c2n/split-panel'
</script>

<c2-split-panel position="30" primary="start" style="height: 400px">
  <nav slot="start">Files</nav>
  <main slot="end">Editor</main>
</c2-split-panel>
```

- **Position**: `position` is the start panel's share in percent (`50` by default), bounded by `min`/`max`. `orientation="vertical"` stacks the panels; the host then needs a height.
- **Input**: drag the divider with a mouse, touch or pen; or focus it and use the Arrow keys (1%, Shift for 10%), Home/End (`min`/`max`) and Enter (collapse the start panel to `min`, then restore it). The divider is a focusable `separator` following the WAI-ARIA window splitter pattern; `label` names it. Right-to-left contexts mirror the keys and the drag.
- **Snapping**: `snap="25 50 75"` makes a drag stick to those positions within `snap-threshold` pixels (12 by default).
- **Resizing**: `primary="start"` (or `end`) keeps that panel's pixel size when the host changes size, for a sidebar that should not grow with the window.
- **Events**: `reposition` with `detail.position` whenever the user moves the divider. It does not bubble, so nested split panels do not hear each other.
- **Nesting**: put a second `c2-split-panel` in a slot for a three-way layout.

Theme it with the `__divider` group (`--c2-split-panel__divider--size`, `--hit-area`, `--background` and its `__hover`, `__active`, `__focus` and `__disabled` states), the `__handle` grip (`--c2-split-panel__handle--display: none` hides it) and the `__panel`, `__start` and `__end` variables. The full list is in `custom-elements.json` and on the docs site.
