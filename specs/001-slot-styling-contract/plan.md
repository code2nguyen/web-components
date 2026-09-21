# Implementation Plan: Complete Slot Styling Contract

**Branch**: `feat/ship-manifests-and-llms-txt` | **Date**: 2026-09-21 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/001-slot-styling-contract/spec.md`

## Summary

Audit every published slot and give it an explicit styling decision without creating a mechanical one-part-per-slot API. Add semantic CSS parts to meaningful component-owned wrappers, placement regions, and visible fallbacks; retain direct consumer styling for assigned light-DOM nodes; document nested-component boundaries; and record all decisions in a checked-in, manifest-validated audit registry. Harden that contract at runtime by making conditional slot regions correct through Lit SSR hydration and by removing redundant post-update scheduling from every chart. Deliver the contract in package batches, preserve the existing public API, add SSR-boundary and warning-free browser coverage, regenerate downstream documentation, and demonstrate the styling boundary in the scoped Vue example.

## Technical Context

**Language/Version**: TypeScript 6.0.3 and JavaScript ES modules on Node.js 24

**Primary Dependencies**: Lit 3.3.3, Vite, `vite-plugin-cem`, Custom Elements Manifest analyzer 2.1.0, Astro 7.3.1

**Storage**: Checked-in JSON audit registry and generated `custom-elements.json` package artifacts; no runtime persistence

**Testing**: Playwright 1.63 across Chromium, Firefox, and WebKit; Node test runner; TypeScript compiler; documentation validator; Astro and example builds

**Target Platform**: Standards-based custom elements in supported evergreen browsers and framework consumers using global, scoped, or CSS-module styles

**Project Type**: Multi-package web-component library with generated metadata, documentation site, AI tooling, and framework examples

**Performance Goals**: No new runtime JavaScript path for styling hooks; no redundant second Lit update during initial chart rendering; the existing component performance suites are the regression baseline and MUST continue to pass without relaxed thresholds

**Constraints**: Backward compatible public API; no shadow-tree replacement or private selectors; parts expose only component-owned regions; assigned custom-element internals remain behind their own styling contract; generated artifacts stay synchronized; server output must not permanently hide authored slot content; client reconciliation must not introduce Lit `change-in-update` warnings or layout-visible double renders

**Scale/Scope**: The initial documentation baseline covered 89 elements, 292 public slots, and 254 CSS parts; 35 slot-bearing elements exposed no parts. Publishable-package discovery and final convergence expanded the verified final state to 91 elements, 296 public slots, and 296 documented CSS parts after the unfinished `dropdown-list` package was retired. Runtime hardening covers nine direct `hasSlottedContent` consumers, at least 17 slotchange-only presence consumers within a 31-file reactive slot-state audit, all nine concrete `ChartBase` elements, and six additional confirmed non-chart first-update scheduling paths.

## Constitution Check

_Gate result before research: PASS. Re-evaluated after design: PASS._

- **AI-First Component Contracts — PASS**: The audit registry, explicit `@csspart` prose, regenerated manifests, API reference, and AI registry keep the slot styling boundary machine-readable.
- **Complete Styling Control — PASS**: The plan adds parts only for meaningful structural/composed regions, retains custom properties for scalar values, and records a deliberate alternative for every slot.
- **Real-World Examples — PASS**: The scoped Vue example demonstrates styling both a consumer-owned assigned node and a component-owned region.
- **One Contract, Every Documentation Surface — PASS**: Authoritative source annotations drive manifests; validation detects missing/stale audit entries and generated-manifest drift; human and AI documentation are rebuilt from those contracts.
- **Accessible, Portable Web Standards — PASS**: Browser tests exercise public `::part()` selectors while preserving assignment, fallback, keyboard, focus, and semantics across engines.
- **Runtime contract integrity — PASS**: SSR/hydration checks prove authored slot content is not hidden after upgrade, and chart checks preserve first-paint computed theming without scheduling a redundant Lit update.
- **Governance — PASS**: No exception or constitutional violation is required. The design rejects redundant parts and preserves existing public names.

## Project Structure

### Documentation (this feature)

```text
specs/001-slot-styling-contract/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── slot-styling-contract.md
├── checklists/
│   └── requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
packages/components/*/
├── src/*.ts                         # slots, wrappers, fallback markup and explicit @csspart contracts
├── test/*.spec.ts                   # external ::part(), assignment, state and accessibility verification
├── README.md                        # package styling guidance
└── custom-elements.json             # generated slot and CSS-part contract

open-packages/*/
├── src/*.ts
├── test/*.spec.ts
├── README.md
└── custom-elements.json

scripts/
├── cem-plugin-customize/index.js    # manifest inference; explicit descriptions take precedence
├── check-component-docs.mjs         # slot-audit and documentation contract validation
├── check-component-docs.test.mjs    # audit-registry validation fixtures
└── data/slot-styling-audit.json     # one decision for every published tag + slot

apps/ui/src/
├── components/ApiTable.astro        # consumes generated parts automatically
├── content/components/*.mdx         # component guidance
└── content/gallery/*.mdx            # realistic part customization samples

apps/examples/support-inbox-vue/     # scoped-style integration example

packages/tools/mcp/
├── scripts/build-registry.ts         # generated AI registry
└── data/registry.json

.github/workflows/component-tests.yml # PR contract/build/test gates

packages/core/src/dom-helper.ts       # shared light-DOM slot-presence query used before client render
packages/components/chart/src/
├── chart-base.ts                    # chart render/update orchestration
└── chart-theme.ts                   # cached computed theme and notifying runtime invalidation

apps/ui/                              # Astro SSR/hydration integration boundary
```

**Structure Decision**: Extend the existing per-package source/test/manifest structure. Add one repository-level audit registry and validator because a slot-to-part relationship is many-to-one and cannot be inferred safely from matching names. Keep the API page and AI tools as downstream consumers of generated manifests rather than creating a second contract source.

## Phase 0: Research Decisions

Research is consolidated in [research.md](research.md). The decisive findings are:

1. A part on `<slot>` styles the slot element, normally `display: contents`; it does not style assigned nodes or nested shadow trees.
2. The repository's established convention is semantic parts on real component-owned wrappers, not direct parts on `<slot>`; no literal source slot currently carries `part`.
3. A checked-in audit registry is required to prove complete coverage without forcing matching slot/part names.
4. Explicit `@csspart` descriptions are required for slot/state semantics because the CEM plugin's inferred prose is intentionally generic.
5. Real browser tests must apply external host `::part()` rules and verify behavior, not merely assert a `part` attribute exists.
6. Slot presence is part of the rendered contract: SSR must preserve authored content while hydration reconciles server-unknown state without relying on an already-missed `slotchange` event.
7. Cache invalidation and host-update notification are different operations; the chart's one-time post-commit theme-cache reset must be silent, while real runtime theme changes must still notify.

## Phase 1: Design

### Audit and Contract Model

[data-model.md](data-model.md) defines the slot audit entry, CSS part contract, validation report, and component batch. [contracts/slot-styling-contract.md](contracts/slot-styling-contract.md) defines allowed audit decisions, naming rules, documentation requirements, and validation failures.

### Delivery Sequence

1. **Contract infrastructure**: add the audit registry and validator tests; strengthen PR workflow checks for fresh manifests.
2. **Representative MVP**: Card and Status Panel establish named/default slots, semantic wrappers, fallback surfaces, conditional visibility, and browser-test conventions.
3. **Layout and feedback batch**: Modal, Details, Attachment, Upload, and Code Viewer.
4. **Form batch**: Autocomplete, Cascader, Select, Text Field, Number Input, Date Input, and audit of existing controls.
5. **Collection/navigation batch**: List, List Item, Menu, Navigation Menu, Tabs, Accordion, Steps, Button Group, Reorder List, and Side Nav.
6. **Data/state batch**: Table, Virtual List, Tree, Chart, Dashboard, and Questionnaire, including dynamic slot families and shared state surfaces.
7. **Pass-through batch**: Mat Icon, Overlay, Tooltip, Color Slider, QR Code, and other slots where direct assigned-content styling or delegation is sufficient.
8. **SSR slot-state hardening**: replace the boolean server-default model with a shared tri-state presence abstraction; apply it to Card, Dash Card, Details, Modal, Radio, Separator, Sheet, Spinner, and Switch; migrate confirmed slotchange-only failures such as Progress, Autocomplete, the input families, navigation/menu regions, QR Code, Step, Table, and Virtual List; classify every remaining reactive slot-presence component with the same SSR/hydration test matrix.
9. **Chart lifecycle hardening**: move the one-time fallback-theme cache reset into the theme controller's post-commit lifecycle without notifying the host; retain notifying invalidation for document theme, media-query, and `c2n-theme-change` updates across line, area, bar, sparkline, pie, gauge, radar, scatter, and candlestick charts.
10. **Repository lifecycle hardening**: run the shared warning harness against Breadcrumb, Menu, Step, Radio Group, Code Viewer, and Reorder List; move confirmed reactive writes out of `firstUpdated()` and classify DOM-dependent `updated()` second passes as removable or explicitly justified.
11. **Integration**: add an Astro SSR gallery regression, scoped Vue example, documentation regeneration, MCP registry rebuild, and full cross-browser verification.

### SSR and Reactive Lifecycle Design

- Conditional region state is `unknown | present | empty`; server-side inability to inspect light DOM is represented as `unknown`, never as `empty`.
- `unknown` content-backed regions remain available in server output. The shared abstraction resolves synchronously before the first render for ordinary client-created elements, but waits until the initial hydration has completed before writing reactive state for adopted declarative shadow DOM; pre-hydration writes can otherwise be recorded as committed without changing adopted markup.
- Post-hydration reconciliation is scheduled from `updateComplete` or an equivalent warning-safe boundary, then awaited by integration tests. It may produce one necessary client reconciliation update, but it must not write reactive state from `firstUpdated()`/`updated()` or trigger Lit's `change-in-update` warning.
- `slotchange` remains responsible for subsequent additions, removals, and reassignment. Reconciliation and `slotchange` use the same definition of meaningful content, including non-whitespace text.
- SSR output may use conservative state, but client upgrade must settle before validation and must not leave assigned content inside a `hidden` wrapper. ARIA labelling and conditional classes must settle from the same presence state as visual wrappers.
- `ChartThemeController` owns whether a cached value came from fallback probes. Its post-commit hook silently discards that one fallback value before `ChartBase.updated()` synchronizes the engine. Runtime theme signals use the existing notifying path so engine options and legend presentation still refresh.
- Scope is evidence-driven: nine shared-helper consumers, at least 17 slotchange-only components, nine charts, and six non-chart first-update paths are confirmed targets. The rest of the 31-file slot-state inventory and conditional `updated()` paths remain an audit set, not an instruction to rewrite unaffected or inherently multi-pass behavior.

### Verification Strategy

- Registry unit tests cover missing/stale entries, duplicate keys, default-slot-to-semantic-part mapping, shared parts, assigned-content/delegated decisions, variables, and nonexistent part references.
- Package browser tests inject external selectors such as `c2-card::part(body)`, verify computed style or geometry on the exposed region, and then verify assigned content, fallbacks, interaction, focus, and accessibility.
- Astro integration coverage renders conditional slot regions through the actual SSR/hydration pipeline and asserts that every authored region is visible and measurable after custom-element upgrade. Card-backed chart gallery examples are the representative end-to-end case.
- A shared console-warning assertion covers all nine concrete chart tags, including a new Area Chart scenario, and the six confirmed non-chart first-update paths, while an initial custom-token assertion proves the first engine synchronization reads committed theme probes.
- A runtime theme-change test proves notifying invalidation still updates engine options and legend colors after the silent initial cache reset.
- A small static audit guard flags new reactive writes/requestUpdate calls in `firstUpdated()` and slot-presence implementations that rely only on `slotchange` without an explicit initial/hydration reconciliation policy.
- Representative coverage includes named, default, conditional, fallback, dynamic-family, shared-state, and nested-custom-element boundaries.
- Build affected packages before validating committed manifests. CI compares regenerated component manifests with the working tree and runs documentation checks.
- Full checks include unit, type, docs, component browser suites, package builds, UI/examples builds, and MCP build/smoke.

## Complexity Tracking

No constitution violations or exceptional complexity are required.
