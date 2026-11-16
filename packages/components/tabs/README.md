# @c2n/tabs

Accessible tab strip built with Lit. `c2-tabs` shows one content panel at a time; each `c2-tab` names the panel it controls with `for`.

```bash
npm install @c2n/components
```

```html
<script type="module">
  import '@c2n/components/tabs' // registers c2-tabs and c2-tab
</script>

<c2-tabs selected-tab="activity">
  <c2-tab for="overview">Overview</c2-tab>
  <c2-tab for="activity">Activity</c2-tab>
  <c2-tab for="settings" disabled>Settings</c2-tab>

  <div id="overview">…</div>
  <div id="activity">…</div>
  <div id="settings">…</div>
</c2-tabs>
```

- Children that are `<c2-tab>` become the header; every other child is a panel matched by `id` to a tab's `for`. Only the selected panel is rendered.
- Omit `selected-tab` to start on the first enabled tab. Set the `selectedTab` property (or the attribute) to switch programmatically.
- Keyboard: Left/Right arrows, Home and End move between tabs and select them (disabled tabs are skipped); Enter and Space activate the focused tab. The strip exposes `tablist` / `tab` / `tabpanel` roles with `aria-selected`, `aria-controls`, `aria-labelledby` and a roving `tabindex`.
- Events: `c2-tabs` fires `selection-change` (`detail: { value }`) after a user selection. Each `c2-tab` fires a cancelable `tab-change` (`detail: for`) first; call `preventDefault()` on it to keep the current tab.
- The selection indicator follows the selected tab and re-measures on resize and label changes. Respects `prefers-reduced-motion`.
- Code tabs: strips that share a `sync-key` switch together. Picking a tab selects the tab with the same label in every strip with that key, and the choice is remembered in `localStorage` (`c2n-tabs:<sync-key>`).

## Tab nav

`c2-tab-nav` (`import '@c2n/components/tabs/tab-nav'`) is a row of tabs that are links between pages. It is a navigation landmark holding a list of `<c2-tab href="…">` links; mark the page being shown with `current` (`aria-current="page"`). There are no panels and no arrow keys: every link is a Tab stop. The indicator is the current tab's bottom border, drawn with CSS, and a strip too narrow for its tabs scrolls sideways with faded edges.

```html
<c2-tab-nav aria-label="Repository">
  <c2-tab href="/code" current>Code</c2-tab>
  <c2-tab href="/issues">Issues</c2-tab>
  <c2-tab href="/settings">Settings</c2-tab>
</c2-tab-nav>
```

Its variables are `--c2-tab-nav--*`, `--c2-tab-nav__tab--*`, `--c2-tab-nav__tab__{hover,current,focus}--*` and `--c2-tab-nav__indicator--*`.

Theming goes through CSS custom properties (`--c2-tabs--*`, `--c2-tabs__tab--*`, `--c2-tabs__tab__{hover,selected,focus,disabled}--*`, `--c2-tabs__indicator--*`). The full list is in `custom-elements.json` and on the docs site.
