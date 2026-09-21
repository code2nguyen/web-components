# Component feedback

A running log of friction hit while **consuming** `c2-*` components from an application — `apps/ui`,
`apps/examples/*`, or any project using the published packages. It is the feedback loop the dogfooding rule
(see `CLAUDE.md` / `AGENTS.md`) exists to produce: every hand-rolled workaround in an app is a component that
is missing something, and this is where that gets recorded instead of quietly worked around.

**Who writes here:** anyone — human or agent — who uses a c2n component and has to fight it. Append an entry
rather than editing someone else's. Keep it short and concrete: what you were building, what you expected,
what actually happened, and the smallest change that would have avoided it.

**Who clears entries:** whoever fixes the component. Move the entry to `## Fixed` with the commit or PR, or
to `## Won't fix` with the reason. Do not delete an entry without resolving it.

**What does not belong here:** bugs in the app rather than the component, and anything you fixed in the
component in the same change (that is what the commit message and the test are for).

Severity: **bug** (wrong behaviour), **gap** (documented or implied but not implemented), **papercut**
(works, but the API makes the common case hard), **docs** (the component is right, the documentation is not).

---

## Open

### Renderer output is unreachable from a page stylesheet

- **Severity:** papercut
- **Hit while:** migrating a nine-route SvelteKit tool onto 35 packages at 0.0.13, 2026-09-19 (external report).
- **What happens:** `renderCell` (`c2-table`) and `renderItem` (`c2-virtual-list`, `c2-list`) return nodes that
  land in the shadow root, where no page stylesheet reaches them. Every element in the app's row template had to
  carry an inline `style` constant for that reason alone, including the two declarations that turn a filled badge
  into an outlined one. `::part(cell-content-<field>)` covers a column's text but not the structure inside a
  renderer.
- **Where the fix belongs:** `packages/components/table`, `virtual-list`, `list` — give rendered content a `part`,
  or honour a `part`/class the renderer's returned element already carries.

### No per-row styling hook that CSS can reach

- **Severity:** gap
- **Hit while:** the same migration, 2026-09-19 (external report).
- **What happens:** `rowStyle` is a function returning inline styles; there is no `rowClass`, and `::part(row)`
  cannot be conditioned on row data. Every per-row tint in the app — a revised record, the currently running job —
  became a badge in a cell instead.
- **Where the fix belongs:** `packages/components/table` — a `rowClass` callback returning a string, or chosen
  fields emitted as data attributes on the row so `::part(row)[data-status='failed']` works from a stylesheet.

### Wrapping a table cell takes a three-part override every consumer rewrites

- **Severity:** papercut
- **Hit while:** the same migration, 2026-09-19 (external report). The identical override was written twice, on
  two different screens.
- **What happens:** cells clip by design, which is right for a windowed grid. Opting out means turning
  virtualization off and then resetting `align-items` and `overflow` through two parts:
  `--c2-table__row--height: auto`, `::part(cell) { align-items: flex-start; overflow: visible }`,
  `::part(cell-content) { white-space: normal; overflow: visible }`.
- **Where the fix belongs:** `packages/components/table` — a `wrap` attribute that does those three things and
  documents that windowing turns off, or measured variable row heights.

### `cell-slot` defeats virtualization, so rich cells and windowing are mutually exclusive without Lit

- **Severity:** gap
- **Hit while:** the same migration, 2026-09-19 (external report).
- **What happens:** a `cell-slot` column needs one light-DOM child per row per field, keyed by row key. On a
  5,000-row grid that is 5,000 children — exactly the cost windowing exists to avoid. A framework that will not
  take a Lit dependency therefore cannot have both. (`html` re-exported from `@c2n/core/lit-helper.js` softens
  this: the Lit renderer no longer means a hand-pinned `lit` in the application.)
- **Where the fix belongs:** `packages/components/table` — key slot names by **visible index** rather than row key,
  so a framework renders only the window. Breaking change to the documented `cell:{rowKey}:{field}` contract.

### `c2-status-panel` always renders its media box

- **Severity:** papercut
- **Hit while:** the same migration, 2026-09-19 (external report).
- **What happens:** the template always emits the media element, so suppressing it took zeroing the media size and
  background for all five tones plus collapsing the container gap — six variables to hide one box.
- **Where the fix belongs:** `packages/components/status-panel` — a `no-media` attribute, or skip the media box
  when its slot is empty and a flag asks for no default icon.

### `@c2n/seperator` and `c2-seperator` are misspelled

- **Severity:** papercut (public API)
- **Hit while:** the same migration, 2026-09-19 (external report).
- **What happens:** the package, the element and the documentation all spell it "seperator". Every consumer has to
  reproduce the typo.
- **Where the fix belongs:** ship `@c2n/separator` / `c2-separator` and keep the old spelling as a deprecated alias
  package and tag. Breaking without the alias, so it needs a deliberate release.

### `reorder-list` exposes two properties whose real attributes are unreadable

- **Severity:** papercut
- **Hit while:** correcting the manifest's derived attribute names, 2026-09-19.
- **What happens:** `dragStartThreshold` and `autoScrollDisabled` declare no `attribute`, so Lit observes them as
  `dragstartthreshold` and `autoscrolldisabled` — now that the manifest reports the real name instead of the
  property spelling, that is what the API table, the IDE metadata and any generated markup advertise.
- **Where the fix belongs:** `packages/components/reorder-list` — declare `attribute: 'drag-start-threshold'` and
  `attribute: 'auto-scroll-disabled'`. Backwards compatible: `element-helper` forwards the lowercase spelling to
  the kebab-case attribute with a warning.

### A many-row component cannot be SSR'd chrome: declarative shadow DOM duplicates its stylesheet per instance

- **Severity:** gap (rendering strategy, not a component defect)
- **Hit while:** converting the docs sidebar from eight `c2-details` + `<ul><li><a>` to one `c2-tree`, 2026-09-17.
- **What happens:** a plain `<c2-tree>` tag in an `.astro` file is picked up by `@astrojs/lit` and
  server-rendered as declarative shadow DOM. Each of the 138 `c2-tree-item` rows (69 pages × the desktop
  sidebar and the drawer) inlines the whole `tree-item` stylesheet into its own `<template shadowrootmode>`,
  taking a component page from **606 KB to 2193 KB of HTML** — on all 220 pages. The rows also arrive inert:
  `@astrojs/lit` stamps `defer-hydration`, and a plain tag has no island script to remove it, so the
  server-rendered `is-leaf` toggle state sticks and nothing expands.
- **Neither escape hatch is free.** `utils/raw-element.ts` (the `hydrate="defined"` path the site uses for
  repeated chrome) skips SSR and fixes both problems, but then the nav paints nothing until JS runs and the
  static HTML carries no `<a href>` at all — on a documentation site that is the internal link graph a crawler
  follows. Keeping SSR keeps the links, inside shadow roots, at +1.6 MB per page.
- **Outcome:** shipped, on the second attempt. The tree is emitted through `rawElement` (no SSR, so no
  duplicated stylesheets and no `defer-hydration`) and each row's link is slotted into `label` rather than set
  as the item's `href`, keeping the anchors in the light DOM. A component page went from **606 KB to 403 KB**
  of HTML — smaller than the `c2-details` version it replaced, because 69 `<ul><li><a>` rows and eight
  disclosure shadow roots collapse into one tree. 68 crawlable anchors, arrow-key navigation, and one tab stop
  instead of 69.
- **Still open:** the underlying gap. Any component with more than a handful of instances has to go through
  `rawElement` and give up server rendering, because declarative shadow DOM has no way to share one adopted
  stylesheet across instances. `c2-table` and `c2-virtual-list` will hit the same wall as chrome. The fix
  belongs in the theme/build pipeline, or in documenting `rawElement` as the required path above a certain
  instance count.

### `c2-bar-chart` cannot express common horizontal, stacked, or labelled bar variants

- **Severity:** gap
- **Hit while:** translating the bar-chart gallery reference into supported docs examples, 2026-09-16.
- **What happens:** the component only draws vertical grouped bars. There is no orientation option, cumulative
  stack mode, or value/data-label renderer, so three common variants in the reference could not be represented
  without drawing a separate chart by hand. The gallery keeps only truthful grouped-bar examples.
- **Where the fix belongs:** `packages/components/chart` — add explicit orientation and grouping/stacking APIs,
  plus a formatter or render hook for bar labels.

### A component-level shorthand variable cannot be reached once `@c2n/theme` is loaded

- **Severity:** gap (theme pipeline)
- **Hit while:** trying to flatten `c2-details` for the docs sidebar in two declarations instead of eight, 2026-09-14.
- **What happens:** adding `--c2-details--border` as a fallback behind the four per-side variables
  (`css.cssVar(border-top, border)`) looks right and does nothing: `base.css` assigns
  `--c2-details--border-top: var(--c2-theme--border, …)` and the other three at `:root`/`:host`, so the
  per-side variable is always set and the shorthand is never consulted. The attempt was reverted rather than
  shipped, because a variable that silently does nothing under the project's own theme is worse than none.
- **Where the fix belongs:** `packages/tools/theme` — either have the generator emit the shorthand when a
  component declares one, or stop `base.css` writing all four sides when they carry the same token.

## Fixed

| Component                       | Finding                                                                                                                                                                                                                                                                                                                         | Fixed in                                                                                                                                                                      |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `c2-sparkline`                  | `decorateOptions` passed `axes: []`; uPlot pads a short array back up to two _visible_ axes, so a 120×32 sparkline spent 52px on a y-axis gutter and drew its line in a 66px sliver.                                                                                                                                            | 2026-09-14, with a regression test asserting no axis element and a 116px plot.                                                                                                |
| `c2-line-chart`, `c2-bar-chart` | `linePaths`/`barPaths` filled their cache from `loadUplot().then(…)` and returned synchronously, so the builder always arrived one microtask after uPlot read `paths`: every chart drew its first frame straight and `curve` only applied on a later rebuild.                                                                   | 2026-09-14, `loadedUplot()` + a test that the first frame of a `curve="step"` chart differs from linear.                                                                      |
| `c2-bar-chart`                  | Grouped series were drawn on the same x and overlapped completely; `bar-gap` was being passed as uPlot's _minimum bar width in pixels_.                                                                                                                                                                                         | 2026-09-14, `disp.x0`/`disp.size` grouping + a test that both series' colours survive.                                                                                        |
| `c2-bar-chart`                  | uPlot splits a short category axis on halves, so `formatAxisX` rounded two ticks to the same label and ran off the end of the list (`Core Core Web Web … 3.5`).                                                                                                                                                                 | 2026-09-14, blank label for non-integer splits, asserted in the same test.                                                                                                    |
| `c2-bar-chart`                  | Point markers drawn on top of every bar (uPlot's line default showing through).                                                                                                                                                                                                                                                 | 2026-09-14, `points: { show: false }`.                                                                                                                                        |
| `c2-button`                     | No way to build a row- or field-shaped button: `justify-content: center` was hardcoded on the container and the label was wrapped in a shadow `span` that could not grow, so a full-width left-aligned header and a fixed-width field with a trailing hint were both impossible.                                                | 2026-09-14, `--c2-button__container--{width,justify-content}` and `--c2-button__label--{flex-grow,justify-content}`, all defaulting to today's values. Both usages converted. |
| author trap                     | A converted control kept the old rule's `border`/`padding`/`background`, which stayed on the host while the component drew its own box inside it — a second focus ring inset by the old padding, reported as "something strange" on the phosphor filter. Not a component defect, but every conversion has to be checked for it. | 2026-09-14, the leftover rule removed from `PhosphorIconGallery`; the trap written into CLAUDE.md / AGENTS.md.                                                                |
| `c2-select`                     | A labelled select had no accessible name: the focusable control is a `<button>` in the shadow root, and neither route reaches it — `aria-labelledby` on the host points at a light-DOM id that ARIA cannot resolve across the boundary, and a wrapping `<label>` names the host.                                                | 2026-09-14, the label's text is copied onto the trigger; two tests, one per route.                                                                                            |
| `c2-select`                     | Opened from the keyboard it painted two concentric accent rings: `[open]` turns the border accent and `:focus-visible` drew a ring 1px off it, both mapped to the same token.                                                                                                                                                   | 2026-09-14, `button__focus--outline-offset` defaults to `0`.                                                                                                                  |
| `c2-select`                     | A `c2-list-item` child that never upgraded was skipped in silence, leaving an empty trigger that looks like a styling bug.                                                                                                                                                                                                      | 2026-09-14, a one-per-page console warning naming the cause.                                                                                                                  |
| `c2-details`                    | The icon only rotated when open, from 0°, so the nav idiom (chevron right when closed, down when open) needed a slotted replacement icon.                                                                                                                                                                                       | 2026-09-14, `--c2-details__header__icon--rotate-collapsed`; the docs sidebar now uses the stock chevron.                                                                      |
| `c2-line-chart` and siblings    | `grid` was a boolean, and a boolean attribute is true whenever present — `grid="false"` turned the grid _on_ and no markup could turn it off.                                                                                                                                                                                   | 2026-09-14, now `'both' \| 'x' \| 'y' \| 'none'` (matching `axes`), which also adds vertical grid lines. **Breaking:** `.grid = false` becomes `.grid = 'none'`.              |
| `c2-chart-series`               | `axis="right"` was documented and typed but no adapter read it, so a dual-axis chart drew both series against the left scale.                                                                                                                                                                                                   | 2026-09-14, a `y2` scale and a right-hand axis contributed only when a series asks; tested.                                                                                   |
| `c2-pie-chart`                  | The legend listed the chart's series, so a four-slice donut showed one entry ("Revenue").                                                                                                                                                                                                                                       | 2026-09-14, `legendItems()` is a per-chart hook; the pie lists and toggles its slices through a new optional `ChartAdapter.setDatumVisibility`.                               |
| `c2-pie-chart`                  | `--c2-chart__slice--border` was documented via `@cssproperty` but `seriesOption()` hardcoded the border, so setting it did nothing.                                                                                                                                                                                             | 2026-09-14, the variable is read and parsed.                                                                                                                                  |
| charts                          | `legend="start"` / `legend="end"` named the inline edges but the frame was always a column, so they sat above or below the plot exactly like `top`/`bottom` — only stacking their own entries. A pie with a four-entry legend squashed the plot to a third of its height.                                                       | 2026-09-14, the frame runs as a row for those two positions.                                                                                                                  |
| charts                          | A time axis always formatted month + day, so an hour of samples labelled every tick "Jan 1".                                                                                                                                                                                                                                    | 2026-09-14, the format is chosen from the visible span; tested on 75 minutes of data.                                                                                         |

## Won't fix

### `c2-select` has no label association — **incorrect, it does**

Logged on 2026-09-14 and disproved the same day. `c2-select` sets `static formAssociated = true`, which makes
it labelable: a native `<label for>` collects it into `internals.labels`, and `c2-label[for]` finds it and
sets `aria-labelledby`. What was actually broken was the name not reaching the trigger inside the shadow
root — fixed above. Kept as a reminder to check the behaviour before filing the API as missing.
