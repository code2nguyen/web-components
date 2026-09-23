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

### React types omit the `c2-button` value consumed by `c2-button-group`

- **Severity:** papercut
- **Hit while:** building the Next.js observability example's segmented time-mode control, 2026-09-21.
- **What happens:** `c2-button-group` uses each child button's `value` attribute as its stable selection ID, but
  `@c2n/button/react` does not allow `value` on `c2-button`. A typed React consumer must fall back to positional
  indexes, which couples state to child order.
- **Where the fix belongs:** `packages/components/button` / framework type generation — expose and document the
  child value contract, or let the group accept a separate typed item-key mapping.
- **Resolved 2026-09-23:** `c2-button` now exposes a reflected `value`; generated React types inherit it.

### Serialized select and theme-select values are rejected by generated React types

- **Severity:** papercut
- **Hit while:** server-rendering global scope and theme controls in the Next.js observability example, 2026-09-21.
- **What happens:** the components document serialized markup values, but generated React declarations expose
  only property-shaped `string[]` values. SSR-safe JSX such as a scalar `value="production"` is rejected, so the
  app needs post-upgrade ref assignment even for an initial selection.
- **Where the fix belongs:** `@c2n/framework-types` — include the documented attribute representation alongside
  the property type for properties whose converters accept serialized strings.
- **Resolved 2026-09-23:** generated React declarations accept the property type or a serialized string for structured values.

### Dashboard persistence cannot represent ordered panels and named sizes

- **Severity:** gap
- **Hit while:** building versioned desktop/tablet layouts for the Next.js observability example, 2026-09-21.
- **What happens:** `c2-dashboard`'s `storage-key` persists only track rows and columns. A consumer that needs an
  ordered panel-ID permutation plus named whole-panel sizes must own a second storage model and packing layer.
- **Where the fix belongs:** `packages/components/dashboard` — expose a versioned layout value/event contract
  containing stable card IDs, order, breakpoint, and named sizes, with validation and reset semantics.
- **Partially addressed 2026-09-23:** stored layouts and events include version, stable order, and breakpoint. Named sizes still require app-owned metadata through serializer hooks; the component does not validate or reset those sizes itself.

### `c2-status-panel` cannot describe loading or empty states semantically

- **Severity:** papercut
- **Hit while:** implementing explicit Normal/Loading/Empty/Error demonstrations in the Next.js observability example, 2026-09-21.
- **What happens:** the status vocabulary is limited to `neutral|info|success|warning|error`, so consumers must map
  empty to neutral and loading to info even though both are first-class component use cases with different
  default media and announcements.
- **Where the fix belongs:** `packages/components/status-panel` — add documented `loading` and `empty` statuses,
  or separate semantic state from visual tone so applications do not encode the distinction ad hoc.
- **Resolved 2026-09-23:** `loading` and `empty` are first-class statuses with distinct media and loading announcements.

### `c2-button` cannot submit a form through native form semantics

- **Severity:** gap
- **Hit while:** building the validated alert-rule form in the Next.js observability example, 2026-09-21.
- **What happens:** the component is not form-associated and exposes no `type="submit"` contract. The app must
  wire an explicit click handler instead of relying on form submission, Enter behavior, and native validation
  flow.
- **Where the fix belongs:** `packages/components/button` — add form association and `type`, `name`, and `value`
  semantics, forwarding submit/reset behavior through `ElementInternals`.
- **Resolved 2026-09-23:** the form-associated button supports `button`, `submit`, and `reset` with `name`/`value` semantics.

### Property-driven table cell action slots are not reliably actionable during upgrade

- **Severity:** bug
- **Hit while:** adding Edit/Open actions to alert rule and incident rows in the Next.js observability example, 2026-09-21.
- **What happens:** when `rows` and `columns` are assigned after `customElements.whenDefined`, light-DOM controls named
  for `cell:{rowKey}:{field}` did not consistently attach to the expected rendered cell soon enough to provide a
  stable keyboard/click target. The dense data stays in `c2-table`, while row actions had to move to an adjacent
  c2 control region.
- **Where the fix belongs:** `packages/components/table` — make cell-slot redistribution deterministic after
  property-driven row/column updates and add a framework/upgrade regression test for interactive slotted cells.
- **Partially addressed 2026-09-23:** a property-driven update regression verifies pointer/focus use of an interactive light-DOM cell. The original Next.js hydration race has no confirmed runtime fix and remains open.

### Property-driven tables produce no meaningful static-export HTML

- **Severity:** gap
- **Hit while:** building server-visible trace and log result baselines in the Next.js observability example, 2026-09-21.
- **What happens:** table rows and columns are property-only data assigned after upgrade, so a static export contains
  an empty `c2-table`. The application must render a second light-DOM baseline and hide it after the URL-aware client
  table mounts, duplicating collection markup solely to provide meaningful no-JavaScript/initial HTML.
- **Where the fix belongs:** `packages/components/table` — document/provide an SSR projection contract (declarative
  row children, a server renderer, or a hydration-friendly fallback slot) that the upgraded table can adopt.
- **Resolved 2026-09-23:** `slot="fallback"` is an explicit semantic SSR projection that becomes hidden after upgrade without removing its light DOM.

### `c2-link-button` does not participate in Next.js base-path routing

- **Severity:** papercut
- **Hit while:** linking trace/log correlations and recovery actions in a statically exported Next.js app with a
  `/web-components/demo/observability-nextjs` base path, 2026-09-21.
- **What happens:** unlike Next `Link`, a relative `c2-link-button` href is not rewritten with the configured base
  path. The consumer must explicitly construct deployment-prefixed URLs or use a different link surface.
- **Where the fix belongs:** documentation/framework guidance — document base-path URL construction for custom
  element links, or offer a small adapter that accepts the framework-resolved href while preserving the component.
- **Resolved 2026-09-23:** the framework guide includes an idempotent Next.js base-path href adapter and component example.

### App-wide button tokens override `c2-button-group` item presentation

- **Severity:** papercut
- **Hit while:** aligning segmented time controls and dashboard state/size controls in the Next.js observability example, 2026-09-23.
- **What happens:** a consumer rule that assigns `--c2-button__*` variables directly to every `c2-button` wins over
  the button group's `::slotted` item variables. Segmented children then retain primary-button fills and app-level
  heights, so their visual selection and alignment disagree with the group's value and size. The app must exclude
  grouped children from global button rules and repeat shared tokens on `c2-button-group` for joined controls.
- **Where the fix belongs:** `packages/components/button-group` and its documentation — expose/document a stable
  group-item theming layer that app themes can target without competing with child-host declarations, and include a
  composed example where standalone buttons are globally themed.
- **Resolved 2026-09-23:** segmented groups own child surface variables through an intentional cascade layer, covered against app-wide button tokens.

### Unknown `--c2-*` custom properties fail silently in consuming applications

- **Severity:** papercut (tooling)
- **Hit while:** auditing inconsistent card, details, sheet, skeleton, date-input, and list-item surfaces in the
  Next.js observability example, 2026-09-23.
- **What happens:** renamed or obsolete component variables remain valid CSS, so type-check, lint, and production
  builds succeed while components silently use package defaults. The mismatch only becomes apparent during visual
  inspection; this example contained several stale names despite otherwise complete automated checks.
- **Where the fix belongs:** manifest/tooling pipeline — add a consumer-facing check that extracts `--c2-*` usages
  from application styles and validates them against installed custom-elements manifests, reporting the owning
  component and closest current property name.
- **Resolved 2026-09-23:** `npm run check:css-contracts` validates app usage against manifests and theme tokens with file/line diagnostics.

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
