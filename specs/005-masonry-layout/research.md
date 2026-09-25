# Masonry planning research

All technical unknowns for this plan are resolved below. The older [`cff-dashboard-layout`](https://github.com/code2nguyen/webcomponents/blob/master/src/components/dashboard-layout/dashboard-layout.component.ts) and [`cff-dashboard-item`](https://github.com/code2nguyen/webcomponents/blob/master/src/components/dashboard-item/dashboard-item.component.ts) supply behavior to preserve, while this repository supplies the package, accessibility, and documentation conventions.

## Package and element structure

**Decision**: Create one publishable `@c2n/masonry` package containing `c2-masonry` and `c2-masonry-item`. Run the repository's Plop component generator for the package wiring, then add the companion item as a second build and manifest entry. Import the item registration from the container entry and publish an item subpath.

**Rationale**: `scripts/generator/plopfile.ts` wires the build graph, theme build, docs app dependency, manifests, preview, and initial tests. `packages/components/tabs` and `packages/components/dashboard` show how one package registers and documents two elements. Consumers can import the package once and use both tags.

**Alternatives considered**: Two packages would complicate a tightly coupled layout contract; copying the old source as one element would omit the tile's public sizing and interaction surface.

## Deterministic packing

**Decision**: Keep one ordered list of tile identities and a pure first-fit packer. For each tile, scan unoccupied cells from top to bottom and left to right for its effective column and row spans; return placements and used row count. The container owns positioning wrappers; application-owned tile nodes stay in place. A committed move changes the ordered list, then repacks. No fixed coordinates are saved.

**Rationale**: This directly implements the clarified global order and automatic packing contract. `apps/examples/observability-nextjs/features/dashboards/dashboard-layout.ts` has a small first-fit precedent; its one-row tiles can be generalized. Keeping the packer independent of the DOM makes collision, removal, and breakpoint cases easy to verify. Private slots, as in `packages/components/reorder-list/src/reorder-list.ts`, let the rendered order change without physically moving framework-owned children.

**Alternatives considered**: CSS dense auto-placement can change visual order in ways the component cannot report or preview reliably. Persisted coordinates conflict with the user's choice to repack at each width. Copying the older free-rectangle coordinator and RxJS service would carry unrelated state and dependencies into the new package.

## Responsive widths and dimensions

**Decision**: Choose the active size range from the masonry container's observed width. Use the legacy four ranges as documented defaults: `xs` below 600 px with 1 column, `sm` from 600 px with 6, `md` from 960 px with 9, and `lg` from 1280 px with 12. Each tile has one row span and independent column spans for those four ranges. A user resize writes only the active column span; a width change repacks the shared order with that range's span. The default row height and gap are CSS custom properties rather than presentation attributes.

**Rationale**: Container width handles split panes and embedded dashboards where the viewport stays wide. The column counts mirror the referenced component, but resize behavior follows the user's clarification rather than the old cross-breakpoint propagation. CSS owns presentation while properties own structural choices, following AGENTS.md.

**Alternatives considered**: Viewport media queries, as used by the old component and `c2-dashboard`, do not respond to a narrow embedding container. Letting one resize alter every range contradicts the clarified spec. Custom author-defined breakpoints are deferred to a later compatible addition; the four named ranges form a finite contract for this version.

## State and application reconciliation

**Decision**: The authoring order and tile attributes establish the initial arrangement. An optional full `layout` property applies an application-supplied snapshot keyed by stable tile IDs. Successful edits update the component's internal snapshot and emit one `layout-change` event containing order, row spans, and all responsive column spans. Assigning a new `layout` property or changing authored children is an external reconciliation and emits no user-commit event. Missing or duplicate IDs disable editing for the whole layout until corrected; invalid snapshots are rejected. Tiles remain visible and diagnostics explain the problem.

**Rationale**: The snapshot gives applications a complete restorable record without fixed coordinates. The later default-localStorage requirement also makes a committed edit survive reload without application glue, while `save-layout="false"` preserves app-owned persistence. The component does not mutate an application-owned persistence object or reorder light-DOM nodes.

**Alternatives considered**: Mandatory app-owned storage would avoid duplicate state but would require glue for the default use case. Mutating tile attributes as the only source of truth can fight framework rendering. One event per pointer movement would be noisy and break the one-commit acceptance scenario.

## Editing and accessibility

**Decision**: Show separate move and resize controls only in edit mode. Model a gesture as an original snapshot plus a candidate snapshot. Pointer Events with capture handle mouse, pen, and touch. Keyboard activation starts a session; arrow keys adjust the candidate, Enter or Space commits, and Escape cancels. A live status message announces identity, destination, and span. Pointer cancel, lost capture, tile removal, disabled editing, or container resize during an unsafe gesture restores the original state. Auto-scroll uses one animation frame loop on the nearest vertical scroller and stops on every exit.

**Rationale**: `packages/components/reorder-list/src/reorder-list.ts` demonstrates this lifecycle and thorough cleanup tests; `packages/components/dashboard/src/dash-card.ts` demonstrates focusable resize controls. Explicit handles prevent clicks on tile content from starting gestures. Keyboard operation, focus retention, and reduced motion satisfy the constitution.

**Alternatives considered**: Whole-tile dragging would compete with forms, charts, links, and nested controls. A pointer-only gesture would fail the accessible component contract. The old item's mouse-oriented listeners and broad RxJS subscriptions are unnecessary here.

## Content overflow and styling

**Decision**: Keep tile spans fixed and scroll overflowing content inside a keyboard-reachable content region. Use documented `@cssproperty` defaults in the shared Sass theme map for visual values, and expose parts for the grid, tile body, handles, and drop preview. Decorative transitions turn off under reduced motion.

**Rationale**: This implements the user's explicit overflow choice while preserving compact packing. The CSS-variable/manifest pipeline and `c2-dash-card` parts are existing conventions. Layout-changing spans remain structural properties, not styling variables.

**Alternatives considered**: Clipping hides information; intrinsic-height growth changes the explicit-span packing model and the meaning of a resize operation.

## Verification and current gate limitation

**Decision**: Validate pure packing and snapshot rules with focused unit tests; validate pointer, touch, keyboard, cancellation, scrolling, responsive repacking, overflow, focus, and styling through the package's shared Playwright harness. Build the package and UI, regenerate the manifest, then run docs, type, lint, and formatting checks. Record focused style-variable-to-rendered-effect evidence for the new tags.

**Rationale**: `playwright.config.ts` discovers package tests automatically, and `tests/README.md` documents the shared harness. The repo-wide `verify:style-contracts` is presently an incomplete fail-closed diagnostic (`specs/004-verify-css-contracts/audit-results.md`), so it cannot be reported as a passing full-library gate; a new component must still satisfy its own documented styling contract and focused evidence.

**Alternatives considered**: Treating the current global diagnostic failure as proof of a new-component defect would obscure the existing 004 work. Skipping target-level style verification would violate the constitution.
