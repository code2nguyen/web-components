---
description: 'Dependency-ordered implementation tasks for the complete slot styling contract'
---

# Tasks: Complete Slot Styling Contract

**Input**: Design documents from `specs/001-slot-styling-contract/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/slot-styling-contract.md`, `quickstart.md`

**Tests**: Required by FR-010, FR-011, the Conditional Region Hydration Contract, and the Reactive Update Contract. Write the listed contract and browser tests before the implementation they guard, and verify that they fail for the intended reason.

**Organization**: Tasks are grouped by user story so each story remains independently deliverable and testable. Runtime hardening that preserves visible slot regions belongs to User Story 1; contract discovery belongs to User Story 2; framework proof belongs to User Story 3.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because it touches different files and has no dependency on an incomplete task
- **[Story]**: Maps the task to User Story 1, 2, or 3; setup, foundation, and polish tasks have no story label
- Every task names the concrete file or file set it changes

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish the checked-in audit artifact and deterministic fixtures without changing runtime behavior.

- [x] T001 Create the version-1 registry and JSON schema with the exact `tag`, `slot`, `decision`, `parts`, `variables`, `delegateTag`, `reason`, and `states` constraints from `data-model.md` in `scripts/data/slot-styling-audit.json` and `scripts/data/slot-styling-audit.schema.json`
- [x] T002 [P] Create valid and invalid registry fixtures for missing/stale/duplicate slots, unknown decisions and references, shared parts, default-slot-to-semantic-part mappings, assigned content, variables, delegation, forbidden fields, duplicate array values, invalid patterns, and weak descriptions in `scripts/fixtures/slot-styling-audit/*.json`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Build the manifest-driven contract and lifecycle guards required before component batches can be trusted.

**⚠️ CRITICAL**: No user-story implementation begins until the validator can distinguish a deliberate no-part decision from a missing or stale contract.

- [x] T003 Write failing unit tests for registry schema enforcement, publishable-package discovery, missing/stale/duplicate identities, decision-specific fields, invalid part/variable/delegate references, default-slot mappings, shared parts, and explicit semantic descriptions in `scripts/check-component-docs.test.mjs`
- [x] T004 Implement publishable-package discovery and registry validation against generated manifests and `scripts/data/slot-styling-audit.schema.json` in `scripts/lib/component-contract-scope.mjs` and `scripts/lib/slot-styling-audit.mjs`
- [x] T005 Integrate audit totals and actionable validation failures into `npm run docs:check` in `scripts/check-component-docs.mjs`
- [x] T006 Make registry scaffolding preserve reviewed `part`, `variables`, `delegated`, and non-name-equivalent decisions, and add regression tests that reject destructive rewrites in `scripts/generate-slot-styling-audit.mjs` and `scripts/check-component-docs.test.mjs`
- [x] T007 Populate exactly one reviewed decision for every published `(tag, slot)` pair—including empty-string defaults and dynamic families—until the final 91-element, 296-slot contract validates in `scripts/data/slot-styling-audit.json`
- [x] T008 Add build-before-docs and generated-manifest drift gates for `packages/components/*/custom-elements.json` and `open-packages/*/custom-elements.json` in `.github/workflows/component-tests.yml`

**Checkpoint**: The audit is complete, schema-valid, non-destructive, package-complete, and enforced in pull requests.

---

## Phase 3: User Story 1 - Style a Slotted Region Without Replacing It (Priority: P1) 🎯 MVP

**Goal**: Consumers can style meaningful component-owned slot regions while assigned nodes, fallbacks, accessibility, SSR hydration, and reactive lifecycle behavior remain correct.

**Independent Test**: Apply external `::part()` rules to Card and Status Panel, verify named/default/fallback/conditional regions change without breaking assignment or accessibility, hard-reload an SSR page and confirm authored regions remain visible, and confirm chart/non-chart first renders produce no Lit `change-in-update` warning.

### Tests for the Representative MVP

- [x] T009 [P] [US1] Add failing external `::part()` tests for Card's `media`, `header`, default/body, and conditional `footer` regions, including assigned and removed content, in `packages/components/card/test/card.spec.ts`
- [x] T010 [P] [US1] Add failing external `::part()` tests for Status Panel's `media`, `title`, `description`, `content`, and `actions` regions, including visible fallback and assigned content, in `packages/components/status-panel/test/status-panel.spec.ts`

### Representative MVP Implementation

- [x] T011 [P] [US1] Expose semantic `media`, `header`, `body`, and `footer` regions and add explicit slot/fallback/state `@csspart` prose in `packages/components/card/src/card.ts`
- [x] T012 [P] [US1] Expose semantic `media`, `title`, `description`, `content`, and `actions` regions and add explicit slot/fallback/state `@csspart` prose in `packages/components/status-panel/src/status-panel.ts`
- [x] T013 [US1] Regenerate and reconcile the representative contracts in `packages/components/card/custom-elements.json`, `packages/components/status-panel/custom-elements.json`, and `scripts/data/slot-styling-audit.json`

### Layout, Feedback, Form, Collection, and Data Surfaces

- [x] T014 [P] [US1] Add failing external-part tests for owned wrappers, conditional footers, and visible fallbacks in `packages/components/modal/test/modal.spec.ts`, `packages/components/details/test/details.spec.ts`, `packages/components/attachment/test/attachment.spec.ts`, `packages/components/upload/test/upload.spec.ts`, and `packages/components/code-viewer/test/code-viewer.spec.ts`
- [x] T015 [US1] Implement and explicitly document the audited layout/feedback parts in `packages/components/modal/src/modal.ts`, `packages/components/details/src/details.ts`, `packages/components/attachment/src/attachment.ts`, `packages/components/attachment/src/attachment-group.ts`, `packages/components/upload/src/upload.ts`, and `packages/components/code-viewer/src/code-viewer.ts`
- [x] T016 [P] [US1] Add failing tests for part-backed and deliberately assigned-content-only form regions in `packages/components/autocomplete/test/autocomplete.spec.ts`, `packages/components/cascader/test/cascader.spec.ts`, `packages/components/select/test/select.spec.ts`, `packages/components/text-field/test/text-field.spec.ts`, `packages/components/number-input/test/number-input.spec.ts`, and `packages/components/date-input/test/date-input.spec.ts`
- [x] T017 [US1] Implement and explicitly document the audited form-region decisions in `packages/components/autocomplete/src/autocomplete.ts`, `packages/components/cascader/src/cascader.ts`, `packages/components/select/src/select.ts`, `packages/components/text-field/src/text-field.ts`, `packages/components/text-field/src/text-field-clear.ts`, `packages/components/number-input/src/number-input.ts`, and `packages/components/date-input/src/date-input.ts`
- [x] T018 [P] [US1] Add failing tests for prefix/label/description/suffix regions, conditional panels, shared surfaces, and assigned-content-only decisions in `packages/components/list/test/list.spec.ts`, `packages/components/list-item/test/list-item.spec.ts`, `packages/components/menu/test/menu.spec.ts`, `packages/components/navigation-menu/test/navigation-menu.spec.ts`, `packages/components/tabs/test/tabs.spec.ts`, `packages/components/accordion/test/accordion.spec.ts`, `packages/components/steps/test/steps.spec.ts`, `packages/components/button-group/test/button-group.spec.ts`, `packages/components/reorder-list/test/reorder-list.spec.ts`, and `packages/components/side-nav/test/side-nav.spec.ts`
- [x] T019 [US1] Implement and explicitly document the audited collection/navigation regions in `packages/components/list/src/list.ts`, `packages/components/list-item/src/list-item.ts`, `packages/components/menu/src/menu.ts`, `packages/components/menu/src/menu-item.ts`, `packages/components/navigation-menu/src/navigation-menu.ts`, `packages/components/navigation-menu/src/navigation-menu-item.ts`, `packages/components/navigation-menu/src/navigation-menu-link.ts`, `packages/components/tabs/src/tabs.ts`, `packages/components/tabs/src/tab.ts`, `packages/components/accordion/src/accordion.ts`, `packages/components/steps/src/steps.ts`, `packages/components/steps/src/step.ts`, `packages/components/button-group/src/button-group.ts`, `packages/components/reorder-list/src/reorder-list.ts`, and `packages/components/side-nav/src/side-nav.ts`
- [x] T020 [P] [US1] Add failing tests for dynamic slot families, shared state parts, stable region names, and assigned-content-only decisions in `packages/components/table/test/table.spec.ts`, `packages/components/virtual-list/test/virtual-list.spec.ts`, `packages/components/tree/test/tree.spec.ts`, `packages/components/chart/test/chart.spec.ts`, `packages/components/dashboard/test/dashboard.spec.ts`, and `packages/components/questionnaire/test/questionnaire.spec.ts`
- [x] T021 [US1] Implement and explicitly document stable data/state regions in `packages/components/table/src/table.ts`, `packages/components/table/src/table-column.ts`, `packages/components/virtual-list/src/virtual-list.ts`, `packages/components/tree/src/tree.ts`, `packages/components/tree/src/tree-item.ts`, `packages/components/chart/src/chart-base.ts`, `packages/components/chart/src/chart-legend.ts`, `packages/components/chart/src/chart-tooltip.ts`, `packages/components/dashboard/src/dashboard.ts`, `packages/components/dashboard/src/dash-card.ts`, and `packages/components/questionnaire/src/questionnaire.ts`
- [x] T022 [P] [US1] Add observable slot-contract coverage for Mat Icon, Reorder List, and Chatbot—including bare text and dynamic families—in `packages/components/mat-icon/test/mat-icon.spec.ts`, `packages/components/reorder-list/test/reorder-list.spec.ts`, and `open-packages/chatbot/test/chatbot.spec.ts`
- [x] T023 [US1] Complete the missing published-slot contracts and meaningful wrappers in `packages/components/mat-icon/src/mat-icon.ts`, `packages/components/reorder-list/src/reorder-list.ts`, `open-packages/chatbot/src/chatbot.ts`, `open-packages/chatbot/src/chatbot.scss`, and `scripts/data/slot-styling-audit.json`
- [x] T024 [US1] Record justified `assigned-content`, `variables`, or `delegated` routes without adding redundant parts for transparent projections in `packages/components/overlay/src/overlay.ts`, `packages/components/tooltip/src/tooltip.ts`, `packages/components/color-slider/src/color-slider.ts`, `packages/components/qr-code/src/qr-code.ts`, and `scripts/data/slot-styling-audit.json`

### Conditional Slot Regions Through SSR and Hydration

- [x] T025 [P] [US1] Add failing assigned, empty, insertion, removal, reassignment, and non-whitespace-text cases for the shared `unknown | present | empty` presence contract in `packages/components/card/test/card.spec.ts`, `packages/components/dashboard/test/dashboard.spec.ts`, `packages/components/details/test/details.spec.ts`, `packages/components/modal/test/modal.spec.ts`, `packages/components/radio/test/radio.spec.ts`, `packages/components/seperator/test/seperator.spec.ts`, `packages/components/sheet/test/sheet.spec.ts`, `packages/components/spinner/test/spinner.spec.ts`, and `packages/components/switch/test/switch.spec.ts`
- [x] T026 [US1] Implement the warning-safe tri-state presence abstraction and apply it to every direct helper consumer in `packages/core/src/dom-helper.ts`, `packages/components/card/src/card.ts`, `packages/components/dashboard/src/dash-card.ts`, `packages/components/details/src/details.ts`, `packages/components/modal/src/modal.ts`, `packages/components/radio/src/radio.ts`, `packages/components/seperator/src/seperator.ts`, `packages/components/sheet/src/sheet.ts`, `packages/components/spinner/src/spinner.ts`, and `packages/components/switch/src/switch.ts`
- [x] T027 [P] [US1] Add failing initial-assignment and post-hydration mutation cases for confirmed slotchange-only consumers in `packages/components/progress/test/progress.spec.ts`, `packages/components/autocomplete/test/autocomplete.spec.ts`, `packages/components/text-field/test/text-field.spec.ts`, `packages/components/number-input/test/number-input.spec.ts`, `packages/components/date-input/test/date-input.spec.ts`, `packages/components/navigation-menu/test/navigation-menu.spec.ts`, `packages/components/menu/test/menu.spec.ts`, `packages/components/qr-code/test/qr-code.spec.ts`, `packages/components/steps/test/steps.spec.ts`, `packages/components/table/test/table.spec.ts`, and `packages/components/virtual-list/test/virtual-list.spec.ts`
- [x] T028 [US1] Migrate only confirmed failing slotchange-only presence paths to the shared initial/hydration reconciliation policy in `packages/components/progress/src/progress.ts`, `packages/components/autocomplete/src/autocomplete.ts`, `packages/components/text-field/src/text-field.ts`, `packages/components/number-input/src/number-input.ts`, `packages/components/date-input/src/date-input.ts`, `packages/components/navigation-menu/src/navigation-menu.ts`, `packages/components/menu/src/menu.ts`, `packages/components/qr-code/src/qr-code.ts`, `packages/components/steps/src/step.ts`, `packages/components/table/src/table.ts`, and `packages/components/virtual-list/src/virtual-list.ts`
- [x] T029 [US1] Add an Astro SSR/hydration Playwright project and hard-reload regression covering Pie Chart gallery visibility plus Card conditional regions in `apps/ui/playwright.config.ts`, `apps/ui/test/slot-hydration.spec.ts`, and `apps/ui/package.json`

### Reactive Lifecycle Integrity

- [x] T030 [P] [US1] Add a parameterized warning harness for Line, Area, Bar, Sparkline, Pie, Gauge, Radar, Scatter, and Candlestick charts, plus first-paint custom-token and single-notification runtime-theme assertions, in `packages/components/chart/test/chart.spec.ts`, `packages/components/chart/test/scenarios.ts`, and `packages/components/chart/test/scenarios.html`
- [x] T031 [US1] Move fallback-theme cache disposal into a silent post-commit controller path while preserving notifying external invalidation in `packages/components/chart/src/chart-theme.ts` and remove redundant initial scheduling in `packages/components/chart/src/chart-base.ts`
- [x] T032 [P] [US1] Add no-`change-in-update` browser cases for Breadcrumb, Menu, Step, Radio Group, Code Viewer, and Reorder List in `packages/components/breadcrumb/test/breadcrumb.spec.ts`, `packages/components/menu/test/menu.spec.ts`, `packages/components/steps/test/steps.spec.ts`, `packages/components/radio/test/radio.spec.ts`, `packages/components/code-viewer/test/code-viewer.spec.ts`, and `packages/components/reorder-list/test/reorder-list.spec.ts`
- [x] T033 [US1] Move confirmed avoidable reactive writes out of `firstUpdated()` while preserving justified DOM-dependent later passes in `packages/components/breadcrumb/src/breadcrumb.ts`, `packages/components/menu/src/menu.ts`, `packages/components/steps/src/step.ts`, `packages/components/radio/src/radio-group.ts`, `packages/components/code-viewer/src/code-viewer.ts`, and `packages/components/reorder-list/src/reorder-list.ts`
- [x] T034 [US1] Add a static lifecycle audit that rejects new reactive writes or `requestUpdate()` calls in `firstUpdated()` and flags slot-presence implementations that depend only on `slotchange`, with focused allow-list reasons for legitimate DOM-dependent passes, in `scripts/check-component-lifecycle.mjs`, `scripts/check-component-lifecycle.test.mjs`, and `package.json`

**Checkpoint**: User Story 1 is complete when every published slot has a deliberate styling route, representative parts work from outside the shadow tree, SSR-authored regions reconcile correctly, and initial lifecycle paths are warning-free.

---

## Phase 4: User Story 2 - Discover the Correct Styling Hook (Priority: P2)

**Goal**: Developers and AI tools can identify assigned-content, component-owned-region, fallback, state, and nested-component styling boundaries without reading implementation source.

**Independent Test**: Starting from the Card documentation, identify and apply every slot styling route within five minutes, then confirm the same names and semantic descriptions appear in its manifest, API page, package README, and AI registry.

### Tests for User Story 2

- [x] T035 [P] [US2] Extend documentation tests to reject missing route guidance, generic part prose, unresolved delegated tags, absent UI customization examples, and source/manifest/API/AI naming drift in `scripts/check-component-docs.test.mjs`

### Documentation and Metadata Implementation

- [x] T036 [P] [US2] Document named/default/fallback/conditional styling routes for the representative components in `packages/components/card/README.md`, `packages/components/status-panel/README.md`, `apps/ui/src/content/components/card.mdx`, `apps/ui/src/content/components/status-panel.mdx`, `apps/ui/src/content/gallery/card.mdx`, and `apps/ui/src/content/gallery/status-panel.mdx`
- [x] T037 [P] [US2] Document assigned-node versus component-owned-part styling, bare-text handling, nested-shadow boundaries, and scoped-selector placement caveats in `apps/ui/src/content/guides/frameworks.mdx`
- [x] T038 [P] [US2] Mirror the public slot decision rules and framework caveats for AI consumers in `packages/tools/skill/skills/c2n-components/SKILL.md` and `packages/tools/skill/skills/c2n-components/references/frameworks.md`
- [x] T039 [US2] Add at least one runnable substantial CSS-variable or CSS-part customization for every publishable component page, including Color Area, Color Select, Color Slider, Mat Icon, and Chatbot, in `apps/ui/src/content/components/*.mdx`, `apps/ui/src/content/icons/mat-icon.mdx`, and `apps/ui/src/content/oepn-components/chatbot.mdx`
- [x] T040 [US2] Regenerate package manifests and the AI registry from authoritative source annotations in `packages/components/*/custom-elements.json`, `open-packages/*/custom-elements.json`, and `packages/tools/mcp/data/registry.json`
- [x] T041 [US2] Record the reproducible under-five-minute Card contract walkthrough and its observed styling routes in `specs/001-slot-styling-contract/checklists/discoverability.md`

**Checkpoint**: User Story 2 is complete when human and AI contract surfaces agree and the discoverability walkthrough succeeds without source inspection.

---

## Phase 5: User Story 3 - Use Slot Styling From Scoped Application Styles (Priority: P3)

**Goal**: A framework consumer can style an assigned node locally and its parent component-owned region independently, with an explicit boundary at nested custom elements.

**Independent Test**: Build and run the Vue support inbox, verify the scoped class styles the assigned message node, verify the global `::part(content)` rule styles only the parent-owned region, and verify it cannot pierce the nested Avatar shadow root.

### Tests for User Story 3

- [x] T042 [P] [US3] Add a failing browser integration test for assigned-node, parent-part, and nested-shadow computed styles in `apps/examples/support-inbox-vue/test/slot-styling.spec.ts` and register it in `apps/examples/support-inbox-vue/playwright.config.ts`

### Framework Integration Implementation

- [x] T043 [US3] Add stable assigned-node and nested-component selectors plus the scoped consumer-owned styles in `apps/examples/support-inbox-vue/src/components/ThreadPanel.vue`
- [x] T044 [P] [US3] Add the required global host `::part(content)` rule and explain why it cannot live inside Vue's scoped block in `apps/examples/support-inbox-vue/src/style.css`
- [x] T045 [US3] Document the runnable support-inbox boundary example in `apps/ui/src/content/guides/frameworks.mdx` and `packages/tools/skill/skills/c2n-components/references/frameworks.md`
- [x] T046 [US3] Build and run the example contract through `apps/examples/support-inbox-vue/package.json`, then record any framework-specific selector correction in `specs/001-slot-styling-contract/research.md`

**Checkpoint**: User Story 3 is complete when the example proves both supported styling routes and the nested-shadow limitation in a real scoped-style application.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Synchronize generated artifacts and close repository-wide quality gates after the selected stories are complete.

- [x] T047 [P] Regenerate all affected contracts and verify zero post-build drift in `packages/components/*/custom-elements.json`, `open-packages/*/custom-elements.json`, and `packages/tools/mcp/data/registry.json`
- [x] T048 [P] Run the unit, type, documentation, dogfood, format, lint, UI, examples, MCP smoke, and package build commands from `specs/001-slot-styling-contract/quickstart.md`, resolving failures in their owning source files
- [x] T049 Run changed component suites through Chromium, Firefox, and WebKit with `scripts/run-changed-component-tests.mjs`, preserving existing interaction, focus, semantics, accessibility, and performance baselines
- [x] T050 Run the Astro SSR/hydration and Vue scoped-style browser projects from `apps/ui/playwright.config.ts` and `apps/examples/support-inbox-vue/playwright.config.ts`, resolving only public-contract or lifecycle regressions
- [x] T051 Re-run every automated and manual boundary check and update inaccurate commands or expected outcomes in `specs/001-slot-styling-contract/quickstart.md`
- [x] T052 Record final evidence for 91 elements, 296 slots, 296 documented CSS parts, zero stale audit entries, warning-free lifecycle coverage, and constitution compliance in `specs/001-slot-styling-contract/checklists/requirements.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies; T001 and T002 may proceed in parallel after agreeing on schema names.
- **Foundational (Phase 2)**: Depends on Setup and blocks all stories. Execute T003 before T004, then T005 and T006; T007 depends on validation, and T008 depends on the final validator command.
- **User Story 1 (Phase 3)**: Depends on Foundation. Each test task precedes its paired implementation task. The representative MVP is T009–T013.
- **User Story 2 (Phase 4)**: Depends on Foundation; package-specific documentation can follow each completed User Story 1 batch, while T040 waits for all desired source contracts.
- **User Story 3 (Phase 5)**: Depends on at least one completed semantic region from User Story 1; it can otherwise proceed independently of the repository-wide rollout.
- **Polish (Phase 6)**: Depends on all stories selected for release.

### User Story Dependencies

- **User Story 1 (P1)**: Starts after T008 and has no dependency on another story. T009–T013 alone form the MVP.
- **User Story 2 (P2)**: Starts after T008 against existing contracts; final generation in T040 depends on the selected User Story 1 batches.
- **User Story 3 (P3)**: Starts after the Chat Message `content` region is documented and externally styleable; it does not depend on final User Story 2 registry generation.

### Within User Story 1

- Write external-boundary tests before adding or changing public parts.
- Add real template regions and explicit `@csspart` prose before regenerating manifests.
- Prove client-created slot behavior before the Astro SSR/hydration integration check.
- Make the chart and non-chart warning tests fail before moving lifecycle writes.
- Regenerate manifests only after source contracts stabilize.

### Parallel Opportunities

- T001 and T002 can run in parallel.
- T009/T010, then T011/T012, can run in parallel for the MVP.
- T014, T016, T018, T020, and T022 touch distinct package batches and can run in parallel after Foundation.
- T025, T027, T030, and T032 add independent test families and can run in parallel before their respective fixes.
- T036, T037, and T038 touch separate discovery surfaces and can run in parallel.
- T042 and T044 touch separate Vue test/style files once stable selectors are agreed.
- T047 and T048 can begin in parallel, but T049–T052 consume their corrected state.

---

## Parallel Example: User Story 1

```text
Task T009: Add Card external-part tests in packages/components/card/test/card.spec.ts
Task T010: Add Status Panel external-part tests in packages/components/status-panel/test/status-panel.spec.ts

Task T014: Add layout/feedback tests across the listed package test files
Task T016: Add form tests across the listed package test files
Task T018: Add collection/navigation tests across the listed package test files
Task T020: Add data/state tests across the listed package test files
```

## Parallel Example: User Story 2

```text
Task T036: Update Card and Status Panel package/UI documentation
Task T037: Update human framework guidance
Task T038: Update AI-facing framework guidance
```

## Parallel Example: User Story 3

```text
Task T042: Add the Vue browser integration test
Task T044: Add and explain the global public-part selector
```

---

## Implementation Strategy

### MVP First (User Story 1 Representative Slice)

1. Complete Setup and Foundation (T001–T008).
2. Write the Card and Status Panel boundary tests (T009–T010).
3. Implement and regenerate only the representative contracts (T011–T013).
4. Stop and validate named, default, fallback, conditional, assignment, and accessibility behavior independently.

### Incremental Delivery

1. Foundation → every published slot has one validated decision.
2. Card + Status Panel → representative P1 MVP.
3. Layout/feedback → forms → collections/navigation → data/state → remaining/pass-through packages.
4. Conditional-slot SSR/hydration → chart lifecycle → non-chart lifecycle hardening.
5. Human/AI discovery surfaces → scoped Vue integration.
6. Full generation drift, cross-browser, build, and constitution gates.

### Parallel Team Strategy

After Foundation, separate owners can take the layout/feedback, form, collection/navigation, data/state, and runtime-hardening batches because their implementation files do not overlap. Documentation work follows stabilized package annotations; generated manifests and the AI registry remain single-owner convergence tasks.

## Notes

- A slot audit decision is mandatory; a CSS part is not.
- A part on `<slot>` does not style assigned content or the shadow tree of an assigned custom element.
- Prefer existing semantic wrappers and CSS custom properties over aliases or layout-only wrappers.
- Generic inferred CEM prose does not satisfy the slot-region description contract.
- `unknown` is the only conforming server state when light-DOM presence cannot be observed.
- Cache maintenance and externally observable theme invalidation must remain separate operations.
- Commit regenerated manifests with the source annotations that produced them.

## Phase 7: Convergence

- [x] T053 Add the complete assigned, empty, insertion, removal, reassignment, and non-whitespace-text presence matrix to the nine direct-consumer suites named by T025, covering `packages/components/card/test/card.spec.ts`, `packages/components/dashboard/test/dashboard.spec.ts`, `packages/components/details/test/details.spec.ts`, `packages/components/modal/test/modal.spec.ts`, `packages/components/radio/test/radio.spec.ts`, `packages/components/seperator/test/seperator.spec.ts`, `packages/components/sheet/test/sheet.spec.ts`, `packages/components/spinner/test/spinner.spec.ts`, and `packages/components/switch/test/switch.spec.ts`, per T025 and the Conditional Region Hydration Contract (partial)
- [x] T054 Add explicit initial-assignment and post-reconciliation insertion, removal, and reassignment coverage to the confirmed slotchange-only consumer suites named by T027 in `packages/components/progress/test/progress.spec.ts`, `packages/components/autocomplete/test/autocomplete.spec.ts`, `packages/components/text-field/test/text-field.spec.ts`, `packages/components/number-input/test/number-input.spec.ts`, `packages/components/date-input/test/date-input.spec.ts`, `packages/components/navigation-menu/test/navigation-menu.spec.ts`, `packages/components/menu/test/menu.spec.ts`, `packages/components/qr-code/test/qr-code.spec.ts`, `packages/components/steps/test/steps.spec.ts`, `packages/components/table/test/table.spec.ts`, and `packages/components/virtual-list/test/virtual-list.spec.ts`, per T027 and the Conditional Region Hydration Contract (partial)
- [x] T055 Expand `apps/ui/test/slot-hydration.spec.ts` to verify after hard reload that all seven Pie Chart gallery examples are visible and measurable and that Card `media`, `header`, `body`, and `footer` regions reconcile authored content and later mutations, per T029 and plan: Astro SSR verification (partial)
- [x] T056 Extend the runtime theme-change coverage in `packages/components/chart/test/chart.spec.ts` to prove legend presentation and color refresh on the same single notifying invalidation as the engine options, per plan: chart lifecycle verification (partial)
