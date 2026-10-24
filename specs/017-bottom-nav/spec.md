# Feature: `c2-bottom-nav` — the mobile tab bar

**Status**: Implemented (`packages/components/bottom-nav`)
**Roadmap**: #66, section D, P2
**Research**: [research.md](./research.md)
**Mock**: [c2-bottom-nav mock](https://claude.ai/artifact/YM7h3MdDLDoDLYbmbuexxj) — anatomy, four looks, label modes, item states, four in-context screens (banking, mail, photos, calendar) and an interactive prototype with hide-on-scroll, a cancelled switch and an event log.
**Related**: `c2-badge` (the count / dot), `c2-navigation-menu-item` (same link names: `href`, `target`, `current`), `c2-app-shell` spec 016 (its `footer` slot is where this goes), `c2-side-nav` (the wide-screen counterpart).

## Problem

Every mobile web app draws the same bar: three to five destinations at the bottom, an icon over a short label, a count on Inbox. Built by hand it is usually a `div` of buttons with no landmark, a current state that is only a colour, a badge a screen reader never hears, content hidden under the home indicator, and a `position: fixed` that covers the last row of the page.

## Goals

1. A navigation landmark of links (`aria-current="page"` on the current one), named "Main" by default; never a tablist.
2. Equal-width items, icon over label, a count or dot badge read as part of the name ("Inbox, 3 new").
3. A current state that is not colour-only: an indicator shape behind the icon plus an optional filled icon (`current-icon` slot).
4. Placement that just works: `position: sticky; bottom: 0` by default (no placeholder needed), padding for `env(safe-area-inset-bottom)`.
5. `label-visibility` like Material 3 (`labeled` default, `auto`, `selected`, `unlabeled`).
6. Opt-in `hide-on-scroll` (iOS minimise / M3 hide): away while scrolling down, back on scroll up, at the top, or when focus enters.
7. A cancelable `item-select` (unsaved-changes guard), `change`, and `reselect` (tap the current item: scroll to top).
8. Looks as CSS only: Material (default), glass, floating dock, top line, horizontal items on tablets.
9. Server-renders with no host attributes written; built-in text localisable.

Non-goals: disabled items (HIG: never disable a tab), a built-in "More" overflow, a rail mode for wide windows (the app swaps to `c2-side-nav` with a media query), hiding for the on-screen keyboard.

## Usage

```html
<c2-bottom-nav value="home" hide-on-scroll>
  <c2-bottom-nav-item value="home" href="/"><c2-feather-home slot="icon"></c2-feather-home>Home</c2-bottom-nav-item>
  <c2-bottom-nav-item value="cards" href="/cards"><c2-feather-credit-card slot="icon"></c2-feather-credit-card>Cards</c2-bottom-nav-item>
  <c2-bottom-nav-item value="activity" href="/activity" count="3"><c2-feather-bell slot="icon"></c2-feather-bell>Activity</c2-bottom-nav-item>
  <c2-bottom-nav-item value="profile" href="/me" dot><c2-feather-user slot="icon"></c2-feather-user>Profile</c2-bottom-nav-item>
</c2-bottom-nav>
```

```js
nav.addEventListener('item-select', (e) => {
  if (hasUnsavedChanges) e.preventDefault()
}) // before the switch, also cancels the link
nav.addEventListener('change', () => router.go(nav.value))
nav.addEventListener('reselect', () => window.scrollTo({ top: 0, behavior: 'smooth' }))
```

## Anatomy

```
┌───────────────────── c2-bottom-nav (internals role=navigation, sticky) ─────────────────────┐
│ ┌── c2-bottom-nav-item ──┐ ┌────────────────────┐ ┌────────────────────┐ ┌────────────────┐ │
│ │ <a part="item">        │ │                    │ │      (●3) badge    │ │                │ │
│ │   ( indicator ▢ icon ) │ │      ▢ icon        │ │      ▢ icon        │ │    ▢ icon      │ │
│ │     label              │ │      label         │ │      label         │ │    label       │ │
│ └────────────────────────┘ └────────────────────┘ └────────────────────┘ └────────────────┘ │
│                       padding-bottom: env(safe-area-inset-bottom)                            │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Bar** shadow root: `<div part="bar">` (flex row) around `<slot>`. Background, border, blur, radius and margin live on `bar`, so `hide-on-scroll` can slide it out with a transform while the host keeps its place in the layout.
- **Item** shadow root: `<a part="item">` with `href`, else `<button type="button" part="item">`; inside, `<span part="indicator">` holding the icon slots and the `c2-badge` (`aria-hidden`), then `<span part="label">`. A visually hidden text after the label carries the badge's message, so the badge is part of the link's name.

## API

### `c2-bottom-nav`

| Name                 | Kind      | Default   | Notes                                                                                                                                                      |
| -------------------- | --------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `value`              | attribute | `''`      | Value of the current item. Setting it marks that item `current` (and no other). Empty: the items' own `current` decides, and `value` reads it back.        |
| `label-visibility`   | attribute | `labeled` | `labeled` · `auto` (≤ 3 items all, otherwise the current only) · `selected` · `unlabeled`. Hidden labels stay the accessible name.                         |
| `hide-on-scroll`     | attribute | `false`   | Slides the bar away while scrolling down (24px of travel), back on scroll up, at the top, or on focus.                                                     |
| `scroll-target`      | attribute | `''`      | Id of the element that scrolls (looked up in the bar's root node). Empty: the window.                                                                      |
| `scrolledAway`       | property  | `false`   | Read-only. Also exposed as `:state(scrolled-away)`.                                                                                                        |
| `item-select`        | event     |           | Cancelable, bubbles. `{ value, previous, item }`. Fired when an item other than the current one is activated. Cancelling keeps `value` and stops the link. |
| `change`             | event     |           | Bubbles. After `value` changed from an activation.                                                                                                         |
| `reselect`           | event     |           | Bubbles. `{ value, item }`. The current item was activated again (the link is still followed unless prevented by the app).                                 |
| `aria-label` on host | —         | "Main"    | Default landmark name comes from the messages; an author `aria-label` wins.                                                                                |

### `c2-bottom-nav-item`

| Name             | Kind      | Default | Notes                                                                                                       |
| ---------------- | --------- | ------- | ----------------------------------------------------------------------------------------------------------- |
| `value`          | attribute | `''`    | Identifies the item for the bar's `value`. Falls back to `href`, then the label text.                       |
| `href`, `target` | attribute |         | Renders a link.                                                                                             |
| `label`          | attribute |         | Label when the default slot is empty.                                                                       |
| `current`        | attribute | `false` | Announces `aria-current="page"`, shows the indicator and `current-icon`. Not reflected when set by the bar. |
| `count`, `max`   | attribute | —, `99` | Count badge on the icon (`0` hides it), clamped as `99+`.                                                   |
| `dot`            | attribute | `false` | Dot badge ("new activity").                                                                                 |
| slots            |           |         | `icon`, `current-icon` (shown instead of `icon` while current), default (label).                            |

### CSS variables (defaults)

Bar: `--c2-bottom-nav--position: sticky`, `--c2-bottom-nav--z-index: 10`, `--c2-bottom-nav--background: #ffffff`, `--c2-bottom-nav--border-top: 1px solid #e4e4e7`, `--c2-bottom-nav--border-radius: 0px`, `--c2-bottom-nav--box-shadow: none`, `--c2-bottom-nav--backdrop-filter: none`, `--c2-bottom-nav--margin: 0px`, `--c2-bottom-nav--padding-left/right: 0px`, `--c2-bottom-nav--padding-bottom: env(safe-area-inset-bottom, 0px)`, `--c2-bottom-nav--min-height: 64px`, `--c2-bottom-nav--max-width: none`, `--c2-bottom-nav__away--transition-duration: 0.2s`.

Item: `--c2-bottom-nav-item--flex-direction: column`, `--c2-bottom-nav-item--gap: 4px`, `--c2-bottom-nav-item--padding-*`, `--c2-bottom-nav-item--color: #71717a`, `--c2-bottom-nav-item--font-size: 12px`, `--c2-bottom-nav-item--font-weight: 500`, `--c2-bottom-nav-item__icon--size: 24px`, indicator `width 56px`, `height 32px`, `border-radius 999px`, `__hover--background`, `__active--background`, current `--color: rgb(2, 101, 220)`, `--font-weight: 600`, `__indicator--background: #edf1fe`, `__current--border-top` (top-line look), focus outline, badge offsets. Full list in the manifest.

## Behaviour details

- **Activation** is a click on an item inside the bar (pointer, Enter on a link, Enter/Space on a button). The bar listens on itself: for a non-current item it fires `item-select`; if cancelled it calls `preventDefault()` on the click so a link does not navigate; otherwise sets `value` and fires `change`. A link still navigates; an SPA router intercepting links reads `change` or its own route.
- **Modifier clicks** (ctrl/meta/shift, middle button) on a link open a new tab and do not change `value`.
- **Value ↔ current**: `value` set → items' `current` follows. No `value` → first item with `current` gives `value`. SSR-safe: the bar defers writes to an item that has a declarative shadow root until it has hydrated.
- **Label visibility** is pushed to items as a property (`labelHidden`), never an attribute.
- **Hide on scroll** listens passively; accumulates travel in one direction; away > 24px down, back > 24px up or scrollTop ≤ 0. Focus inside the bar brings it back. The slide is a transform on `part="bar"` (plus margin) and stops under `prefers-reduced-motion`.

## Accessibility

- Host: `internals.role = 'navigation'`, `internals.ariaLabel` = localised "Main" (author `aria-label` wins).
- Items: native `<a>` / `<button>`, normal tab order, `aria-current="page"` on the current one.
- Badges: `c2-badge` is `aria-hidden`; the name gets ", 3 new" / ", 99+ new" / ", new activity" (localised).
- Hidden labels are visually hidden, not removed.
- Focus ring on the indicator (`2px solid rgba(2, 101, 220, 0.4)`), forced colours use `Highlight` for the current item.

## Messages

`bottom-nav`: `navigationLabel: 'Main'`, `countLabel: (count) => '{count} new'`, `dotLabel: 'new activity'`.

## Testing

Playwright suite in `packages/components/bottom-nav/test/`: landmark + name, `aria-current` follows clicks and `value`, links navigate (hash) and a cancelled `item-select` stops them, `reselect`, `change`, badge text in the accessible name, label-visibility modes (visible vs hidden, name kept), hide-on-scroll with a scroll container and focus restore, no host attributes written, axe scan.
