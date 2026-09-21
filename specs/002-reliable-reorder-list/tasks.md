---
description: 'Implementation tasks for a reliable, accessible reorder-list component'
---

# Tasks: Reliable Reorder List

**Input**: Design documents from `/specs/002-reliable-reorder-list/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/reorder-list-contract.md`, `quickstart.md`

**Tests**: Browser, accessibility, contract, generated-artifact, and manual assistive-technology checks are required by the specification. Within each user-story phase, add the failing tests before changing the implementation.

**Organization**: Tasks are grouped by user story so each behavior slice has a stated goal and an independent verification path. Task descriptions name the exact files and observable contract to implement.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because it changes a different file and has no unmet dependency.
- **[Story]**: Maps the task to one user story (`US1`–`US5`). Setup, foundational, and final cross-cutting tasks intentionally have no story label.
- Every task includes an exact repository-relative file path.

## Phase 1: Setup (Shared Test Infrastructure)

**Purpose**: Prepare reusable browser scenarios and a narrowly scoped touch-equivalent project without broadening the test matrix for unrelated packages.

- [x] T001 Add a `reorder-touch` Playwright project, scoped with `testMatch` to the reorder-list suite and configured from a touch-capable Chromium device, in `playwright.config.ts`.
- [x] T002 [P] Expand `packages/components/reorder-list/test/scenarios.html` with deterministic fixtures for keyed and unkeyed rows, fixed rows, nested controls, unequal heights, offset containers, scrolling, and runtime child mutation.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Replace numeric slot indexes as the state model with stable item identity, explicit visual order, and one lifecycle foundation used by every input method.

**⚠️ CRITICAL**: No user-story implementation begins until this phase is complete.

- [x] T003 Add failing characterization tests for authored-order initialization, empty and single-item lists, exclusion of `placeholder` and `dragging-item` children, stable element identity, and zero initialization/reconciliation events in `packages/components/reorder-list/test/reorder-list.spec.ts`.
- [x] T004 Define `ReorderInputMethod`, item/session/order/geometry records, `ReorderEventDetail`, `ReorderErrorEventDetail`, `ReorderListEventMap`, and typed listener overloads in `packages/components/reorder-list/src/reorder-list.ts`.
- [x] T005 Implement ordinary-child classification, stable private assignment IDs, separate authored and visual order arrays, and projection that never physically reorders consumer-owned children in `packages/components/reorder-list/src/reorder-list.ts`.
- [x] T006 Implement idle child reconciliation that adopts application-authored insertion, removal, and DOM reordering exactly once without success events in `packages/components/reorder-list/src/reorder-list.ts`.
- [x] T007 Introduce the shared armed/active/commit/cancel session model and one idempotent cleanup path for listeners, pointer capture, animation frames, feedback, transforms, and transient assignments in `packages/components/reorder-list/src/reorder-list.ts`.
- [x] T008 Run `npm run type-check -w packages/components/reorder-list` and the initialization/reconciliation tests, fixing only foundational failures in `packages/components/reorder-list/src/reorder-list.ts` and `packages/components/reorder-list/test/reorder-list.spec.ts`.

**Checkpoint**: The component projects every ordinary child exactly once, owns visual order without moving light DOM, and has a shared lifecycle ready for pointer and keyboard input.

---

## Phase 3: User Story 1 - Reorder Items Reliably With a Pointer (Priority: P1) 🎯 MVP

**Goal**: Mouse, touch-equivalent, and pen-type pointer interactions show an accurate destination and commit exactly one durable visual reorder while clicks, controls, cancellations, and no-ops remain unaffected.

**Independent Test**: Render three movable rows, drag the first after the third with trusted mouse input and the touch-capable project, verify preview/placeholder/final visual order and canonical payload, then repeat threshold-only, no-op, readonly, nested-control, outside-release, pointercancel, lost-capture, and Escape paths and verify zero success events.

### Tests for User Story 1

- [x] T009 [US1] Add failing pointer tests for primary-button eligibility, mouse/touch/pen input-method mapping, threshold behavior, nested interactive descendants, readonly mode, preview/placeholder alignment, valid drop, no-op drop, outside release, `pointercancel`, unexpected lost capture, Escape, event flags, event cardinality, and cleanup in `packages/components/reorder-list/test/reorder-list.spec.ts`.

### Implementation for User Story 1

- [x] T010 [US1] Replace document mouse listeners with primary Pointer Events, candidate arming, threshold normalization, interactive-descendant exclusion, post-pickup pointer capture, and pointer-specific cancellation in `packages/components/reorder-list/src/reorder-list.ts`.
- [x] T011 [US1] Compute pointer destinations from current `clientX`/`clientY` and viewport rectangles, preserve pickup offset, and render the candidate order, fallback placeholder, and recognizable preview without mutating direct-child DOM order in `packages/components/reorder-list/src/reorder-list.ts`.
- [x] T012 [US1] Commit real pointer changes immediately and dispatch one bubbling/composed/non-cancelable `reorder` plus the deprecated bubbling/cancelable numeric `change`, while suppressing both for initialization, reconciliation, threshold-only, cancellation, error, and no-op paths, in `packages/components/reorder-list/src/reorder-list.ts`.
- [x] T013 [US1] Add whole-row editable touch ownership, visible default pointer feedback, active item state, fixed preview positioning, and clean idle-state restoration in `packages/components/reorder-list/src/reorder-list.scss`.
- [x] T014 [US1] Run the focused Chromium and `reorder-touch` pointer tests and resolve all US1 regressions in `packages/components/reorder-list/src/reorder-list.ts`, `packages/components/reorder-list/src/reorder-list.scss`, and `packages/components/reorder-list/test/reorder-list.spec.ts`.

**Checkpoint**: Pointer reordering is independently usable and testable as the MVP, with correct visual order and compatibility events.

---

## Phase 4: User Story 2 - Reorder Without a Pointer (Priority: P1)

**Goal**: Keyboard users can discover, start, move, commit, and cancel reordering with stable focus, correct list semantics, and complete status announcements.

**Independent Test**: Focus one movable wrapper, press Space, ArrowDown twice, and Space to commit; repeat with Home/End, boundary attempts, Escape, fixed/readonly rows, and nested controls, then verify focus identity, visual order, event cardinality, semantics, announcements, and axe output.

### Tests for User Story 2

- [x] T015 [US2] Add failing tests for roving focus, list/listitem semantics, absolute `aria-posinset`/`aria-setsize`, Space pickup/drop, ArrowUp/ArrowDown, Home/End, Escape, boundary behavior, fixed/readonly rows, nested-control key preservation, focus retention/fallback, live messages, and representative idle/active axe scans in `packages/components/reorder-list/test/reorder-list.spec.ts`.

### Implementation for User Story 2

- [x] T016 [US2] Render a named `role="list"`, `role="listitem"` placement wrappers with absolute position metadata, one movable roving tab stop, stable hidden instructions, and one persistent polite atomic status region in `packages/components/reorder-list/src/reorder-list.ts`.
- [x] T017 [US2] Implement Space pickup/drop, ArrowUp/ArrowDown movable-destination steps, Home/End jumps, Escape cancellation, nested-interactive exclusion, and canonical `inputMethod: 'keyboard'` commits through the shared session model in `packages/components/reorder-list/src/reorder-list.ts`.
- [x] T018 [US2] Implement human-readable label resolution and pickup, movement, boundary, commit, cancel, and invalid-configuration announcements while keeping focus tied to element identity or the documented nearest-survivor/host fallback in `packages/components/reorder-list/src/reorder-list.ts`.
- [x] T019 [US2] Add default keyboard focus visibility and visually hidden instruction/status styling without disturbing consumer child presentation in `packages/components/reorder-list/src/reorder-list.scss`.
- [x] T020 [US2] Run the focused keyboard/accessibility Playwright tests and fix only US2 failures in `packages/components/reorder-list/src/reorder-list.ts`, `packages/components/reorder-list/src/reorder-list.scss`, and `packages/components/reorder-list/test/reorder-list.spec.ts`.

**Checkpoint**: Keyboard reordering works without pointer assistance, preserves rich descendant semantics, and exposes understandable state to assistive technology.

---

## Phase 5: User Story 3 - Keep Fixed and Dynamic Items Predictable (Priority: P2)

**Goal**: Fixed rows remain at absolute indexes, movable rows cross them safely, duplicate keys fail explicitly, and application child mutations reconcile or cancel without loss or duplication.

**Independent Test**: Reorder `[A, fixed F, B, C]` in both directions, exercise all accepted `data-fixed` string forms, then insert, remove, and externally reorder children while idle and active; verify fixed positions, unique children, duplicate-key errors, cancellation cleanup, focus fallback, and zero reconciliation success events.

### Tests for User Story 3

- [x] T021 [US3] Add failing tests for fixed absolute positions, cross-fixed movement, `data-fixed` boolean strings, fixed-row controls, mixed keyed/unkeyed identity, duplicate-key errors, idle insertion/removal/reorder, active mutation, active-item removal, editability loss, disconnect, focus fallback, and item uniqueness in `packages/components/reorder-list/test/reorder-list.spec.ts`.

### Implementation for User Story 3

- [x] T022 [US3] Parse `data-fixed` with repository boolean semantics and implement movable-subsequence remove/insert/refill so fixed elements retain absolute indexes for pointer and keyboard destinations in `packages/components/reorder-list/src/reorder-list.ts`.
- [x] T023 [US3] Validate non-empty `data-reorder-key` values before pickup, preserve order/focus on duplicates, dispatch one typed bubbling/composed/non-cancelable `reorder-error`, announce the configuration error, and emit no success event in `packages/components/reorder-list/src/reorder-list.ts`.
- [x] T024 [US3] Reconcile idle direct-child insertion, removal, and authored reorder as authoritative while preserving each ordinary child exactly once and emitting no user event in `packages/components/reorder-list/src/reorder-list.ts`.
- [x] T025 [US3] Cancel before reconciliation on active mutation, active-item removal, `editable` loss, empty/hidden invalid state, or disconnect, restoring surviving items and the documented focus fallback through the shared cleanup path in `packages/components/reorder-list/src/reorder-list.ts`.
- [x] T026 [US3] Run focused fixed/dynamic/key/lifecycle Playwright tests and resolve all US3 failures in `packages/components/reorder-list/src/reorder-list.ts` and `packages/components/reorder-list/test/reorder-list.spec.ts`.

**Checkpoint**: Fixed and runtime-changing content is deterministic, and invalid consumer identity is reported without corrupting state.

---

## Phase 6: User Story 4 - Reorder in Constrained and Scrolling Layouts (Priority: P2)

**Goal**: Pointer destinations stay correct with scrolling, page offsets, transforms, unequal/changing sizes, and missing scroll ancestors, while automatic scrolling is bounded and fully cleaned up.

**Independent Test**: In an offset container with unequal rows, drag through top/middle/bottom page positions and across a layout resize, verify nearest-ancestor edge scrolling and final order, then repeat with `autoscrolldisabled`, no eligible ancestor, container boundaries, cancellation, and a 100-item render-count probe.

### Tests for User Story 4

- [x] T027 [US4] Add failing tests for offset viewport geometry, pre-scrolled pages/ancestors, unequal and changing heights, transformed and RTL pages on a vertical axis, nearest eligible overflow ancestor, edge scrolling, scroll boundaries, disabled/no-container behavior, terminal cleanup, and 100-item destination-render limits in `packages/components/reorder-list/test/reorder-list.spec.ts`.

### Implementation for User Story 4

- [x] T028 [US4] Implement safe nearest vertical scroll-ancestor discovery and one viewport-coordinate geometry snapshot refreshed after relevant scroll, destination render, and observed layout-size changes in `packages/components/reorder-list/src/reorder-list.ts`.
- [x] T029 [US4] Implement one bounded request-animation-frame auto-scroll loop that honors `autoScrollDisabled`, remeasures after each step, stops at boundaries, and is canceled by every terminal path in `packages/components/reorder-list/src/reorder-list.ts`.
- [x] T030 [US4] Coalesce pointer destination updates to at most one render per meaningful index change and keep 100-item reconciliation/commit linear in `packages/components/reorder-list/src/reorder-list.ts`.
- [x] T031 [US4] Run the focused scroll/geometry/performance suite in Chromium, Firefox, and WebKit and resolve all US4 failures in `packages/components/reorder-list/src/reorder-list.ts` and `packages/components/reorder-list/test/reorder-list.spec.ts`.

**Checkpoint**: Realistic constrained layouts no longer introduce coordinate drift, runaway scrolling, or excess rendering.

---

## Phase 7: User Story 5 - Consume a Clear Public Contract (Priority: P3)

**Goal**: Developers and AI tools can adopt, persist, style, and verify the component using synchronized source metadata, generated declarations, package docs, and realistic examples only.

**Independent Test**: Starting from the published docs and declarations, build the documented editable queue without numeric item slots; verify fixed/keyed rows, custom feedback, keyboard operation, canonical persistence, legacy migration, all public parts/variables, reduced motion, and agreement across generated surfaces.

### Tests for User Story 5

- [x] T032 [US5] Add failing public-contract tests for host properties/observed attributes, item markers, `container`/`item`/`placeholder`/`dragging-item` parts, custom feedback exclusion, every existing and new CSS variable, default feedback visibility, reduced motion, typed event details, and no required numeric consumer slots in `packages/components/reorder-list/test/reorder-list.spec.ts`.

### Implementation for User Story 5

- [x] T033 [US5] Make source JSDoc authoritative for purpose, attributes/properties, direct-child markers, slots, events, parts, CSS variables/defaults, accessible naming, touch tradeoffs, and legacy migration in `packages/components/reorder-list/src/reorder-list.ts`.
- [x] T034 [US5] Add the `container` part, preserve existing legacy CSS variables, add documented focus/active/placeholder/preview/motion variables through the SCSS theme map, and disable nonessential interpolation under reduced motion in `packages/components/reorder-list/src/reorder-list.scss`.
- [x] T035 [P] [US5] Rewrite installation, decision guidance, full API/styling/accessibility reference, canonical persistence example, and `change`-to-`reorder` migration in `packages/components/reorder-list/README.md` after T033–T034.
- [x] T036 [P] [US5] Repair the standalone published-package import and replace remote/demo-only dependencies with a realistic fixed/keyed queue, nested control, custom feedback, keyboard instructions, and canonical event handling in `packages/components/reorder-list/index.html` after T033–T034.
- [x] T037 [P] [US5] Rewrite the Docs usage card with public-only editable queue markup and explain persistence, keys, fixed rows, keyboard controls, accessible naming, touch ownership, cancellation, and legacy migration in `apps/ui/src/content/components/reorder-list.mdx` after T033–T034.
- [x] T038 [P] [US5] Create realistic styled queue variants using fence-local CSS, including substantial public-part/custom-property customization and reduced-motion-safe states, in `apps/ui/src/content/gallery/reorder-list.mdx` after T033–T034.
- [x] T039 [P] [US5] Audit the declared special slots against public styling parts and record any required contract correction, without treating private numeric assignments as API, in `scripts/data/slot-styling-audit.json` after T033–T034.
- [x] T040 [US5] Build `packages/components/reorder-list` to regenerate and review synchronized API metadata and framework declarations in `packages/components/reorder-list/custom-elements.json`, `packages/components/reorder-list/react.d.ts`, and `packages/components/reorder-list/vue.d.ts`.
- [x] T041 [US5] Run the AI-tool build/smoke workflow and review the regenerated reorder-list discovery entry for contract parity in `packages/tools/skill/skills/c2n-components/references/component-catalog.md`.
- [x] T042 [US5] Run the public-contract browser tests, `npm run ui:build`, `npm run docs:check`, and `npm run check:dogfood`, fixing US5-only discrepancies in `packages/components/reorder-list/README.md`, `packages/components/reorder-list/index.html`, `apps/ui/src/content/components/reorder-list.mdx`, and `apps/ui/src/content/gallery/reorder-list.mdx`.

**Checkpoint**: A consumer can implement the component from published surfaces alone, and generated/human/AI documentation describes one coherent contract.

---

## Phase 8: Polish & Cross-Cutting Validation

**Purpose**: Validate the combined feature against lifecycle, accessibility, performance, release, and constitutional requirements.

- [x] T043 Run package type-check/build plus the complete reorder-list suite across Chromium, Firefox, WebKit, and `reorder-touch`, recording any test corrections in `packages/components/reorder-list/test/reorder-list.spec.ts`.
- [x] T044 [P] Execute 100 mixed completed/canceled/no-op attempts and the 20-item pointer/keyboard timing journeys from the success criteria, adding any missing deterministic regression coverage to `packages/components/reorder-list/test/reorder-list.spec.ts`.
- [ ] T045 [P] Perform VoiceOver/Safari and NVDA/Firefox-or-Chrome smoke tests for instructions, position updates, boundaries, commit, cancellation, and duplicate-key errors, and record dated results and device-coverage qualifications in `specs/002-reliable-reorder-list/quickstart.md`.
- [x] T046 Run package and documentation quality gates (`type-check`, build, focused tests, docs, lifecycle, dogfood, and UI build) and correct only reorder-list findings in `packages/components/reorder-list/` and `apps/ui/src/content/`.
- [x] T047 Run repository release gates (`npm run build`, `npm run test:type-check`, `npm test`, `npm run lint:check`, `npm run format:check`, `npm run docs:check`, `npm run check:lifecycle`, `npm run check:dogfood`, and `npm run ui:build`) and resolve feature regressions in `packages/components/reorder-list/`, `apps/ui/src/content/components/reorder-list.mdx`, `apps/ui/src/content/gallery/reorder-list.mdx`, or `playwright.config.ts` according to the failing gate.
- [x] T048 Re-run `npm run build:tools`, `npm run mcp:smoke`, and `git diff --check`; review committed versus ignored generated outputs and record the final constitution compliance and artifact-parity result in `specs/002-reliable-reorder-list/quickstart.md`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 — Setup**: Starts immediately. T001 and T002 are independent.
- **Phase 2 — Foundational**: Depends on Phase 1 and blocks every user story. Execute T003 before implementation; then T004 → T005 → T006 → T007 → T008.
- **Phase 3 — US1**: Depends on Phase 2 and is the pointer MVP.
- **Phase 4 — US2**: Depends on Phase 2. It is independently testable, but sequential execution after US1 is recommended because both edit `reorder-list.ts`.
- **Phase 5 — US3**: Depends on Phase 2 and integrates with the shared session model. Sequential execution after the two P1 stories minimizes conflicts in `reorder-list.ts`.
- **Phase 6 — US4**: Depends on US1 pointer pickup/destination behavior and Phase 2 cleanup; it can be deferred without breaking non-scrolling pointer or keyboard stories.
- **Phase 7 — US5**: Depends on the desired runtime stories so documentation and generated outputs describe the settled contract. T035–T039 can run in parallel after T033–T034.
- **Phase 8 — Polish**: Depends on every story selected for release.

### User Story Dependencies

- **US1 (P1)**: Foundation only. This is the smallest releasable behavior slice and MVP.
- **US2 (P1)**: Foundation only for behavior; shares implementation files with US1 but does not require a pointer to verify.
- **US3 (P2)**: Foundation only for its model; reuses both input paths when the full product is assembled.
- **US4 (P2)**: Requires US1 because auto-scroll and geometry extend active pointer reordering.
- **US5 (P3)**: Describes and publishes whichever runtime stories are complete; for the specified release it follows US1–US4.

### Within Each User Story

1. Add the story's failing browser/contract tests and confirm the relevant assertions fail for the intended reason.
2. Implement the behavioral model in `reorder-list.ts` before presentation in `reorder-list.scss`.
3. Run the story-focused tests and keep non-story behavior green.
4. Stop at the checkpoint and verify the independent test before continuing.

### Dependency Graph

```text
Setup
  └─ Foundation
       ├─ US1 Pointer (MVP) ──┐
       ├─ US2 Keyboard ───────┼─ US3 Fixed/Dynamic ──┐
       └──────────────────────┘                      ├─ US5 Public Contract ── Polish
                       US1 Pointer ── US4 Scrolling ─┘
```

## Parallel Opportunities

- T001 and T002 can run concurrently because they edit `playwright.config.ts` and `test/scenarios.html` respectively.
- US1, US2, and US3 are independently verifiable after Foundation, but concurrent implementation is not recommended without file ownership because they all edit `packages/components/reorder-list/src/reorder-list.ts` and one shared spec.
- After T033–T034 settle the source contract, T035, T036, T037, T038, and T039 can run concurrently in separate documentation/audit files.
- During final validation, T044 and T045 can run concurrently because one extends automated tests while the other records manual assistive-technology evidence.

## Parallel Examples by User Story

### User Story 1

US1 is intentionally serial: T009 establishes failing tests, T010–T013 touch the same implementation contract, and T014 validates the slice. Do not parallelize edits to `reorder-list.ts` and `reorder-list.scss` until pointer state names and rendered classes are agreed.

### User Story 2

US2 is intentionally serial through T020 because semantics, focus, key handling, status text, and hidden/focus styling share rendered identifiers. Its independent test can run without any pointer action.

### User Story 3

US3 is intentionally serial through T026 because fixed-position transformation, duplicate-key validation, mutation reconciliation, and cancellation all modify the same order/session invariants.

### User Story 4

US4 is intentionally serial through T031 because geometry measurement, the animation-frame loop, and render coalescing share teardown state and must be verified together.

### User Story 5

After source tasks T033–T034:

```text
T035 README             ┐
T036 standalone harness ├─ in parallel → T040 generated package artifacts → T041 AI catalog → T042 verification
T037 UI docs            │
T038 UI gallery         │
T039 slot audit         ┘
```

## Implementation Strategy

### MVP First

1. Complete Setup (T001–T002).
2. Complete Foundation (T003–T008).
3. Complete US1 (T009–T014).
4. Stop and run the US1 independent pointer test in Chromium and `reorder-touch`.
5. Demo the immediate visual commit plus canonical and compatibility events before expanding scope.

### Incremental Delivery

1. **Foundation + US1**: Reliable pointer MVP.
2. **Add US2**: Equal keyboard access, focus, semantics, and announcements.
3. **Add US3**: Production-safe fixed rows, keys, and dynamic content.
4. **Add US4**: Correctness in constrained and scrolling layouts.
5. **Add US5**: Publish synchronized public contracts, examples, styling hooks, and AI metadata.
6. **Polish**: Cross-browser, assistive-technology, performance, repository, and release verification.

### Safe Parallel Team Strategy

1. Pair on Setup and Foundation because these establish shared invariants.
2. Assign one owner to `packages/components/reorder-list/src/reorder-list.ts` while other contributors prepare non-overlapping scenario fixtures or review test expectations.
3. Once runtime behavior settles, distribute T035–T039 across package docs, harness, UI docs, gallery, and audit files.
4. Rejoin for generated-artifact review and release gates.

## Notes

- `[P]` means different files and no unmet dependency; it does not mean tests may be skipped or written after implementation.
- Numeric slot names remain private projection metadata and must never appear as required consumer markup.
- Trusted mouse and keyboard journeys are browser integration evidence; touch-device emulation and pen pointer-type tests must not be described as physical-hardware validation.
- Keep consumer-owned direct-child DOM order untouched; reconcile later application mutations as authoritative without emitting user success events.
- Preserve legacy `change` detail and flags until the next explicitly breaking release, and direct new persistence code to `reorder`.
- Review generated files as release artifacts; do not commit ignored MCP registry or framework-type build output.

## Phase 9: Convergence

- [x] T049 CRITICAL Make the generated `dragstartthreshold` attribute default in `packages/components/reorder-list/custom-elements.json` agree literally with the source/member default of `10`, and add a generated-contract assertion that prevents symbolic/default drift, per FR-023 and Constitution I/IV (contradicts).
- [x] T050 CRITICAL Make custom `placeholder` and `dragging-item` feedback flat trees non-interactive while active or hidden, and add browser coverage proving slotted buttons/links cannot receive focus or activation as feedback, per the interactive-feedback edge case and Constitution V (partial).
- [x] T051 Detect zero-sized or hidden host/list/active-item state during pointer and keyboard sessions, cancel through the shared cleanup path, and add regression coverage for restored order, feedback removal, scrolling shutdown, and zero success events, per FR-014 (partial).
- [x] T052 Add observable browser tests for outside pointer release, `pointercancel`, unexpected lost capture, active-item removal, list emptying, and disconnect, asserting every terminal path clears capture/listeners/frames/transient feedback and preserves surviving items without success events, per FR-024 and plan: lifecycle verification (partial).
- [x] T053 Add cross-browser geometry regressions for pre-scrolled pages and ancestors, live item-height changes, transformed and RTL pages on the vertical axis, no eligible scroll container, and scroll-boundary cleanup in `packages/components/reorder-list/test/reorder-list.spec.ts`, per FR-016/FR-024 and plan: geometry verification (partial).
- [x] T054 Add the planned 100-item interaction regression that counts destination-triggered component renders and concurrent auto-scroll animation frames, enforcing at most one render per meaningful destination change and one active scroll frame, per plan: performance goal and 100-item verification (partial).

## Phase 10: Convergence

- [x] T055 HIGH Make zero-sized active items and their placement wrappers invalidate pointer sessions as well as keyboard sessions, and expand browser coverage across hidden and zero-sized host, list container, active item, and active wrapper states for both input paths; assert restored order, zero success events, feedback removal, and stopped auto-scroll, per FR-014 and T051 (partial).
- [x] T056 Extend the custom-feedback regression to attempt trusted activation of the slotted placeholder button and preview link while their feedback regions are active and hidden, and assert that neither click handlers nor navigation run in addition to the existing focus checks, per the interactive-feedback edge case, Constitution V, and T050 (partial).
- [x] T057 Instrument every lifecycle cancellation regression with its actual pointer ID and observable counters for pointer capture, document keydown listeners, scroll listeners, and pending animation frames; assert cleanup after outside release, `pointercancel`, unexpected lost capture, active-item removal, list emptying, and disconnect, per FR-024, the plan lifecycle strategy, and T052 (partial).

## Phase 11: Convergence

- [x] T058 HIGH Add a pointer invalid-visibility regression in a genuinely overflowing nearest scroll container that first proves auto-scroll has an active animation frame, then hides or zero-sizes a required region and asserts the frame is canceled, scrolling settles, order is restored, transient feedback is removed, and no success event fires, per FR-014 and T055 (partial).
