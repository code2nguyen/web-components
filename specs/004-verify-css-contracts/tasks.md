---
description: 'Dependency-ordered implementation tasks for verifiable CSS configuration contracts'
---

# Tasks: Verifiable CSS Configuration Contracts

**Checkpoint (2026-09-24)**: Implementation paused by request. The static and browser checks remain diagnostic in CI; unchecked tasks are deferred, not complete. Do not enable the blocking gate until the full audit and evidence requirements pass.

**Input**: Design documents in `specs/004-verify-css-contracts/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/styling-verification.md](contracts/styling-verification.md), [quickstart.md](quickstart.md)

**Tests**: Required by the specification: seeded contract defects, observable property effects, state paths, panel controls, generated families, and three-browser coverage.

**Organization**: Tasks are grouped by user story. Paths are relative to the repository root. `[P]` marks work on separate files that can proceed concurrently after its stated prerequisites.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish the planned commands and reviewed data formats without adding a new package or service.

- [x] T001 Add `check:style-contracts`, `test:style-contracts`, and `verify:style-contracts` script entries in `package.json`, pointing to the planned repository scripts and dedicated browser suite.
- [x] T002 [P] Define the versioned deterministic final-report shape, per-property `verified | failed | approved-exception` status, and summary-count reconciliation in `scripts/data/style-contract-report.schema.json` from `contracts/styling-verification.md`.
- [x] T003 [P] Define exact `(tag, name, state)` case identity and the complete browser-owned/third-party exception fields in `scripts/data/style-contract-cases.schema.json` and `scripts/data/style-contract-exceptions.schema.json`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Give every story the same publishable-tag inventory and property identity rules.

- [x] T004 Write failing discovery tests in `scripts/style-contract-discovery.test.mjs` for publishable component, open-package, and icon workspaces; missing manifests; duplicate tag names; and a newly added generated icon tag.
- [x] T005 Implement metadata-driven package/tag discovery in `scripts/lib/style-contract-discovery.mjs`; include only publishable packages and fail when a publishable package has no readable manifest.
- [x] T006 Write failing model tests in `scripts/style-contract-model.test.mjs` for identity `(tag, exact CSS variable name)`, duplicate rejection, explicit absent defaults, and exactly one final property status.
- [x] T007 Implement the element/property, consumption-path, verification-case, exception, and audit-result records in `scripts/lib/style-contract-model.mjs` with the validation rules from `data-model.md`.
- [x] T008 Create schema-valid empty reviewed registries in `scripts/data/style-contract-cases.json`, `scripts/data/style-contract-consumers.json`, and `scripts/data/style-contract-exceptions.json`; reject stale entries rather than ignoring them.

**Checkpoint**: Every publishable tag and public-property identity can be enumerated, including generated icons.

---

## Phase 3: User Story 1 — Catch Broken Styling Contracts Before Release (Priority: P1) 🎯 MVP

**Goal**: Reject source, manifest, default, and consumption drift with actionable diagnostics before release.

**Independent Test**: Seed a documented-but-unused variable, undocumented consumer, default mismatch, typo, and stale manifest in isolated fixtures; each must fail with the exact tag/property and expected reason, while a valid fixture passes.

### Tests for User Story 1

- [x] T009 [P] [US1] Write failing source-versus-manifest tests in `scripts/style-contract-source.test.mjs` covering exact name/type/default comparison, duplicate declarations, stale `custom-elements.json`, and nearest-name suggestions.
- [x] T010 [P] [US1] Write failing compiled-CSS tests in `scripts/style-contract-css.test.mjs` for Sass theme entries, `css.cssVar(...)` fallback chains, generated `@each` rules in badge/steps, raw `var(...)`, and a documented variable with no rendered consumer.
- [x] T011 [P] [US1] Write failing classification/default tests in `scripts/style-contract-consumers.test.mjs` for programmatic reads, inline styles, delegated child mappings, unresolved/cyclic fallbacks, and authored versus effective defaults.

### Implementation for User Story 1

- [x] T012 [US1] Extract source `@cssproperty` metadata and compare it per tag with committed generated declarations in `scripts/lib/style-contract-source.mjs`; report exact names, types, defaults, source locations, and stale manifest output.
- [x] T013 [US1] Compile Sass and collect public variable references with rendered selectors, declarations, fallback order, and expanded theme defaults in `scripts/lib/style-contract-css.mjs`; do not count a theme-map entry alone as observable consumption.
- [x] T014 [US1] Resolve literal, inherited, and public-property fallback defaults with semantic CSS normalization in `scripts/lib/style-contract-defaults.mjs`; preserve authored and effective values for diagnostics and reject unresolved/cyclic references.
- [x] T015 [US1] Classify TypeScript, inline-style, and delegated consumers from exact source paths and reviewed mappings in `scripts/lib/style-contract-consumers.mjs` and `scripts/data/style-contract-consumers.json`; require a downstream target rather than accepting a bare read.
- [x] T016 [US1] Produce stable failure categories, source evidence, nearest-name hints, and sorted property rows in `scripts/lib/style-contract-report.mjs`; keep static readiness distinct from final browser-backed `verified` status.
- [x] T017 [US1] Implement the `check:style-contracts` CLI in `scripts/check-style-contracts.mjs` with exit `0` for complete static readiness, `1` for contract failures, and `2` for invalid/missing inputs as specified in `contracts/styling-verification.md`.
- [x] T018 [US1] Add fixture-level integration tests in `scripts/style-contracts.test.mjs` proving all five seeded defects fail, a valid fixture passes, and adding a new publishable property enters the audit automatically.

**Checkpoint**: US1 works independently as a static quality check. Existing library defects may still fail until US4 remediation.

---

## Phase 4: User Story 2 — Verify Observable Changes Across Component States (Priority: P1)

**Goal**: Prove that every in-scope property changes its intended rendered region or programmatic output in Chromium and that representative paths work in Firefox and WebKit.

**Independent Test**: A base border, hover/focus/selected/disabled property, pseudo-element, slotted/delegated child, and chart output pass when connected; deliberately disconnecting one target must fail the exact property/state case.

### Tests for User Story 2

- [x] T019 [P] [US2] Write failing target-effect tests in `tests/style-contracts/observable.spec.ts` showing that a host custom-property echo does not pass when computed target style or geometry is unchanged, and that an invalid test value is reported separately.
- [x] T020 [P] [US2] Write failing state and special-path tests in `tests/style-contracts/special-paths.spec.ts` for hover, focus, selected, disabled, pseudo-element, slotted content, delegated child, and programmatic/canvas output.
- [x] T021 [P] [US2] Write failing coverage tests in `scripts/style-contract-cases.test.mjs` for one case per `(tag, property, applicable state)`, shared-family reuse only for identical styling paths, and Chromium-complete versus Firefox/WebKit-representative selection.

### Implementation for User Story 2

- [x] T022 [US2] Add `tests/style-contracts/*.spec.ts` discovery to `playwright.config.ts`, icon source resolution to `tests/vite.config.ts`, and a settled custom-element fixture at `tests/style-contracts/scenarios.html`.
- [x] T023 [US2] Implement verified context/case loading and ordinary compiled-CSS case derivation in `scripts/lib/style-contract-cases.mjs`; require valid contrasting values, intended target/declaration, stable reset, and no missing or stale registry property.
- [x] T024 [US2] Implement the case-driven Playwright runner in `tests/style-contracts/observable.spec.ts` and reusable computed-style, pseudo-style, slotted/delegated, geometry, and programmatic-output assertions in `tests/style-contracts/assertions.ts`; none may pass solely from `getComputedStyle(host).getPropertyValue(name)`.
- [ ] T025 [US2] Populate base-state fixtures and valid contrasting values for every ordinary public property in `scripts/data/style-contract-cases.json`, using derived cases only when the compiled target is unambiguous.
- [ ] T026 [US2] Add explicit state activation and target assertions for every non-base CSS path in `scripts/data/style-contract-cases.json`, including hover, focus, active, selected, disabled, open, loading, success, warning, and error where applicable.
- [ ] T027 [US2] Add explicit fixture/output assertions for programmatic, inline-style, pseudo-element, slotted, delegated, motion, and canvas paths in `scripts/data/style-contract-cases.json`; a cached read without visible redraw must fail.
- [x] T028 [P] [US2] Verify every generated icon tag's manifest but live-test one representative icon per shared Feather/Phosphor CSS styling path in `tests/style-contracts/icon-family.spec.ts`; require a new sample only for a genuinely distinct styling implementation, not an SVG weight variant.
- [ ] T029 [US2] Define a representative Firefox/WebKit matrix covering every distinct rendering path and state mechanism in `scripts/data/style-contract-browser-samples.json`; filter the runtime suite by project in `tests/style-contracts/observable.spec.ts`.
- [ ] T030 [US2] Reconcile runtime evidence with the case registry and reject uncovered properties/states in `scripts/lib/style-contract-cases.mjs`; generated-family evidence is reusable only after every tag's individual static contract passes.
- [ ] T031 [US2] Run the focused seeded and representative browser cases, record observed passes/failures and any programmatic redraw defects in `specs/004-verify-css-contracts/audit-results.md`, and keep unresolved library defects visible for US4.

**Checkpoint**: US2 detects a disconnected CSS or programmatic target independently of panel UI; a full-library zero-failure result remains US4 work.

---

## Phase 5: User Story 3 — Trust Configuration Panel Controls (Priority: P2)

**Goal**: Ensure every public property has one exact panel mapping and representative controls visibly change, reset, save, copy, and export the intended styling.

**Independent Test**: A representative single-value control, four-side/corner control, state control, and delegated control each write the expected property; reset restores authored styling and exported configuration reproduces it.

### Tests for User Story 3

- [x] T032 [P] [US3] Write failing descriptor tests in `apps/ui/src/utils/inspector-descriptors.test.ts` for exactly one row per public property, unknown-type text fallback, correct side/corner order, and rejection or separation of shorthand plus four longhands.
- [x] T033 [P] [US3] Write failing registry/mapping tests in `scripts/style-contract-inspector.test.mjs` for every publishable tag appearing in `apps/ui/src/store/component-manifests.ts`, exact owner/write target, and duplicate or missing controls.
- [x] T034 [P] [US3] Write failing representative interaction tests in `apps/ui/test/style-panel.spec.ts` for color, border, length, keyword, text, font, and box-side controls plus change, reset, save, copy, and export reproduction.

### Implementation for User Story 3

- [x] T035 [US3] Extract a pure row/control descriptor builder into `apps/ui/src/utils/inspector-descriptors.ts` and make `apps/ui/src/components/configuration/ComponentConfigurationPanel.ts` render those descriptors without changing manifest-driven behavior.
- [x] T036 [US3] Implement full-tag panel registration and exact property/owner/write-target audit in `scripts/lib/style-contract-inspector.mjs`; validate `allCssProperties` child composition rather than assuming child variables belong to the parent.
- [x] T037 [US3] Fix ambiguous shorthand/longhand grouping and enforce one-or-four equal name/value cardinality in `apps/ui/src/components/configuration/ComponentConfigurationPanel.ts` and `apps/ui/src/components/configuration/BoxSidesConfig.ts`.
- [ ] T038 [US3] Correct any failing authored-style preservation, exact host writes, reset isolation, or copied/exported override reproduction in `apps/ui/src/components/MdxCodeBlockScript.ts`, `apps/ui/src/utils/playground.ts`, and `apps/ui/src/components/configuration/GenerateCodeBlock.ts`.
- [x] T039 [US3] Register any missing publishable tags in `apps/ui/src/store/component-manifests.ts` and make `scripts/check-style-contracts.mjs` reject missing panel registration or invalid descriptors for the full inventory.
- [x] T040 [US3] Run descriptor, mapping, and representative panel suites and record each control family and shared flow result in `specs/004-verify-css-contracts/audit-results.md`.

**Checkpoint**: US3 independently proves the panel boundary while US2 supplies full per-property visual coverage.

---

## Phase 6: User Story 4 — Audit the Existing Library (Priority: P2)

**Goal**: Finish with one status for every published property, zero unexplained failures, reviewed exceptions only where permitted, and a blocking CI gate.

**Independent Test**: Run the full verification command against the library; every property is verified or has a valid exception, the report counts reconcile, known defects are fixed, and a newly introduced broken property fails CI.

### Tests for User Story 4

- [x] T041 [P] [US4] Write failing exception tests in `scripts/style-contract-exceptions.test.mjs` for every required review field, expired review, stale property, and rejection of ordinary component-owned shadow styling.
- [x] T042 [P] [US4] Write failing orchestration/report tests in `scripts/verify-style-contracts.test.mjs` for exact one-status reconciliation, deterministic sorted JSON, exit codes `0/1/2`, browser evidence, and a failed new-property gate.

### Implementation for User Story 4

- [x] T043 [US4] Validate only browser-owned/third-party exceptions with limitation, user impact, supported alternative, rationale, reviewer/date, and reassessment date in `scripts/lib/style-contract-exceptions.mjs` and `scripts/data/style-contract-exceptions.json`.
- [ ] T044 [US4] Implement `verify:style-contracts` in `scripts/verify-style-contracts.mjs` and `package.json` to run static readiness, full Chromium, representative Firefox/WebKit, and panel suites, then emit one schema-valid final ledger; fail on any missing evidence or unclassified property.
- [ ] T045 [US4] Run an initial full-library audit and write every failure with exact tag, property, category, source path, owner, target/state, and assigned correction path to `specs/004-verify-css-contracts/audit-results.md`.
- [x] T046 [US4] Correct the known color-slider typo and unused radius contract in `packages/components/color-slider/src/color-slider.ts`, `packages/components/color-slider/src/color-slider.scss`, `packages/components/color-slider/custom-elements.json`, and `packages/components/color-slider/test/color-slider.spec.ts`; do not keep the misspelled alias.
- [x] T047 [US4] Replace the color-slider typo in `packages/tools/theme/scripts/theme-generator/overrides.ts`, update `packages/components/color-slider/README.md` and `apps/ui/src/content/components/color-slider.mdx`, and record old-to-new migration guidance in `specs/004-verify-css-contracts/migration.md`.
- [ ] T048 [US4] Correct every other component/open-package failure enumerated with exact source and manifest paths by T045, rerun affected package builds and tests, and mark each correction with before/after evidence in `specs/004-verify-css-contracts/audit-results.md`; no warning baseline may remain.
- [ ] T049 [US4] Recheck every generated icon tag and shared styling path, regenerate affected icon manifests through their package generators when needed, and resolve every icon failure listed in `specs/004-verify-css-contracts/audit-results.md` without editing generated icon source by hand.
- [ ] T050 [US4] Add the full blocking contract command to `.github/workflows/component-tests.yml`, preserve changed-component behavior tests, add manifest/docs coherence to `.github/workflows/deploy.yml`, and confirm new packages are discovered without changed-package filtering.

**Checkpoint**: The complete library passes the contract gate with zero unexplained failures or unclassified properties.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Make the verification repeatable for maintainers and confirm constitution compliance.

- [x] T051 [P] Document commands, case authoring, exception review, migration lookup, and expected diagnostics in `tests/README.md` and `specs/004-verify-css-contracts/quickstart.md`.
- [ ] T052 [P] Benchmark static and full-browser durations, confirm repeat-run report determinism, and record results against the plan's targets in `specs/004-verify-css-contracts/audit-results.md`.
- [ ] T053 Run `npm run build`, `npm run docs:check`, `npm run test:type-check`, `npm run ui:build`, `npm run verify:style-contracts`, lint, and formatting checks; record exact pass/fail outcomes in `specs/004-verify-css-contracts/audit-results.md`.
- [ ] T054 Review the final inventory, exceptions, migration guidance, AI-facing metadata, public styling behavior, cross-browser evidence, and accessibility impact against `.specify/memory/constitution.md`; record the compliance decision in `specs/004-verify-css-contracts/audit-results.md`.

---

## Dependencies & Execution Order

### Phase dependencies

```text
Setup (T001–T003)
  → Foundation (T004–T008)
    → US1 static contract (T009–T018)
      → US2 observable effects (T019–T031)
      → US3 inspector mapping and flows (T032–T040)
        → US4 whole-library remediation and CI (T041–T050)
          → Polish (T051–T054)
```

- US2 uses the US1 compiled-CSS inventory to derive ordinary cases. US3 can begin after Foundation using published manifests, but final full-inventory mapping integration needs US1. US2 and US3 implementation can overlap after those inputs exist.
- Icon sampling T028 is independent of ordinary component fixture authoring T025–T027 once the shared runner exists; it may proceed concurrently.
- US4 depends on US1's audit, US2's observable evidence, and US3's panel mapping/interaction evidence; it is the first phase that can claim full-library completion.
- Within each story, write the named failing tests first, implement the source path, then rerun the story's independent test. Generated icon files are regenerated, never edited manually.

### Parallel examples

- **US1**: T009, T010, and T011 are separate test files and can be written together; T012–T015 then implement the respective adapters before T016–T018 integrate them.
- **US2**: T019, T020, and T021 cover separate test files and can be written together. Ordinary CSS cases and distinct special-path fixtures can be investigated concurrently, but edits to `scripts/data/style-contract-cases.json` must be serialized.
- **US3**: T032, T033, and T034 cover separate unit, mapping, and browser tests. Descriptor extraction and panel rendering share `ComponentConfigurationPanel.ts` and must be coordinated.
- **US4**: T041 and T042 are independent tests. After T045 enumerates exact failures, component/open-package corrections and generated-icon corrections can proceed in parallel because they touch separate packages; CI gate work waits for zero unexplained failures.

## Implementation Strategy

### MVP first

1. Complete Setup and Foundation.
2. Complete US1 and demonstrate the five seeded failures plus a valid contract fixture.
3. Use the static command during remediation; it deliberately reports existing library defects until US4.

### Incremental delivery

1. Add US2 to prove target-level effects and cross-browser representative paths.
2. Add US3 to prove the panel maps and applies the same public contract.
3. Add US4 to correct the existing catalog, produce the final ledger, and turn on the blocking CI gate.
4. Complete Polish only after the full gate is green. Do not declare the feature complete from the static MVP alone.

## Notes

- `[P]` means the marked task has separate files and no dependency on another unfinished task in its phase.
- Every final property result must be `verified`, `failed`, or `approved-exception`; a static readiness pass is not visual verification.
- Use the exact paths generated in T045 for audit-driven remediation tasks T048 and T049; the initial audit determines those package files without guessing them here.

## Phase 8: Convergence

- [ ] T055 CRITICAL: Resolve or validly classify every currently reported `unused-property` and `undocumented-consumer` in the full inventory, recording exact per-tag source and before/after evidence in `specs/004-verify-css-contracts/audit-results.md`; ordinary component-owned styling must not receive an exception per Constitution II and FR-025 (partial).
- [x] T056 CRITICAL: Integrate `scripts/lib/style-contract-defaults.mjs` into `scripts/lib/style-contract-report.mjs` so source/manifest defaults are compared with effective compiled Sass defaults, including public-property fallback chains; add a fixture where source and manifest agree but Sass differs per Constitution IV and FR-006 (missing).
- [x] T057 CRITICAL: Attribute compiled CSS consumers to each owning tag and its legitimate shared superclass or delegated child instead of the current package-wide documented-name union in `scripts/lib/style-contract-report.mjs`; add a multi-tag package fixture proving a sibling declaration cannot hide an undocumented or unused property per Constitution I and FR-004 (partial).
- [ ] T058 Populate each static inventory row in `scripts/lib/style-contract-report.mjs` with source location, description, authored/effective default, part, applicable states, and consumption mode, and validate missing required metadata before final reporting per FR-002 (partial).
- [x] T059 Trace public variables through intermediate CSS custom-property declarations to rendered declarations in `scripts/lib/style-contract-css.mjs`, detecting cycles and proving a theme-map or unused alias alone is not consumption; add compiled-CSS fixtures per FR-003 and FR-007 (partial).
- [ ] T060 Discover unreviewed programmatic/inline public-variable reads and verify each reviewed mapping's actual downstream sink rather than accepting a matching source string plus declared sink in `scripts/lib/style-contract-consumers.mjs`; add stale and disconnected-sink fixtures per FR-003 and FR-011 (partial).
- [ ] T061 Derive applicable CSS and semantic state paths per `(tag, property)` from compiled selectors and component context, then require exact state-keyed cases in `scripts/lib/style-contract-report.mjs` and `scripts/lib/style-contract-cases.mjs`; prove a base case cannot mask an untested hover, focus, active, selected, disabled, open, loading, success, warning, or error path per FR-010 and SC-004 (partial).
- [ ] T062 Audit the panel's actual property-to-host writes and control-family dispatch for each owned and composed property, rather than checking an optional `writeTarget` field absent from current inventory rows; add a wrong-host fixture in `scripts/style-contract-inspector.test.mjs` per FR-014 and FR-030 (partial).
- [ ] T063 Complete real component contexts and valid target-level Chromium cases for every ordinary property and applicable state, plus a reviewed representative Firefox/WebKit matrix; reconcile missing evidence and retain one live styling sample per shared icon-set path per FR-009, FR-028, and FR-029 (partial).
- [x] T064 Finish `apps/ui/test/style-panel.spec.ts` coverage for color, length, keyword, text, font, linked/independent box sides, state and delegated controls, plus changed indicator, isolated reset, save, copy, export, and reproduced presentation per FR-017, FR-018, and FR-030 (partial).
- [ ] T065 Replace the fail-closed placeholder in `scripts/verify-style-contracts.mjs` with reviewed exception validation, browser/panel evidence reconciliation, a deterministic schema-valid one-status-per-property ledger, and correct `0/1/2` exit behavior; add failing orchestration fixtures per FR-020, FR-021, FR-022, and FR-026 (missing).
- [ ] T066 Add the completed full-library gate to `.github/workflows/component-tests.yml` and manifest/docs coherence to `.github/workflows/deploy.yml`, preserving changed-component behavior tests while rejecting a newly added broken package or property per FR-023 (missing).
- [x] T067 Correct the stale command-availability statement in `specs/004-verify-css-contracts/quickstart.md` and finish maintainer instructions for cases, exceptions, diagnostics, and the migration lookup in `tests/README.md` per plan: maintainer guide (partial).

## Phase 9: Convergence

- [x] T068 Add a reviewed pseudo-element selector field to `scripts/data/style-contract-cases.schema.json`, validate it in `scripts/lib/style-contract-cases.mjs`, and pass it from `tests/style-contracts/observable.spec.ts` to `tests/style-contracts/assertions.ts`; prove a real registry-driven `::before` or `::after` case observes the pseudo-element rather than the originating element per FR-011 (partial).
- [x] T069 Apply and verify each context's declared `stateSetup` and `dimensions` in `tests/style-contracts/observable.spec.ts` before baseline capture, with fixture tests requiring content, data, dimensions, or a related element to expose the intended target; reject a declared setup that is never applied per FR-013 (partial).
- [x] T070 Validate contrasting values for geometry and programmatic-output cases even when no CSS declaration is supplied, using property-type or reviewed-path validation and a regression where an invalid value is reported as `invalid-test-value` rather than a broken contract per FR-012 (partial).
- [x] T071 Make the complete sorted static failure set retrievable from `scripts/check-style-contracts.mjs` through a deterministic report artifact or untruncated machine-readable mode, and test that a failure beyond the first 50 retains tag, property, category, expected target, state, and evidence per FR-019 and SC-006 (partial).

## Phase 10: Convergence

- [x] T072 Replace the generic non-canvas `outerHTML` programmatic-output assertion in `tests/style-contracts/assertions.ts` with an explicit rendered-output probe, and add negative-control tests where a host inline-style echo or unrelated animation changes while the intended output does not; neither may pass observable verification per FR-009 and FR-026 (partial).
- [x] T073 Make `scripts/lib/style-contract-report.mjs` and `tests/style-contracts/observable.spec.ts` validate every reviewed case and context before accepting coverage or running it, rather than directly trusting parsed JSON; add malformed pseudo, value-syntax, setup, dimension, and stale-context fixtures that fail static readiness and browser startup per FR-012 and FR-013 (partial).
- [x] T074 Check each reviewed case's `valueSyntax` and contrasting value against the exact property's published type or an explicitly reviewed transformation, so a color syntax cannot validate a pixel contract; add mismatched-syntax and valid nested-gradient fixtures per FR-012 (partial).
- [x] T075 Verify that `slotted-style` targets are actually assigned through the tested slot and `delegated-style` targets belong to the declared child component/host before accepting computed-style changes; add false-positive fixtures with unrelated matching selectors per FR-011 (partial).

## Phase 11: Convergence

- [x] T076 Verify host ownership of every observable target in `tests/style-contracts/assertions.ts`, including computed-style, pseudo-style, geometry, and programmatic-output cases; reject a matching element outside the tested host or its legitimate rendered/delegated boundary, with false-positive fixtures where unrelated elements change per FR-009 and FR-011 (partial).
- [x] T077 Validate every reviewed case's contrasting value against the exact property's published type, including computed-style cases without `valueSyntax`; require an explicit reviewed transformation when the observed declaration uses different syntax, and add a pixel-property/color-declaration false-positive fixture per FR-012 (partial).
- [x] T078 Prove deterministic before/after changes for computed-style, pseudo-style, slotted-style, delegated-style, and geometry assertions as well as programmatic output; add negative controls where an unrelated animation or layout change would otherwise pass, while preserving valid motion-property cases per FR-026 (partial).
- [x] T079 Make `validateReviewedRegistry` enforce the complete case/context shape and semantics used by both static readiness and browser startup, including assertion enum, nonempty supported browser selection, reset mode, state/target fields, and rejection of unknown malformed values; add matching malformed-registry fixtures for both entry points per FR-013 (partial).

## Phase 12: Convergence

- [x] T080 Replace `svg-markup` and `image-source` string-change checks in `tests/style-contracts/assertions.ts` with reviewed rendered-output evidence for programmatic SVG/image surfaces, or explicitly reject an unobservable surface; add metadata-only SVG and visually identical image-source negative controls so a source or attribute change alone cannot pass per FR-009 and FR-011 (partial).
- [x] T081 Give geometry cases in `scripts/data/style-contract-cases.schema.json` and `tests/style-contracts/assertions.ts` an explicit reviewed dimension or geometric invariant, and compare only that intended effect rather than the entire bounding box; add a fixture where unrelated x/y movement cannot pass a width/height contract per FR-009 (partial).
- [x] T082 Validate the effective contrasting value used by `tests/style-contracts/assertions.ts` when `CSS.supports` accepts deferred `var(...)` or other unresolved references; report invalid or unresolved test input separately from a broken component, with a fixture where `var(--missing)` cannot be credited as a valid property edit per FR-012 (partial).
- [x] T083 Strengthen `readStableTarget` in `tests/style-contracts/assertions.ts` against delayed or stepped output that remains unchanged for three frames, using a reviewed settle condition or repeated control/edit/restore evidence; add a delayed-change negative control while retaining finite-transition and motion-property positives per FR-026 (partial).

## Phase 13: Convergence

- [x] T084 Require value-specific causal evidence in `tests/style-contracts/assertions.ts` so a target change triggered only by mutating the host `style` attribute cannot pass; add a placebo-property or two-distinct-value negative control for computed and programmatic probes, including the current SVG/image mutation-observer fixture, per FR-009 and FR-026 (partial).
- [x] T085 Reject computed-style and text-content cases whose reviewed target is hidden, non-rendered, or visually masked by its own visibility/opacity state, or require an explicit observable alternative; add fixtures where a hidden target's computed value or text changes without visible presentation per FR-009 and US2/AC1 (partial).
- [x] T086 Extend `svg-bitmap` in `tests/style-contracts/assertions.ts` to preserve relevant live computed SVG effects beyond the current paint-property subset, including externally styled filters/clipping/transforms, or explicitly reject unsupported SVG surfaces with an actionable error; add positive and negative rendered-pixel fixtures per FR-011 (partial).

## Phase 14: Convergence

- [x] T087 Reject `canvas-bitmap`, `image-bitmap`, and `svg-bitmap` cases when the reviewed output surface or an ancestor is hidden/non-rendered, even if its underlying pixels change; allow a reviewed alternate visible target when appropriate, and add hidden-surface negative controls plus visible positives for all three probes per FR-009 and FR-011 (partial).

## Phase 15: Convergence

- [x] T088 Allow a reviewed second contrasting value in `scripts/data/style-contract-cases.schema.json`, validate it against the exact published type and observed syntax in `scripts/lib/style-contract-cases.mjs`, and pass it through `tests/style-contracts/observable.spec.ts` to `tests/style-contracts/assertions.ts`; keep safe inference for known types but never reject a valid keyword-only contract solely because the fixed `CONTROL_VALUES` list lacks a candidate, with `justify-content`/`font-style` fixtures per FR-009 and FR-012 (partial).
- [x] T089 Require positive rendered area for bitmap output targets in `tests/style-contracts/assertions.ts`, not merely a nonempty `getClientRects()` list; add zero-CSS-width/height canvas, image, and SVG negative controls whose intrinsic pixels still change, plus visible-size positives per FR-009 and FR-011 (partial).

## Phase 16: Convergence

- [ ] T090 CRITICAL: Replace the unconditional exit-2 placeholder in `scripts/verify-style-contracts.mjs` with the complete fail-closed static, Chromium, representative Firefox/WebKit, and panel-evidence gate and deterministic report; first complete the outstanding coverage/remediation tasks until the initial full-library audit has zero unexplained failures, then prove exit `0` only for a complete ledger and nonzero for a newly broken property or missing browser evidence, with no warning baseline or CI-only bypass per FR-020, FR-022, FR-023, and Constitution: Development Workflow and Quality Gates (missing).
- [ ] T091 CRITICAL: Add a required `npm run verify:style-contracts` job to `.github/workflows/component-tests.yml` for pull requests targeting both `develop` and `main`, after a clean install/build and browser setup; run the complete inventory independently of changed-component selection while retaining the existing changed-package behavior matrix, publish the final report and failure traces, and prove a new package, generated icon tag, or broken property blocks the PR per FR-023, FR-028, SC-007, and plan: CI gate (missing).
- [ ] T092 CRITICAL: Gate `.github/workflows/release.yml` with the complete style-contract verification after checkout/reinstall/build and before versioning, packing, or publishing, for new, resumed, and dry-run attempts; install required browser dependencies, preserve the release workflow's resumability, and ensure any missing/incomplete/failed evidence blocks npm publication per FR-022, FR-023, and Constitution: Development Workflow and Quality Gates (missing).
- [ ] T093 Add the complete style-contract gate before artifact upload/deployment in `.github/workflows/deploy.yml`, and check generated `custom-elements.json` coherence across publishable component, open-package, and icon workspaces alongside existing docs checks; ensure a nonzero result or stale manifest blocks Pages deployment per FR-024 and plan: deploy manifest/documentation coherence (partial).

## Phase 17: Convergence

- [ ] T094 Validate representative Firefox/WebKit evidence against the reviewed rendering-path and state-mechanism matrix in `scripts/lib/style-contract-verification.mjs`, not merely the presence of one passing selected case; add a fixture where one selected case passes but another required path is absent, and keep coverage failed until every required representative path passes per FR-029 and SC-011 (partial).
- [x] T095 Carry a validated `sharedStylingPath` and per-tag static-readiness result from `scripts/lib/style-contract-report.mjs` into final reconciliation in `scripts/lib/style-contract-verification.mjs`; prove one passing representative Feather/Phosphor icon case covers every tag on an identical shared path, while a divergent or statically failing generated tag cannot inherit that evidence per FR-028 and SC-004 (partial).
