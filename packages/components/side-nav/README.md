# @c2n/side-nav

`c2-side-nav` is an app-shell layout with a navigation drawer beside the page content. It pushes the content on large screens (`side` mode) and slides over it with a backdrop on small ones (`over` mode), switching automatically at 600px and 960px.

```html
<c2-side-nav opened style="height: 100dvh">
  <nav slot="side-nav-content">…</nav>
  <main>
    <button side-nav-toggle>Menu</button>
    …
  </main>
</c2-side-nav>
```

- Attributes: `opened`, `desktop-mode` / `tablet-mode` (`side` | `over`), `responsive-tablet`, `position` (`start` | `end`).
- Any element with a `side-nav-toggle` attribute anywhere inside (page header or drawer) toggles the drawer; `toggle()` does the same from code. A non-zero `--c2-side-nav__close--width` gives an icon rail; hide labels with `c2-side-nav:not([opened]) .label { display: none }`.
- Event: `opened-change` (`detail.opened`) for user and breakpoint driven changes.
- Over mode: backdrop, page scroll lock, Escape to close, dialog semantics and focus management. Set `--c2-side-nav__over--position: absolute` to keep it inside a positioned parent.
- Theming: `--c2-side-nav--*` (widths, background, padding, borders, radius, transition), `__divider--*`, `__over--*`, `__backdrop--*`, `__scrollbar--color`.
