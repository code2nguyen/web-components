# @c2n/sheet

Sheet built with Lit: a dialog pinned to an edge of the screen, for content that complements the page rather than interrupting it.

```bash
npm install @c2n/sheet
```

```html
<script type="module">
  import '@c2n/sheet'
</script>

<button onclick="document.getElementById('filters').show()">Filters</button>

<c2-sheet id="filters">
  <span slot="title">Filters</span>
  <p>Anything that belongs beside the page rather than over it.</p>
  <button slot="footer" onclick="this.closest('c2-sheet').close('applied')">Apply</button>
</c2-sheet>
```

- **Edges**: `side="right"` (default), `left`, `top` or `bottom`. The panel spans its edge and slides in from off-screen; `--c2-sheet--size` is the width of a left/right sheet and the height of a top/bottom one, and the other axis fills the screen.
- **Dialog behaviour**: built on the native `<dialog>` opened with `showModal()`, so focus is trapped and restored, the page behind is inert and covered by a backdrop, and Escape closes. `hide-close`, `no-backdrop-close`, `no-escape` and `no-scroll-lock` each opt out of one piece.
- **Structure**: `title` slot (it labels the sheet; `label` names one without a visible heading), the default slot for the body, `footer` for actions. Only the body scrolls, so the header and footer stay put in a full-height panel.
- **Events**: `open` after showing, `close` with `detail.returnValue`, and the native cancelable `cancel` on Escape.
- **Nesting**: a sheet can hold another overlay. The page scroll lock is shared through `@c2n/core`, and each overlay only reacts to its own dialog's events, so closing an inner confirm leaves the sheet standing and the page locked.

Theme it with `--c2-sheet--size`, `--c2-sheet--border-radius` (the two corners facing the page), `--c2-sheet--background`, `--c2-sheet--color`, `--c2-sheet--box-shadow`, `--c2-sheet--transition-duration` and the `__header`, `__body`, `__footer`, `__close` and `__backdrop` groups — the same names [`@c2n/modal`](../modal) uses, so a dialog and a sheet can be themed together. The full list is in `custom-elements.json` and on the docs site.

Use [`@c2n/modal`](../modal) when the page must stop for a decision, and [`@c2n/side-nav`](../side-nav) when the panel is navigation that is part of the layout rather than a transient overlay.
