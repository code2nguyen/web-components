# @c2n/navigation-menu

`c2-navigation-menu` is a site navigation bar: a row of items that are either plain links or triggers opening a panel
of `c2-navigation-menu-link` rows below the bar.

```html
<c2-navigation-menu aria-label="Main">
  <c2-navigation-menu-item value="products">
    Products
    <div class="grid" slot="panel">
      <c2-navigation-menu-link href="/analytics">Analytics<span slot="description">Realtime dashboards</span></c2-navigation-menu-link>
      <c2-navigation-menu-link href="/warehouse">Warehouse<span slot="description">Columnar storage</span></c2-navigation-menu-link>
    </div>
  </c2-navigation-menu-item>
  <c2-navigation-menu-item value="docs" href="/docs">Docs</c2-navigation-menu-item>
  <c2-navigation-menu-item value="pricing" href="/pricing" current>Pricing</c2-navigation-menu-item>
</c2-navigation-menu>
```

- `value` is the item whose panel is open (`''` when closed) and `value-change` reports every change; `open(value)` and
  `close()` drive it from code.
- Panels open on hover after `open-delay` and close `close-delay` after the pointer leaves both the item and the panel.
  `open-on="click"` ignores hover entirely. `panel-anchor="menu"` lines every panel up with the bar for mega panels.
- Items: `href`, `target`, `current` (`aria-current="page"` plus the indicator line), `disabled`, `placement`, and the
  `panel` slot that turns the item into a trigger.
- A trigger follows its panel: while one of its rows is the current page (`current`, or any `aria-current`), the item
  sets `current-group` on itself and takes the `__current` styling, so the closed bar still shows the active section.
  It tracks later changes, so an SPA route change moves the group on its own.
- `mode="mobile"` swaps the row for a single button that opens the whole navigation as one hierarchy: links are rows,
  panel items are headings with their rows underneath. `collapsible` makes those groups open one at a time (the open
  one is `value`, and the list opens on the group holding the current page). The `mobile-trigger` slot replaces the
  button, `mobile-label` names the default one, and `--c2-navigation-menu__mobile-trigger--*` themes it.
- `mobile-breakpoint="800"` lets the bar switch itself at or below that viewport width; `mode` reflects, so the
  current layout is in the DOM. Leave it unset to drive `mode` yourself from whatever knows better.
- Panel width: each panel is as wide as its own content, with `--c2-navigation-menu-item__panel--min-width` (260px) as
  a floor. That variable belongs to the item — set it on the bar and every panel of that bar gets the same width.
- The panel is a `c2-overlay` popover on the top layer, so a header with `overflow: hidden` never clips it. Dismissal
  is the bar's own: a press outside it or Escape closes the panel.
- Keyboard: every item is a tab stop; ArrowLeft / ArrowRight and Home / End walk the bar (and keep browsing panels
  while one is open), ArrowDown / Enter / Space opens the panel and moves into it, Escape closes and returns focus.
- Theming: `--c2-navigation-menu--*` (the bar), `--c2-navigation-menu-item--*` (the triggers, with `__hover`,
  `__expanded`, `__current`, `__indicator` and `__panel` parts) and `--c2-navigation-menu-link--*` (the panel rows).
