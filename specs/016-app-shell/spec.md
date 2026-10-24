# Feature: `c2-app-shell` and `c2-page-header` — the frame of an app and the top of each page

**Status**: Proposed
**Roadmap**: #57 and #58, section D, P1
**Research**: [research.md](./research.md)
**Mock**: [c2-app-shell mock](https://claude.ai/artifact/PQgz6gegX8J4ByoctSR4X1) — anatomy, an interactive prototype at 1280 / 834 / 390 px (layouts, navigation modes, condensed page header, folded actions, event log), page header variants, API sketch.
**Related**: `c2-side-nav` (drawer behaviour, shared through a new controller), `c2-header` (goes in the shell's header slot), `c2-breadcrumb`, `c2-menu` (folded actions), `c2-split-button`, `c2-skip-link`, `c2-banner`. Later: `c2-bottom-nav` (#66), `c2-overflow-list` (#62).

Two packages, specified together because they are designed together; they do not depend on each other.

| Package                                                | Elements                              |
| ------------------------------------------------------ | ------------------------------------- |
| `@c2n/app-shell` (`packages/components/app-shell`)     | `c2-app-shell`, `c2-app-shell-toggle` |
| `@c2n/page-header` (`packages/components/page-header`) | `c2-page-header`                      |

## Decisions taken

From the review of the research (2026-10-24):

1. **Breakpoints come from the component's own width**, not the window. Layout follows CSS container queries on the host (so it is right on the server-rendered first paint); behaviour (modal drawer, focus trap) follows a `ResizeObserver` on the same width. The thresholds are the `Breakpoints` values in `@c2n/core` (600 / 960). They are fixed: a container query cannot read a custom property.
2. **Folding page actions into "More actions" is built inside `c2-page-header`.** If a second component needs it, it moves into `c2-overflow-list` (#62) later without an API change.
3. **The narrow-width parent link** is the `parent` slot when given, otherwise derived from the breadcrumb's second-to-last item.
4. **No new application header.** The shell's `header` slot takes `c2-header`.

## Problem

Every app built on c2 writes the same frame and the same page top by hand (research §2):

- **Shell**: a `c2-header` above a `c2-side-nav`, whose menu button cannot open the drawer (the `side-nav-toggle` attribute only works inside the side nav), so apps wire it through framework state. The skip link and the `<main>` target are rewritten each time. There is no aside or banner region. The side nav reads the window's width, so it picks the wrong mode inside an iframe or a docs example frame.
- **Page header**: eleven pages in `apps/examples` hand-build an eyebrow, `<h1>`, ID line and status badge, with breadcrumbs made from raw links instead of `c2-breadcrumb`. Actions wrap under the title on narrow screens, and on long pages the title and actions scroll away.

## Goals

`c2-app-shell`:

1. Regions as slots: `banner`, `header`, `navigation` (+ `navigation-header`, `navigation-footer`), `aside`, `footer`, and the default slot for main. Landmarks (`<main>`, `<nav>`, `<aside>`, `<footer>`) and a skip link are rendered by the shell; authors write none.
2. Two arrangements: `layout="header-first"` (default; the header spans the width) and `layout="navigation-first"` (the navigation runs full height and the header sits over main).
3. Navigation presentation per width: `side` (pushes main), `rail` (collapses to icons; expanded it pushes) or `over` (modal drawer). Below 600 px always `over`; `tablet-mode` (600–959, default `rail`) and `desktop-mode` (≥ 960, default `side`) pick the other two. The aside is a column at ≥ 960 px and a sheet from the end edge below.
4. Toggling from anywhere inside the shell, including a button in the slotted `c2-header`, without script: a `c2-app-shell-toggle` element (button with `aria-expanded`, localised name, hamburger icon) or any element with an `app-shell-toggle` attribute.
5. Drawer behaviour identical to `c2-side-nav` (focus trap, Escape, backdrop, scroll lock, focus return), through a controller shared with it.
6. Page scrolling (default) or main scrolling (`scroll="main"`: the shell is the height of its container and only main scrolls).

`c2-page-header`:

1. Slots for every part the systems agree on: `breadcrumb`, `parent`, `leading`, default (the author's heading), `title-suffix`, `description`, `meta`, `actions`, `navigation`, `toolbar`.
2. Actions that do not fit fold into a "More actions" menu, lowest `overflow-priority` first; the one marked `primary` never folds.
3. Below 600 px of its own width: the parent link replaces the breadcrumb and the actions move to their own row under the title.
4. `sticky`: once the title row scrolls out, a condensed bar stays at `--c2-page-header--sticky-top` with the title text, the `title-suffix` content and the primary action.
5. Works anywhere: inside the shell, a plain page, a dialog, a split panel.

Both: server-render with no attribute written on the host or on author children; all built-in text localisable; every size and colour a documented variable with theme-mappable defaults.

Non-goals: a bottom navigation bar (use `c2-bottom-nav`, #66, in the `footer` slot when it exists); drag-to-resize the navigation (a later `resizable` can reuse `c2-split-panel`); header panels for notifications (use `c2-menu` / `c2-sheet` anchored to the action); routing (the app sets `aria-current`).

## Usage

```html
<c2-app-shell layout="header-first" tablet-mode="rail" close-on-navigate>
  <c2-banner slot="banner" tone="warning">Test mode · Payouts here never move real money</c2-banner>

  <c2-header slot="header" sticky>
    <c2-app-shell-toggle slot="brand"></c2-app-shell-toggle>
    <a slot="brand" href="/">Ledgerline</a>
    <c2-breadcrumb>…workspace and environment menus…</c2-breadcrumb>
    <div slot="actions">…search, notifications, account…</div>
  </c2-header>

  <div slot="navigation-header">…workspace switcher…</div>
  <c2-list slot="navigation">
    <c2-list-item href="/batches" selected><c2-feather-layers slot="prefix-icon"></c2-feather-layers><span class="label">Batches</span></c2-list-item>
    …
  </c2-list>
  <c2-list slot="navigation-footer">…settings…</c2-list>

  <c2-page-header sticky>
    <c2-breadcrumb slot="breadcrumb">
      <c2-link-button href="/payouts">Payouts</c2-link-button>
      <c2-link-button href="/batches">Batches</c2-link-button>
      <c2-link-button selected>B-0412</c2-link-button>
    </c2-breadcrumb>
    <c2-feather-layers slot="leading"></c2-feather-layers>
    <h1>October supplier run</h1>
    <c2-badge slot="title-suffix" tone="warning">Awaiting approval</c2-badge>
    <p slot="description">Batch B-0412 · 12 payouts to EU suppliers, due before the 15:30 CET SEPA cut-off.</p>
    <c2-description-list slot="meta">…</c2-description-list>
    <c2-button slot="actions" overflow-priority="1">Export</c2-button>
    <c2-button slot="actions" overflow-priority="2">Reject</c2-button>
    <c2-split-button slot="actions" primary>Approve batch …</c2-split-button>
    <nav slot="navigation" aria-label="Batch">…links with aria-current…</nav>
    <div slot="toolbar">…c2-search-field, filters…</div>
  </c2-page-header>
  …page content…

  <section slot="aside" aria-label="Payout PO-2291">
    <c2-app-shell-toggle for="aside"></c2-app-shell-toggle>
    …
  </section>
</c2-app-shell>
```

```js
shell.addEventListener('navigation-opened-change', (e) => e.detail) // { opened, mode }
shell.addEventListener('mode-change', (e) => e.detail) // { breakpoint, mode }
pageHeader.addEventListener('condensed-change', (e) => e.detail) // { condensed }
```

## Anatomy

```
c2-app-shell (container-type: inline-size; CSS grid)
┌──────────────────────────── banner ────────────────────────────┐
├──────────────────────────── header ────────────────────────────┤   layout="header-first"
├─ <nav part="navigation"> ─┬── <main part="main" tabindex=-1> ──┬─ <aside part="aside"> ─┤
│  navigation-header        │  [skip link target]                │  aside                 │
│  navigation               │  default slot                      │                        │
│  navigation-footer        │                                    │                        │
├───────────────────────────┴──────────── footer ────────────────┴────────────────────────┤
└──────────────── <div part="backdrop"> (over drawer / aside sheet) ─────────────────────┘
<a part="skip-link"> first in tab order (slot "skip-link" overrides it)

c2-page-header (container-type: inline-size)
┌ <header part="base"> ───────────────────────────────────────────────────────────┐
│ breadcrumb  |  parent (< 600 px; slotted or derived "‹ Batches")                 │
│ ┌ title row ─────────────────────────────────────────┐ ┌ actions ─────────────┐ │
│ │ leading · default slot (h1) · title-suffix         │ │ …visible · primary · ⋯│ │
│ │ description                                        │ └───────────────────────┘ │
│ │ meta                                               │                          │
│ └────────────────────────────────────────────────────┘                          │
│ navigation                                                                       │
│ toolbar                                                                          │
└──────────────────────────────────────────────────────────────────────────────────┘
<div part="condensed"> sticky bar: [parent link] · title text (aria-hidden) · title-suffix · primary
```

`c2-page-header` creates its shadow root with `slotAssignment: 'manual'` and routes children with `assignSlot` from `@c2n/core/lit-helper.js` (falling back to writing `slot` only in a declarative shadow root, as the repo convention says). That is what lets it hide a folded action (left unassigned) and move the primary action and the suffix into the condensed bar (reassigned) without writing on author nodes or cloning them. The "More actions" menu is an internal `c2-menu` whose rows are generated from the folded actions; picking a row calls the original element's `click()`.

## Public API

### `c2-app-shell`

| Property           | Attribute           | Type                                   | Default          | Purpose                                                                                                                                               |
| ------------------ | ------------------- | -------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `layout`           | `layout`            | `'header-first' \| 'navigation-first'` | `'header-first'` | Whether the header spans the width or sits over main.                                                                                                 |
| `navigationOpened` | `navigation-opened` | `boolean`                              | `false`          | Drawer / side open, rail expanded. Reflects (like `c2-side-nav`'s `opened`). Below 600 px the initial value is ignored and the drawer starts closed.  |
| `desktopMode`      | `desktop-mode`      | `'side' \| 'rail' \| 'over'`           | `'side'`         | Presentation at ≥ 960 px of the shell's width.                                                                                                        |
| `tabletMode`       | `tablet-mode`       | `'side' \| 'rail' \| 'over'`           | `'rail'`         | Presentation at 600–959 px. Below 600 px it is always `over`.                                                                                         |
| `asideOpened`      | `aside-opened`      | `boolean`                              | `false`          | Aside column (≥ 960 px) or sheet (below) shown.                                                                                                       |
| `scroll`           | `scroll`            | `'page' \| 'main'`                     | `'page'`         | `main`: the shell takes `--c2-app-shell--height` and only main scrolls; header and navigation never move.                                             |
| `closeOnNavigate`  | `close-on-navigate` | `boolean`                              | `false`          | In `over` mode, a click on a link (`a[href]`, or an element with `href` such as `c2-list-item`) in the navigation closes the drawer and focuses main. |
| `navigationLabel`  | `navigation-label`  | `string`                               | `''`             | Name of the navigation landmark. Empty: the message "Main".                                                                                           |
| `asideLabel`       | `aside-label`       | `string`                               | `''`             | Name of the aside landmark when the slotted content has none.                                                                                         |
| `storageKey`       | `storage-key`       | `string`                               | `''`             | When set, the user's `side` / `rail` choice is kept in `localStorage` under this key and restored.                                                    |

Getters: `mode` (`'side' | 'rail' | 'over'`, the one in effect), `breakpoint` (`'phone' | 'tablet' | 'desktop'`).

Methods: `toggleNavigation(force?: boolean)`, `toggleAside(force?: boolean)`, `focusMain()`.

Events (none bubble, so a shell nested in a docs example does not reach the page's shell):

| Event                      | Detail                      | Notes                                                                                                                                                                                                          |
| -------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `navigation-opened-change` | `{ opened: boolean, mode }` | When the user (toggle, backdrop, Escape, close-on-navigate) or a breakpoint change opens or closes the navigation; not when `navigationOpened` is set from code. Same rule as `c2-side-nav`'s `opened-change`. |
| `aside-opened-change`      | `{ opened: boolean }`       | Same rule.                                                                                                                                                                                                     |
| `mode-change`              | `{ breakpoint, mode }`      | The shell's width crossed 600 or 960 px, or a mode attribute changed the mode in effect.                                                                                                                       |

Slots: `banner`, `header`, `navigation-header`, `navigation`, `navigation-footer`, default (main), `aside`, `footer`, `skip-link` (replaces the built-in link).

Parts: `banner`, `header`, `navigation`, `main`, `aside`, `footer`, `backdrop`, `skip-link`.

Custom states (`internals.states`, for author CSS): `side`, `rail`, `over`, `navigation-opened`, `aside-opened`. Collapsed rail labels are hidden by the author, as with `c2-side-nav`: `c2-app-shell:state(rail):not([navigation-opened]) .label { display: none }`, documented on the page and shown in the gallery.

Toggles:

- **`c2-app-shell-toggle`** (same package): `for="navigation"` (default) or `for="aside"`. Renders a `<button>` with `aria-expanded` bound to the shell's state and the name "Open navigation" / "Close navigation" / "Close details" (localised; overridable with `label`). Default icon: a hamburger in `over` mode, a sidebar glyph in `side` / `rail`; `icon` slot replaces it. It finds its shell through a context in `@c2n/core/contexts/` (the same mechanism as the field and pager contexts), so it works in the slotted header's light DOM and needs no id. Outside a shell it renders nothing.
- **`app-shell-toggle="navigation | aside"`** on any element: click delegation through `composedPath()`, nearest enclosing shell only (the `c2-side-nav` algorithm). The shell cannot set `aria-expanded` on that element (it is author light DOM), so the docs recommend `c2-app-shell-toggle` and keep the attribute for custom controls.

### `c2-page-header`

| Property           | Attribute            | Type                  | Default | Purpose                                                                  |
| ------------------ | -------------------- | --------------------- | ------- | ------------------------------------------------------------------------ |
| `sticky`           | `sticky`             | `boolean`             | `false` | Show the condensed bar once the title row has scrolled out.              |
| `condensed`        | —                    | `boolean` (read-only) | `false` | Whether the condensed bar is showing. Also the `condensed` custom state. |
| `parentHref`       | `parent-href`        | `string`              | `''`    | Overrides the derived parent link's target.                              |
| `parentLabel`      | `parent-label`       | `string`              | `''`    | Overrides the derived parent link's text.                                |
| `moreActionsLabel` | `more-actions-label` | `string`              | `''`    | Name of the "More actions" button. Empty: the message.                   |

On author children (written by the author, read by the component):

| Attribute           | On                              | Purpose                                                                                        |
| ------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------- |
| `primary`           | one `slot="actions"` child      | Never folds; shown in the condensed bar; stays visible on its own row below 600 px.            |
| `overflow-priority` | other `slot="actions"` children | Lower numbers fold first. Missing: folds before any numbered one, in reverse document order.   |
| `menu-label`        | any `slot="actions"` child      | Text of its row in "More actions". Missing: its `label` property, `aria-label`, then its text. |

Events (do not bubble):

| Event              | Detail                   | Notes                                                                                                 |
| ------------------ | ------------------------ | ----------------------------------------------------------------------------------------------------- |
| `condensed-change` | `{ condensed: boolean }` | Fired on scroll when the title row leaves or re-enters the area below `--c2-page-header--sticky-top`. |
| `overflow-change`  | `{ folded: Element[] }`  | The set of folded actions changed (resize, slot change).                                              |

Slots: `breadcrumb`, `parent`, `leading`, default (heading), `title-suffix`, `description`, `meta`, `actions`, `navigation`, `toolbar`.

Parts: `base`, `context`, `parent`, `title-row`, `leading`, `actions`, `more-actions` (the button), `navigation`, `toolbar`, `condensed`.

Custom states: `narrow` (below 600 px of its own width), `condensed`, `has-folded`.

Derived parent link: when `parent` is empty and the `breadcrumb` slot holds a `c2-breadcrumb`, its second-to-last child gives the `href` and the text (`parent-href` / `parent-label` override either). The link is rendered in the shadow root as an `<a>` with a chevron and the name "Back to {label}". No breadcrumb and no `parent`: no link.

## Behaviour details

`c2-app-shell`:

- **Width**: the host is `container-type: inline-size`. Grid columns, the rail width and the aside-as-sheet switch are `@container` rules, so the server-rendered first paint is already right. A `ResizeObserver` derives `breakpoint` and `mode` for behaviour (modal or not, `mode-change`). Mode defaults on entering a breakpoint: `side` opens, `rail` collapses, `over` closes; the user's last `side` / `rail` choice is restored when the width grows back (and from `storage-key`).
- **Drawer**: `@c2n/core/controllers/drawer-controller.ts`, extracted from `c2-side-nav` (`syncOverlayState`, `lockScroll` / `smartFixedPosition`, `focusDrawer` with keyboard modality, focus return, Escape on `window`, the `inert` rules for rail vs overlay). `c2-side-nav` is refactored onto it in the same change, with its suite as the guard; the shell uses one instance for the navigation and one for the aside sheet. `--c2-app-shell__over--position` (default `fixed`, `absolute` keeps it inside a positioned parent) decides whether scroll is locked, as in the side nav.
- **Header**: the shell does not style the slotted header. `c2-header sticky` sticks to the top of the page (`scroll="page"`), and is outside the scrolled area with `scroll="main"`. The page header's sticky offset inside a shell is the header's height, which the shell exposes as `--c2-app-shell__header--height` (measured, set on the host's own style through a constructed stylesheet in the shadow root, never as a host attribute) so `--c2-page-header--sticky-top: var(--c2-app-shell__header--height)` works.
- **Skip link**: first in the shadow root, visually hidden until focused (reuses `c2-skip-link`'s look through its variables); activation calls `focusMain()`.

`c2-page-header`:

- **Width**: `container-type: inline-size` on the host; below 600 px the parent link replaces the breadcrumb, the leading visual hides and the actions take their own row (all CSS, so right on first paint).
- **Folding**: a `ResizeObserver` on the actions part measures each assigned action's width once (cached until `slotchange` or a font load) and unassigns actions by priority until the row fits with the "More actions" button. The primary is never unassigned. No folding while the server renders: all actions are assigned, and the first client measurement may fold some (a layout change, not a hydration mismatch, because assignment is not part of the rendered template).
- **Condensed bar**: an `IntersectionObserver` on the title row with `rootMargin` top set from the computed `--c2-page-header--sticky-top` (re-read on resize). When condensed, `title-suffix` children and the primary action are reassigned to the bar's slots; the title text is copied as plain text into an `aria-hidden` span. Tabs and toolbar scroll away. Unsticky (`sticky` absent) never observes.

## Styling

Defaults reuse the repo's literals so `@c2n/theme` maps them (radii 8px, font sizes 12/14px, weights 500/600, `#e4e4e7` dividers, `#fafafa` side surfaces, the side nav's shadow and scrim).

`c2-app-shell`:

| Variable                                       | Default                           | Notes                                                 |
| ---------------------------------------------- | --------------------------------- | ----------------------------------------------------- |
| `--c2-app-shell--height`                       | `100dvh`                          | Used with `scroll="main"`.                            |
| `--c2-app-shell__navigation--width`            | `240px`                           | Side, expanded rail.                                  |
| `--c2-app-shell__navigation__rail--width`      | `64px`                            | Collapsed rail.                                       |
| `--c2-app-shell__navigation__over--width`      | `min(280px, 85%)`                 | Drawer.                                               |
| `--c2-app-shell__navigation--background-color` | `#fafafa`                         | Same default as `c2-side-nav`.                        |
| `--c2-app-shell__navigation--padding`          | `8px`                             |                                                       |
| `--c2-app-shell__aside--width`                 | `320px`                           | Column and sheet.                                     |
| `--c2-app-shell__aside--background-color`      | `#ffffff`                         |                                                       |
| `--c2-app-shell__main--background-color`       | `transparent`                     |                                                       |
| `--c2-app-shell__main--padding`                | `0`                               | The page header and content own their padding.        |
| `--c2-app-shell__divider--width` / `--color`   | `1px` / `#e4e4e7`                 | Between navigation, main and aside.                   |
| `--c2-app-shell__over--position`               | `fixed`                           |                                                       |
| `--c2-app-shell__over--box-shadow`             | `0 12px 40px rgba(0, 0, 0, 0.18)` | Drawer and aside sheet.                               |
| `--c2-app-shell__backdrop--background-color`   | `rgba(0, 0, 0, 0.32)`             |                                                       |
| `--c2-app-shell__backdrop--z-index`            | `1000`                            |                                                       |
| `--c2-app-shell--transition-duration`          | `250ms`                           | 0 under `prefers-reduced-motion`.                     |
| `--c2-app-shell__header--height`               | measured                          | Read-only output for the page header's sticky offset. |

`c2-page-header`:

| Variable                                                                 | Default                           | Notes                                                            |
| ------------------------------------------------------------------------ | --------------------------------- | ---------------------------------------------------------------- |
| `--c2-page-header--padding-top` / `-right` / `-bottom` / `-left`         | `20px` / `24px` / `16px` / `24px` |                                                                  |
| `--c2-page-header--gap`                                                  | `12px`                            | Between rows.                                                    |
| `--c2-page-header--background-color`                                     | `transparent`                     |                                                                  |
| `--c2-page-header--border-bottom`                                        | `none`                            | `1px solid #e4e4e7` in the gallery's "Surface" card.             |
| `--c2-page-header__title--font-size` / `--font-weight` / `--line-height` | `24px` / `600` / `1.25`           | Applied to the slotted heading through `::slotted(*)`.           |
| `--c2-page-header__title--line-clamp`                                    | `2`                               |                                                                  |
| `--c2-page-header__title__narrow--font-size`                             | `20px`                            |                                                                  |
| `--c2-page-header__leading--size`                                        | `40px`                            |                                                                  |
| `--c2-page-header__description--color` / `--font-size`                   | `#52525b` / `14px`                |                                                                  |
| `--c2-page-header__meta--font-size` / `--gap`                            | `12px` / `4px 16px`               |                                                                  |
| `--c2-page-header__actions--gap`                                         | `8px`                             |                                                                  |
| `--c2-page-header__navigation--margin-top`                               | `4px`                             |                                                                  |
| `--c2-page-header--sticky-top`                                           | `0px`                             | Inside a shell: `var(--c2-app-shell__header--height)`.           |
| `--c2-page-header__condensed--height`                                    | `48px`                            |                                                                  |
| `--c2-page-header__condensed--background-color`                          | `rgba(255, 255, 255, 0.92)`       | With `--c2-page-header__condensed--backdrop-filter: blur(12px)`. |
| `--c2-page-header__condensed--border-bottom`                             | `1px solid #e4e4e7`               |                                                                  |
| `--c2-page-header__condensed__title--font-size`                          | `14px`                            |                                                                  |
| `--c2-page-header--transition-duration`                                  | `180ms`                           | Condensed bar slide; 0 under reduced motion.                     |

Gallery (CSS only): shell — header-first, navigation-first (Linear-style sidebar with workspace switcher), dense rail, docs layout with an aside table of contents; page header — list page with toolbar, record with avatar and previous / next, review with tabs and a split primary, settings (title + description), surface with a divider, condensed.

## Rendering constraints

- No attribute written on either host after upgrade, and none on author children: state through `internals.states` and `internals.role` only (`navigation-opened` / `aside-opened` reflect only when set by the author or by a user action, the `c2-side-nav` rule; their defaults are not reflected).
- Landmarks live in the shadow roots. The shell's host has no role. The page header renders a `<header>`, which inside `main` has no landmark role.
- Server rendering: the shell renders every region and the skip link; container queries lay it out. The page header renders all parts with every action assigned; no measuring on the server.
- Child components rendered inside a server-rendered parent hydrate after it: the page header must not write on slotted controls before their first update (it only assigns slots and reads).
- Imports `customElement` from `@c2n/core/element-helper.js` and `property` from `@c2n/core/lit-helper.js`; each class exports its `…EventMap` merged through `TypedAddEventListener`.
- Localised messages: `app-shell` — `skipToContent: 'Skip to main content'`, `navigation: 'Main'`, `openNavigation: 'Open navigation'`, `closeNavigation: 'Close navigation'`, `openDetails: 'Show details'`, `closeDetails: 'Close details'`; `page-header` — `moreActions: 'More actions'`, `backTo: (label) => \`Back to ${label}\``.
- Dependencies: `@c2n/app-shell` → `@c2n/core` only. `@c2n/page-header` → `@c2n/core`, `@c2n/menu` (its `:build` in `type-check` dependencies). Neither imports `c2-header`, `c2-breadcrumb` or `c2-side-nav`: it reads `c2-breadcrumb`'s children by tag name.

## Accessibility

Shell:

- One `main`, one named `navigation`, optional `complementary` (aside, named by `aside-label` or the slotted content) and `contentinfo`; `banner` comes from the slotted `c2-header`.
- Skip link first in tab order; target is the shell's `main` (`tabindex="-1"`).
- `over` drawer and aside sheet are modal: focus moves in (first link with keyboard modality, the panel otherwise), Tab is trapped, Escape and the backdrop close, focus returns to the opener, the rest of the shell is `inert`.
- Collapsed rail: the navigation's own items keep their names (the docs show labels hidden visually, not removed, and `c2-list-item`'s tooltip for the name).
- `c2-app-shell-toggle`: `aria-expanded`, a name that says the action; no `aria-controls` (it cannot reach into the shell's shadow root).
- `close-on-navigate` moves focus to main after closing, so the new page is announced from its top.

Page header:

- The heading is the author's element; the component styles it through `::slotted` and never wraps it in a role.
- Breadcrumb keeps `c2-breadcrumb`'s `nav`; the parent link is a link named "Back to {label}".
- "More actions" is an APG menu button (`c2-menu`); folded actions keep their names as menu rows; a disabled action is a disabled row.
- Condensed bar: the title copy is `aria-hidden`; the primary action and suffix are the same nodes (reassigned), so they are not announced twice and keep their state.
- Reading order follows the DOM (breadcrumb, title, suffix, description, meta, actions, navigation, toolbar) at every width; layout changes are CSS order only within a row, never across rows.

## Tests

`packages/components/app-shell/test/`:

- Regions: each slot lands in its landmark; skip link is first in tab order and focuses main.
- Width, not window: a shell in a 500 px container inside a 1280 px page is `over`; in an 800 px container it is `tablet-mode`; resizing the container fires `mode-change` once per crossing.
- Modes: side open / closed widths, rail collapsed / expanded widths (variables honoured), over drawer modal behaviour (trap, Escape, backdrop, scroll lock with `fixed`, none with `absolute`, focus return).
- Toggles: `c2-app-shell-toggle` in the slotted `c2-header` opens the drawer and its `aria-expanded` follows; `[app-shell-toggle]` on a plain button works; a nested shell's toggle does not reach the outer one.
- Events: fired for user changes only, not for property sets; none bubble.
- `close-on-navigate`: link click in the drawer closes it and focuses main; not in `side` mode.
- `scroll="main"`: only main scrolls; `--c2-app-shell__header--height` matches the slotted header.
- `storage-key`: a rail choice survives a reload; absent key writes nothing.
- No attributes on the host after upgrade (`toHaveHostAria` for internals); SSR / hydration without mismatch.
- `c2-side-nav`'s existing suite passes unchanged after the controller extraction.

`packages/components/page-header/test/`:

- Slots render in order; the heading keeps its level and its own attributes.
- Folding: at decreasing widths actions fold by `overflow-priority`, the primary never folds, `overflow-change` lists them, the menu rows use `menu-label` and clicking a row clicks the original (its listeners run); no attribute written on any action.
- Narrow (< 600 px container): parent link shown, breadcrumb hidden; derived from the breadcrumb's second-to-last item, overridden by `parent` / `parent-href` / `parent-label`; absent with neither.
- Condensed: scrolling past the title row toggles `condensed` and fires `condensed-change` once each way, honouring `--c2-page-header--sticky-top`; the primary action is the same node in the bar; the title copy is `aria-hidden`; nothing observed without `sticky`.
- Works in a shell with `scroll="main"` (observer root is the scrolled main) and in a plain page.
- Localisation: "More actions" and "Back to …" in a second language from `test/translations.ts`.
- SSR / hydration: all actions assigned on the server, no mismatch on the client.

Both are added to the umbrella (registration check), and `c2-page-header` to the gallery audit.

## Docs and wiring (from the `new-component` skill)

- Doc pages under `apps/ui/src/content/components/` (category Layout): `app-shell.mdx` (rows "Header first", "Navigation first", "Rail"; a note on container width, and that `c2-side-nav` remains the lighter choice for a single drawer), `page-header.mdx` (rows "List page", "Record", "With tabs"; "When to use": one per page, at the top of main).
- Usage blocks run inside example frames, which is exactly what "own width" makes work; the shell examples use `scroll="main"` with a fixed `--c2-app-shell--height` and `--c2-app-shell__over--position: absolute`.
- Gallery files with the cards listed under Styling; `component-previews.ts` and `component-modules.ts` entries; manifests registered; `npm run size:add -w packages/umbrella`.
- Pointers: `side-nav.mdx` and `header.mdx` link to the app shell; `breadcrumb.mdx` to the page header.
- Dogfooding: `apps/examples/observability-nextjs` moves to `c2-app-shell` + `c2-page-header` in a follow-up PR (removes its toggle wiring, skip link and `.section-heading` CSS), recorded in `COMPONENT-FEEDBACK.md` if anything is missing.

## Open questions

1. **Condensed bar with tabs**: this spec lets the tabs scroll away (GitHub). Carbon keeps them sticky under the condensed title. Keep the simpler one for v1?
2. **Previous / next record** (Polaris `pagination`): an ordinary item in `actions` (current spec) or a named `pagination` slot that never folds?
3. **`storage-key` on the shell**: in v1 or later? It is small, but it is the only persisted state in either component.
4. **`app-shell-toggle` attribute**: keep it next to `c2-app-shell-toggle`, or drop it so every toggle has a correct `aria-expanded`?
