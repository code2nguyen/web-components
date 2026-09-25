---
description: 'Implementation tasks for the responsive masonry component'
---

# Tasks: Responsive Masonry Tile Layout

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [data-model.md](data-model.md), [public contract](contracts/masonry-elements.md), and [quickstart.md](quickstart.md)

**Tests**: Required by FR-011 and the constitution. Write each story's tests before its implementation and verify that they fail for the missing behavior.

**Organization**: Tasks follow the three prioritized user stories. Paths are relative to the repository root. `[P]` means the marked task can run alongside other marked tasks in its stated phase without editing the same file or relying on their incomplete work.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the publishable workspace and both element entry points.

- [x] T001 Run `npm run generate` for the npm component `masonry`, inspect its output, and retain the generated package, test, build-graph, theme, and UI wiring in `packages/components/masonry/`, `package.json`, `packages/tools/theme/package.json`, and `apps/ui/`.
- [x] T002 Run `npm install` after T001 and retain the new workspace link and lockfile changes in `package-lock.json` and `apps/ui/package.json`.
- [x] T003 Extend `packages/components/masonry/package.json` and `packages/components/masonry/vite.config.ts` to publish/register `c2-masonry` plus `c2-masonry-item`, expose `@c2n/masonry/masonry-item.js`, and generate one manifest for both tags; correct generated decorators to `@c2n/core/lit-helper.js` in `packages/components/masonry/src/masonry.ts`.

**Checkpoint**: The package is linked, built by the root graph, and ready for its source and tests. Do not treat generated placeholders as finished documentation.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Establish shared test and type boundaries used by every story.

- [x] T004 [P] Replace generator test placeholders with a reusable mixed-card scenario and source import in `packages/components/masonry/test/scenarios.html` and `packages/components/masonry/test/scenarios.ts`; map the companion subpath in `tests/vite.config.ts` only if the shared server cannot resolve it.
- [x] T005 [P] Define internal tile, placement, responsive-range, snapshot, and diagnostic TypeScript types in `packages/components/masonry/src/masonry-model.ts`, matching the fields and event detail in `specs/005-masonry-layout/contracts/masonry-elements.md` without adding a public API beyond that contract.

**Checkpoint**: Shared fixtures and types exist. User-story behavior is still unimplemented.

---

## Phase 3: User Story 1 — Pack a dashboard of different-sized tiles (Priority: P1) 🎯 MVP

**Goal**: Display dynamic, mixed-span tiles in deterministic first-fit positions, with fixed-height scrollable content and no application-chosen coordinates.

**Independent Test**: With editing off, render at least 12 cards in three span shapes; verify no overlap or out-of-bounds tile, stable placement, empty-state height, repacking after add/remove/span change, and keyboard/pointer access to overflowing content.

### Tests for User Story 1

- [x] T006 [P] [US1] Add failing pure-packer cases for earliest row/column fit, mixed 12-tile shapes, deterministic repeat output, removal-gap reuse, empty input, and invalid spans in `packages/components/masonry/test/masonry-pack.spec.ts`.
- [x] T007 [P] [US1] Add failing element-boundary cases for direct-child placement, mutation repacking within one second, no phantom empty height, and no `layout-change` on author mutations in `packages/components/masonry/test/masonry.spec.ts`.
- [x] T008 [P] [US1] Add failing cases for a fixed declared tile height, internal overflow, reachable keyboard/pointer content, and working slotted controls in `packages/components/masonry/test/masonry.a11y.spec.ts`.

### Implementation for User Story 1

- [x] T009 [US1] Implement a pure first-fit occupancy scan in `packages/components/masonry/src/masonry-pack.ts`: for each ordered tile, use the first free rectangle scanning rows top-to-bottom and columns left-to-right; return zero-based `{id, columnStart, rowStart, columnSpan, rowSpan}` and used row count, never persisted coordinates.
- [x] T010 [P] [US1] Implement item properties and the application-owned default slot in `packages/components/masonry/src/masonry-item.ts`: `itemId` is optional but must be nonempty and unique for editing; `rows` is a positive integer defaulting to `10`; `cols` is a positive integer defaulting to `3`; content remains present even for invalid identity or span input.
- [x] T011 [P] [US1] Implement fixed-span tile surface and keyboard-reachable internal scrolling in `packages/components/masonry/src/masonry-item.scss`, including `content` part and Sass defaults for the public tile surface/content variables in `specs/005-masonry-layout/contracts/masonry-elements.md`.
- [x] T012 [US1] Implement `c2-masonry` placement, grid sizing, authored-order initialization, direct-child add/remove/span observation, and no-op empty state in `packages/components/masonry/src/masonry.ts`; retain application-owned child nodes in light DOM and update component-owned wrappers instead of reordering them.
- [x] T013 [US1] Implement grid geometry and Sass defaults for gap, row height, padding, surface, border, and grid part in `packages/components/masonry/src/masonry.scss`, with every public variable visibly affecting its named region.
- [x] T014 [US1] Validate authored spans and identities in `packages/components/masonry/src/masonry-model.ts`: invalid numeric spans use the documented default/base fallback; missing or duplicate IDs leave every tile visible but disable editing for the entire layout; emit stable `layout-error` reasons without a repeated event on each render.

**Checkpoint**: US1 works as a read-only masonry layout, even when later responsive editing and persistence features are not present.

---

## Phase 4: User Story 2 — Adapt the same tiles to available space (Priority: P2)

**Goal**: Repack one shared tile order as the container crosses four documented width ranges, preserving independent column spans.

**Independent Test**: Resize only the container, not the viewport, through `xs`, `sm`, `md`, and `lg`; all tiles remain visible and non-overlapping, the one-column view follows the same order, and an over-wide span clamps only for rendering.

### Tests for User Story 2

- [x] T015 [P] [US2] Add failing range, boundary, base-fallback, and render-only clamp cases in `packages/components/masonry/test/masonry-pack.spec.ts`: `xs` is below 600 px/1 column, `sm` is 600–959.99 px/6, `md` is 960–1279.99 px/9, and `lg` is 1280 px and above/12.
- [x] T016 [P] [US2] Add failing browser cases for container-only resize, stable order and content, all four ranges, width collapse/restore, and no user-change event on width changes in `packages/components/masonry/test/masonry.spec.ts`.

### Implementation for User Story 2

- [x] T017 [US2] Implement range selection, `colsXs`, `colsSm`, `colsMd`, and `colsLg` resolution in `packages/components/masonry/src/masonry-model.ts`: each optional override is a positive integer; absent overrides use `cols`; clamp effective spans to `1..columnCount` without mutating authored values for other ranges.
- [x] T018 [US2] Expose `cols-xs`, `cols-sm`, `cols-md`, and `cols-lg` item properties with the repository property helper and JSDoc in `packages/components/masonry/src/masonry-item.ts`.
- [x] T019 [US2] Observe the container content width, defer packing until it is positive, and re-run the packer with the same order and active-range spans on range or width changes in `packages/components/masonry/src/masonry.ts`; disconnect the observer on teardown.

**Checkpoint**: US2 adds responsive packing without requiring edit mode or saved layouts.

---

## Phase 5: User Story 3 — Arrange and resize tiles in edit mode (Priority: P3)

**Goal**: Offer explicit move/resize controls, reversible pointer and keyboard sessions, and one complete restorable snapshot for a committed user change.

**Independent Test**: Move and resize with mouse, touch, and keyboard; preview remains within bounds; Enter/Space commits once; Escape/cancel/no-op commits nothing; restored snapshots reproduce order and all spans across width ranges; content controls remain usable outside handles.

### Tests for User Story 3

- [x] T020 [P] [US3] Add failing move/resize pointer and keyboard scenarios for preview, commit, cancel, no-op, and active-range-only column resize in `packages/components/masonry/test/masonry.spec.ts`.
- [x] T021 [P] [US3] Add failing contract cases for `{ version: 1, items: [...] }` snapshot validation/reconciliation, unique nonempty IDs, positive integer `rows`, `columns.xs` in `1..1`, `columns.sm` in `1..6`, `columns.md` in `1..9`, `columns.lg` in `1..12`, and atomic invalid-layout rejection in `packages/components/masonry/test/masonry-pack.spec.ts`.
- [x] T022 [P] [US3] Add failing accessibility scenarios for named controls, keyboard instructions/status, focus retention/fallback, slotted interaction isolation, reduced motion, and an axe scan in normal/edit modes in `packages/components/masonry/test/masonry.a11y.spec.ts`.
- [x] T023 [US3] Add failing browser cases for real mouse/touch/pen input, edge auto-scroll, removal/disconnect, lost pointer capture, and container resize during a gesture in `packages/components/masonry/test/masonry.spec.ts`; use Playwright input APIs and the existing shared harness, not screenshots or browser debugging.

### Implementation for User Story 3

- [x] T024 [US3] Implement versioned `MasonryLayoutSnapshot` validation and dynamic-child reconciliation by stable ID in `packages/components/masonry/src/masonry-model.ts`: array position is global order; append new children in authored order, omit removed children from the next event, reject invalid supplied snapshots as a whole, and keep coordinates out of saved state.
- [x] T025 [US3] Add separate move/resize controls, optional icon slots, documented parts, accessible labels, and a scroll-region name in `packages/components/masonry/src/masonry-item.ts`; controls are absent when `editable` is false and never turn slotted interactive content into a drag handle.
- [x] T026 [P] [US3] Style controls, hover/focus/drag states, icon sizing, and reduced-motion behavior through the public item Sass theme variables in `packages/components/masonry/src/masonry-item.scss`.
- [x] T027 [US3] Implement original/candidate edit-session state and candidate first-fit preview in `packages/components/masonry/src/masonry.ts`; keep the committed arrangement untouched until a real completion and cancel safely when editing turns off, a tile disappears, or a width change makes the candidate unsafe.
- [x] T028 [US3] Implement handle-only pointer capture for mouse, touch, and pen with move/release/cancel/lost-capture transitions in `packages/components/masonry/src/masonry.ts`; bound move and resize candidates before preview or commit.
- [x] T029 [US3] Implement move-control keyboard activation, Left/Up/Right/Down order changes, Home/End boundaries, and Enter/Space/Escape completion in `packages/components/masonry/src/masonry.ts`.
- [x] T030 [US3] Implement resize-control keyboard activation, Left/Right active-range column changes, Up/Down shared row changes, and Enter/Space/Escape completion in `packages/components/masonry/src/masonry.ts`; preserve every nonactive range's stored column span.
- [x] T031 [US3] Emit nonbubbling, noncancelable `layout-change` exactly once per real user commit with complete order/rows/all ranges and `itemId`, `action`, and `inputMethod`; accept programmatic `layout` assignment without a user-change event and emit distinct `layout-error` diagnostics in `packages/components/masonry/src/masonry.ts`.
- [x] T032 [US3] Add nearest-scroll-container edge auto-scroll with one animation-frame loop, status announcements, focus return/fallback, and complete listener/capture/frame cleanup on every exit in `packages/components/masonry/src/masonry.ts`.
- [x] T033 [US3] Style the candidate placeholder and decorative relocation through the public container Sass variables and parts in `packages/components/masonry/src/masonry.scss`, preserving visible preview and status under reduced motion.

**Checkpoint**: All three stories work, and applications can save/restore edits without storing fixed coordinates.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Publish one coherent contract and verify the new package across repository surfaces.

- [x] T034 [P] Write `packages/components/masonry/README.md` with installation, when to use masonry versus `c2-dashboard`, typed API, snapshot/events, keyboard/overflow behavior, full styling inventory, and a realistic framework-neutral example matching `specs/005-masonry-layout/contracts/masonry-elements.md`.
- [x] T035 [P] Replace the generated docs stub with installation, one copyable responsive dashboard usage card, edit/persistence example, accessibility guidance, and public-only API references in `apps/ui/src/content/components/masonry.mdx`.
- [x] T036 [P] Build realistic mixed-card and substantial CSS-variable/part variants in `apps/ui/src/content/gallery/masonry.mdx`, and replace placeholder landing markup in `apps/ui/src/data/component-previews.ts`.
- [x] T037 [P] Complete the standalone demo harness with mixed spans, overflowing content, interactive controls, and saved-layout logging in `packages/components/masonry/index.html`; keep generated side-effect module and manifest wiring aligned in `apps/ui/src/data/component-modules.ts` and `apps/ui/src/store/component-manifests.ts`.
- [x] T038 Regenerate and review `packages/components/masonry/custom-elements.json` after `npm run build -w packages/components/masonry`; ensure both tags, attributes/properties, events, slots, parts, and every documented CSS variable match source JSDoc and `specs/005-masonry-layout/contracts/masonry-elements.md`.
- [x] T039 Run `npm run build:tools` and review regenerated React/Vue/editor declarations under `packages/tools/framework-types/` against `packages/components/masonry/custom-elements.json`; retain generated outputs only where the repository tracks them.
- [x] T040 Add focused target-effect cases for every public Sass variable and part in `packages/components/masonry/test/masonry.a11y.spec.ts`; record any unavoidable constitution exception with scope, reason, impact, and dated reassessment in `specs/005-masonry-layout/plan.md` before claiming completion.
- [x] T041 Run the commands in `specs/005-masonry-layout/quickstart.md` plus `npm run check:dogfood`, `npm run ui:build`, and the relevant package tests in Chromium/Firefox/WebKit; fix failures in the affected `packages/components/masonry/` or `apps/ui/` files and record the pre-existing full-library style-contract diagnostic separately from new-tag results. See `validation.md` for the unrelated Angular abort and existing style-contract gate.

**Constitution check**: Before completion, confirm AI-readable source/manifest/types, complete visible styling hooks, realistic runnable UI examples, one synchronized public contract, accessible cross-browser input, and passing relevant quality gates. Do not claim a full-library style-contract pass while the separately documented feature-004 audit remains incomplete.

---

## Dependencies & Execution Order

### Phase dependencies

```text
Phase 1 setup → Phase 2 foundation → US1 core packing → US2 responsive ranges → US3 editing/persistence → Phase 6 polish
```

US1 is the MVP and can be demonstrated after T006–T014. US2 depends on US1's packer and rendered grid. US3 depends on US1's placement and US2's range-specific span model. Polish requires the public behavior of all selected stories; source JSDoc and manifest review happen after API implementation. Within each story, write and observe failing tests first, then implement the model/algorithm, then integrate elements and styles, then rerun the story's tests.

### Parallel opportunities

- **Foundation**: T004 and T005 use separate test versus source files after setup.
- **US1**: T006, T007, and T008 are independent failing test files; T010 and T011 split item behavior from styling after the packer contract is settled.
- **US2**: T015 and T016 cover separate pure-model and browser behavior before T017–T019.
- **US3**: T020, T021, and T022 target separate browser, model, and accessibility test work; after T025, T026 can proceed while container session logic continues.
- **Polish**: T034–T037 touch different publication surfaces. Integrate and rebuild before T038–T041.

## Parallel Execution Examples

**US1**: Run T006 (`packages/components/masonry/test/masonry-pack.spec.ts`), T007 (`packages/components/masonry/test/masonry.spec.ts`), and T008 (`packages/components/masonry/test/masonry.a11y.spec.ts`) concurrently after foundation; then T010 (`src/masonry-item.ts`) and T011 (`src/masonry-item.scss`) can proceed separately.

**US2**: Run T015 (`packages/components/masonry/test/masonry-pack.spec.ts`) and T016 (`packages/components/masonry/test/masonry.spec.ts`) concurrently; implement the range resolver before the item and container integration.

**US3**: Run T020 (`packages/components/masonry/test/masonry.spec.ts`), T021 (`packages/components/masonry/test/masonry-pack.spec.ts`), and T022 (`packages/components/masonry/test/masonry.a11y.spec.ts`) concurrently. T023 extends T020's file only after T020 finishes.

## Implementation Strategy

1. Deliver the US1 MVP as a read-only, deterministic masonry layout, then validate it independently.
2. Add US2 responsive behavior without requiring edit mode; validate container-width changes and preserved order independently.
3. Add US3 edit mode and persistence, first with failing behavior tests, then validate both pointer and keyboard paths.
4. Finish documentation, manifests, generated types, styling evidence, and all relevant quality gates. Each checkpoint must retain passing behavior from the earlier stories.

## Phase 7: Convergence

- [x] T042 Complete T023 with trusted touch-drag and pen-drag evidence for both move and resize, cancellation, and one-change commits using a permitted input method; retain the existing mouse and synthetic pointer-contract tests but do not treat synthetic dispatch or a touch tap as gesture coverage, and document any hardware limitation per Constitution V / FR-008 (partial).
- [x] T043 Add an element-boundary browser case in `packages/components/masonry/test/masonry.spec.ts` that captures a real `layout-change` snapshot, assigns it to a fresh `c2-masonry.layout`, and verifies restored order and all four responsive spans after width changes without a new user-change event per Constitution V / FR-009 (partial).
- [x] T044 Cancel or safely reconcile an active edit when any direct `c2-masonry-item` is added, removed, or changes a span, not only when the active item disappears; test removal of another tile during a gesture and prove the next preview/event cannot contain a stale tile per FR-003 / US1-AC2 (partial).
- [x] T045 Detect direct-child authored reordering when no application-supplied layout controls order, repack into that order without moving application-owned nodes or emitting `layout-change`, and cover both default and saved-order precedence at the element boundary per FR-003 (partial).
- [x] T046 Select masonry width ranges from observed container content width rather than `getBoundingClientRect().width`; add a border-bearing breakpoint test that keeps the viewport fixed and verifies the correct column count per plan: container width (contradicts).
- [x] T047 Coalesce repeated pointer candidate packing to one animation-frame update, clean up scheduled work on all gesture exits, and add the planned 100-tile stress case with bounded repack responsiveness per plan: performance (partial).
- [x] T048 Add default-on localStorage persistence for changed user commits, `save-layout="false"` opt-out, and optional `storage-key`; validate restore, explicit `layout` precedence, malformed/unavailable storage, and document the storage key and API per the updated FR-014.
