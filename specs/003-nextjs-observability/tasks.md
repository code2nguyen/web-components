---
description: 'Dependency-ordered implementation tasks for the Next.js observability showcase'
---

# Tasks: Next.js Observability Showcase

**Input**: Design documents from `specs/003-nextjs-observability/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

**Tests**: Required by the feature specification and constitution. Write the listed tests before their corresponding implementation and confirm they fail for the expected reason.

**Organization**: Tasks are grouped by user story so each workflow can be implemented and validated as an increment. Setup and foundational tasks provide only shared infrastructure.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because it changes different files and does not depend on an incomplete task.
- **[Story]**: Maps the task to a user story from `spec.md`.
- Every task names the file or directory it changes.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the Next.js workspace and connect it to repository build and documentation infrastructure.

- [x] T001 Create the planned application directories under `apps/examples/observability-nextjs/app`, `apps/examples/observability-nextjs/components`, `apps/examples/observability-nextjs/features`, `apps/examples/observability-nextjs/lib`, `apps/examples/observability-nextjs/providers`, `apps/examples/observability-nextjs/public`, `apps/examples/observability-nextjs/test/unit`, and `apps/examples/observability-nextjs/types`
- [x] T002 Define exact Next.js 16.3.3, React 19.3.0, c2n workspace, theme, uPlot, TypeScript, Playwright, axe, Wireit scripts, build inputs/outputs, and explicit c2 package build dependencies in `apps/examples/observability-nextjs/package.json`
- [x] T003 [P] Configure App Router static export, `/web-components/demo/observability-nextjs` base path, trailing slashes, and unoptimized local images in `apps/examples/observability-nextjs/next.config.ts`
- [x] T004 [P] Configure strict TypeScript, Next.js plugin settings, repository aliases, JSX declarations, and lint coverage in `apps/examples/observability-nextjs/tsconfig.json` and `apps/examples/observability-nextjs/eslint.config.mjs`
- [x] T005 [P] Add Next.js example metadata with `framework: "nextjs"`, `outputDir: "out"`, observability tags, original product wording, and source/evaluation links in `apps/examples/observability-nextjs/app.config.json` and `apps/examples/observability-nextjs/README.md`
- [x] T006 Extend example metadata validation with `nextjs`, the `Next.js` display label, and optional output directory defaulting to `dist` in `apps/ui/src/schemas/index.ts`
- [x] T007 Update example synchronization to read validated per-example output directories while preserving `dist` for existing apps in `apps/ui/scripts/sync-examples.mjs`
- [x] T008 Add `./apps/examples/observability-nextjs:build` to the root examples build graph in `package.json`
- [x] T009 Install the exact planned dependencies and commit workspace resolution changes in `package-lock.json`
- [x] T010 [P] Configure Chromium routine tests, Chromium/Firefox/WebKit portability projects, 1280px and 768px profiles, production static preview startup, console capture, and retained failure traces in `apps/examples/observability-nextjs/playwright.config.ts` and `apps/examples/observability-nextjs/test/serve-static.mjs`

**Checkpoint**: The empty Next.js workspace builds to `out/`, appears in the examples collection, and can be served at the deployment base path.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Implement deterministic domain, state, custom-element interoperability, and shell infrastructure shared by every story.

**⚠️ CRITICAL**: No user story work begins until this phase passes its unit, build, and hydration-smoke checks.

- [x] T011 [P] Write failing generator tests for fixed-seed repeatability, minimum counts of 8 services/150 traces/1,000 logs/8 rules/6 incidents, unique IDs, resolved foreign keys, acyclic trace trees, bounded timestamps, and valid incident transitions in `apps/examples/observability-nextjs/test/unit/dataset.test.ts`
- [x] T012 Define dataset entities and validators in `apps/examples/observability-nextjs/lib/domain/telemetry.ts`, preserving these constraints verbatim: “Exactly one environment is default”, “0 <= p50 <= p95 <= p99”, error rate has “Inclusive range 0–1”, dependencies have “Unique, no self-reference, all resolve”, every trace has “exactly one null parent per trace”, span timing “Falls within the trace interval” and “ends within trace interval”, and log trace/span IDs resolve when present
- [x] T013 Implement the fixed UTC baseline, non-zero integer seed, xorshift-style PRNG, stable IDs, integer offsets, normalized fixtures, synthetic destination catalog, and dataset integrity assertion in `apps/examples/observability-nextjs/lib/data/seed.ts`, `apps/examples/observability-nextjs/lib/data/generator.ts`, and `apps/examples/observability-nextjs/lib/data/dataset.ts`
- [x] T014 [P] Write failing index and selector tests for service, environment, trace, span, log, metric, rule, incident, and correlation lookups in `apps/examples/observability-nextjs/test/unit/indexes.test.ts`
- [x] T015 Implement immutable dataset indexes and replay-snapshot-aware selector primitives in `apps/examples/observability-nextjs/lib/data/indexes.ts` and `apps/examples/observability-nextjs/lib/query/selectors.ts`
- [x] T016 [P] Write failing URL codec tests for defaults, stable serialization, independent invalid-field recovery, URL precedence, allowed page sizes 25/50/100, filter-driven page reset, and explicit detail return context in `apps/examples/observability-nextjs/test/unit/navigation-state.test.ts`
- [x] T017 Implement allowlisted route schemas plus pure parse, normalize, serialize, and href builders in `apps/examples/observability-nextjs/lib/query/navigation-state.ts`, ensuring every user-authored query is bounded and never throws
- [x] T018 [P] Write failing storage tests for `{ schemaVersion: 1, updatedAt, data }`, independent key recovery, unknown-version rejection, quota/security failures, dashboard permutation validation, and reset boundaries in `apps/examples/observability-nextjs/test/unit/storage.test.ts`
- [x] T019 Implement SSR-safe external-store adapters and namespaced validators for alerts, desktop/tablet dashboard layouts, and theme in `apps/examples/observability-nextjs/lib/storage/envelope.ts`, `apps/examples/observability-nextjs/lib/storage/browser-store.ts`, and `apps/examples/observability-nextjs/lib/storage/keys.ts`
- [x] T020 [P] Write failing replay tests for paused tick-zero snapshots, single-timer play, pause, deterministic logical ticks, refresh cancellation/reset, cleanup, and identical repeated sequences in `apps/examples/observability-nextjs/test/unit/replay.test.ts`
- [x] T021 Implement replay state/commands and the paused deterministic provider in `apps/examples/observability-nextjs/lib/replay/replay-clock.ts` and `apps/examples/observability-nextjs/providers/ReplayProvider.tsx`
- [x] T022 [P] Import generated JSX contracts for every planned directly consumed package and chart subpath in `apps/examples/observability-nextjs/types/c2-elements.d.ts`
- [x] T023 Create one idempotent root custom-element registration owner with route-safe chart subpath registration in `apps/examples/observability-nextjs/components/c2n/C2Registry.tsx`
- [x] T024 Implement Strict-Mode-safe typed custom-event subscription and upgraded-element property assignment helpers in `apps/examples/observability-nextjs/components/c2n/useCustomEvent.ts` and `apps/examples/observability-nextjs/components/c2n/element-bindings.ts`
- [x] T025 [P] Define original light/dark observability tokens, documented `--c2-*` bridges, focus, reduced-motion, scoped overflow, tablet layout, and synthetic-data styles without shadow-root selectors in `apps/examples/observability-nextjs/app/globals.css`
- [x] T026 Implement providers with a matching server/client default snapshot for theme, replay, investigation scope, live status announcements, and page-scoped `normal|loading|empty|error` state in `apps/examples/observability-nextjs/providers/AppProviders.tsx`, `apps/examples/observability-nextjs/providers/ScopeProvider.tsx`, and `apps/examples/observability-nextjs/providers/DemoStateProvider.tsx`
- [x] T027 Implement global environment, relative/absolute range, replay Play/Pause/Refresh, theme, and synthetic-data controls with URL precedence in `apps/examples/observability-nextjs/components/scope/GlobalScopeControls.tsx`
- [x] T028 [P] Define typed component usage records with unique tags, package names, purposes, regions, documentation paths, and representative source paths in `apps/examples/observability-nextjs/lib/domain/component-usage.ts` and `apps/examples/observability-nextjs/lib/data/component-usage.ts`
- [x] T029 Implement the responsive header, side navigation, skip link, landmarks, current-route state, tablet behavior, and one polite atomic status region in `apps/examples/observability-nextjs/components/app-shell/AppShell.tsx` and `apps/examples/observability-nextjs/components/app-shell/AppNavigation.tsx`
- [x] T030 Compose theme CSS, metadata, c2 registry, providers, shell, static not-found behavior, and a meaningful paused default document in `apps/examples/observability-nextjs/app/layout.tsx`, `apps/examples/observability-nextjs/app/loading.tsx`, and `apps/examples/observability-nextjs/app/not-found.tsx`

**Checkpoint**: The production export has meaningful default HTML, hydrates without warnings, generates repeatable data, and exposes shared scope/replay/theme infrastructure.

---

## Phase 3: User Story 1 - Investigate Service Health (Priority: P1) 🎯 MVP

**Goal**: An on-call engineer can identify a degraded service and follow consistent evidence into its slow/failed trace and correlated logs.

**Independent Test**: Starting at Overview, select the documented degraded service, inspect its indicators/dependencies/operations, open the suspicious trace, and reach correlated logs with the same environment, time scope, and identities in under 3 minutes.

### Tests for User Story 1

- [x] T031 [P] [US1] Write failing selector tests for overview prioritization, health derivation, latency ordering, service operations/dependencies/deployments, recent traces/logs/alerts, and correlation identity consistency in `apps/examples/observability-nextjs/test/unit/service-investigation.test.ts`
- [x] T032 [P] [US1] Write the failing pointer and keyboard service-investigation journey, including scope changes, detail reload, trace selection, correlated-log navigation, and unknown service/trace IDs in `apps/examples/observability-nextjs/test/service-investigation.spec.ts`
- [x] T033 [P] [US1] Write failing axe, focus-visible, chart-summary, non-color status, reduced-motion, and 1280px/768px overflow assertions for overview and service detail in `apps/examples/observability-nextjs/test/service-accessibility.spec.ts`

### Implementation for User Story 1

- [x] T034 [US1] Implement overview and service-detail selector projections over the shared dataset/replay snapshot in `apps/examples/observability-nextjs/features/overview/overview-selectors.ts` and `apps/examples/observability-nextjs/features/services/service-selectors.ts`
- [x] T035 [P] [US1] Build health KPI, active incident, prioritized attention, traffic/latency/error, and recent-change regions with accessible summaries in `apps/examples/observability-nextjs/features/overview/OverviewDashboard.tsx`
- [x] T036 [US1] Render the server-visible overview baseline and hydrate replay/scope updates in `apps/examples/observability-nextjs/app/page.tsx`
- [x] T037 [P] [US1] Build service search, status filtering, sortable indicator controls, removable criteria, and result announcements in `apps/examples/observability-nextjs/features/services/ServiceFilters.tsx`
- [x] T038 [US1] Build the c2 table service inventory with health badges, sparklines, sortable columns, stable row keys, keyboard row navigation, and detail links in `apps/examples/observability-nextjs/features/services/ServiceTable.tsx`
- [x] T039 [US1] Compose server baseline, client URL scope, loading/empty/error demo states, and service inventory in `apps/examples/observability-nextjs/app/services/page.tsx`
- [x] T040 [P] [US1] Build service KPIs, time-series charts with text/data alternatives, operations, dependencies, deployments, recent traces, related logs, and alerts in `apps/examples/observability-nextjs/features/services/ServiceDetail.tsx`
- [x] T041 [US1] Generate every service path, validate IDs, provide breadcrumb/return context, and render service detail/not-found outcomes in `apps/examples/observability-nextjs/app/services/[serviceId]/page.tsx`
- [x] T042 [US1] Build the core accessible trace hierarchy with `c2-tree`, aligned timing bars in consumer-owned label slots, failed/slow-span emphasis, attributes, events, and errors in `apps/examples/observability-nextjs/features/traces/TraceWaterfall.tsx`
- [x] T043 [US1] Generate every trace path, validate IDs, retain originating scope, render the core waterfall, and expose correlated-log actions in `apps/examples/observability-nextjs/app/traces/[traceId]/page.tsx`
- [x] T044 [US1] Add compact correlated-log evidence, shared scope links, replay updates, and page-scoped Normal/Loading/Empty/Error recovery without mutating URL or persistence in `apps/examples/observability-nextjs/features/services/CorrelatedEvidence.tsx`

**Checkpoint**: User Story 1 is a deployable MVP and passes its unit, browser, accessibility, and responsive tests independently.

---

## Phase 4: User Story 2 - Search Traces and Logs (Priority: P1)

**Goal**: Engineers can filter, paginate, inspect, and cross-link high-volume trace and log results while preserving reproducible URL context.

**Independent Test**: Apply multiple trace/log filters, change sorting/page/page size, inspect records, pivot between signals, return to the list, copy/reload the URL, and verify populated/loading/empty/error outcomes.

### Tests for User Story 2

- [x] T045 [P] [US2] Write failing unit tests for trace/log filter intersections, canonical sorting, 25/50/100 pagination, match highlighting, page invalidation, selected-log validation, and correlation href construction in `apps/examples/observability-nextjs/test/unit/trace-log-query.test.ts`
- [x] T046 [P] [US2] Write the failing trace/log search, table keyboard navigation, pagination, record detail, correlation, return-context, empty, and simulated-failure journey in `apps/examples/observability-nextjs/test/trace-log-correlation.spec.ts`
- [x] T047 [P] [US2] Write failing fresh-tab, copied URL, reload, back/forward, malformed-neighbor, URL-over-local preference, and page-size restoration coverage in `apps/examples/observability-nextjs/test/url-restoration.spec.ts`

### Implementation for User Story 2

- [x] T048 [P] [US2] Implement trace query/filter/sort/page projections and active-criteria models in `apps/examples/observability-nextjs/features/traces/trace-search.ts`
- [x] T049 [P] [US2] Build service, operation, status, duration, time, and free-text controls with independently removable criteria in `apps/examples/observability-nextjs/features/traces/TraceFilters.tsx`
- [x] T050 [US2] Build the controlled trace table plus compact pagination, 25/50/100 sizing, rich status/service/duration cells, URL event synchronization, and stable return links in `apps/examples/observability-nextjs/features/traces/TraceResults.tsx`
- [x] T051 [US2] Compose server default results, Suspense-isolated URL application, result counts, and deterministic state demonstrations in `apps/examples/observability-nextjs/app/traces/page.tsx`
- [x] T052 [US2] Extend trace detail with complete span timing relationships, attributes, events, error details, focus navigation, and explicit collection return context in `apps/examples/observability-nextjs/features/traces/TraceDetail.tsx`
- [x] T053 [P] [US2] Implement log severity/service/time/text filters, stable sorting, highlighted matches, pagination, and selected-record projections in `apps/examples/observability-nextjs/features/logs/log-search.ts`
- [x] T054 [P] [US2] Build log filters and the controlled log table/pager with severity, service, timestamp, message, and correlation cells in `apps/examples/observability-nextjs/features/logs/LogFilters.tsx` and `apps/examples/observability-nextjs/features/logs/LogResults.tsx`
- [x] T055 [US2] Build the focus-restoring selected-log sheet with timestamp, full message, structured attributes, trace/span IDs, and safe unknown-correlation handling in `apps/examples/observability-nextjs/features/logs/LogDetailSheet.tsx`
- [x] T056 [US2] Compose server default log results, Suspense-isolated URL state, query-selected detail, and deterministic page states in `apps/examples/observability-nextjs/app/logs/page.tsx`
- [x] T057 [US2] Implement trace-to-log and log-to-trace links that preserve environment/time, replace only signal-specific parameters, validate identities, and carry explicit list return state in `apps/examples/observability-nextjs/features/traces/CorrelationActions.tsx` and `apps/examples/observability-nextjs/features/logs/CorrelationActions.tsx`
- [x] T058 [US2] Add result-count announcements, keyboard focus restoration, scoped table overflow, long-message handling, and no-result/failure recovery actions in `apps/examples/observability-nextjs/features/traces/TraceResults.tsx` and `apps/examples/observability-nextjs/features/logs/LogResults.tsx`

**Checkpoint**: User Story 2 passes search, pagination, URL restoration, detail, correlation, keyboard, and state tests without depending on dashboard or alert functionality.

---

## Phase 5: User Story 3 - Monitor Operational Dashboards (Priority: P2)

**Goal**: Operations users can inspect at least six coherent panels, replay deterministic telemetry, and persistently rearrange/resize panels with keyboard-accessible controls.

**Independent Test**: Change scope, inspect panel legends/details/states, use only the keyboard to move and resize at least three panels, reload the layout, and restore the default at desktop and tablet widths.

### Tests for User Story 3

- [x] T059 [P] [US3] Write failing unit tests for the curated panel catalog, exact panel-ID permutation, allowed named sizes, breakpoint records, collision/reflow rules, invalid-storage fallback, boundary moves, and independent Reset layout behavior in `apps/examples/observability-nextjs/test/unit/dashboard-layout.test.ts`
- [x] T060 [P] [US3] Write the failing dashboard scope/replay, chart state, keyboard move/resize announcement, reload persistence, invalid-layout recovery, tablet layout, and Reset layout journey in `apps/examples/observability-nextjs/test/dashboard.spec.ts`

### Implementation for User Story 3

- [x] T061 [P] [US3] Define at least six stable curated panels spanning stats, time series, distribution, and ranked contributors, with units, selectors, supported named sizes, and accessible summary intent in `apps/examples/observability-nextjs/features/dashboards/panel-catalog.ts`
- [x] T062 [P] [US3] Implement panel metric projections from one environment/time/replay snapshot in `apps/examples/observability-nextjs/features/dashboards/dashboard-selectors.ts`
- [x] T063 [US3] Implement the versioned desktop/tablet layout store, complete-permutation validation, move commands, named-size commands, boundary results, and reset in `apps/examples/observability-nextjs/features/dashboards/dashboard-layout.ts`
- [x] T064 [P] [US3] Build stat, line, area, bar, sparkline, ranked-table, legend, loading, empty, and error panel renderers with text/data alternatives in `apps/examples/observability-nextjs/features/dashboards/DashboardPanel.tsx`
- [x] T065 [US3] Build keyboard-accessible Move before/after/first/last and Small/Medium/Large controls named by panel, with disabled boundaries and live result announcements in `apps/examples/observability-nextjs/features/dashboards/PanelControls.tsx`
- [x] T066 [US3] Drive `c2-dashboard` and `c2-dash-card` through public layout/attribute/event contracts, preserve DOM/visual order, keep track resizing accessible, and avoid the component's unversioned storage as authoritative state in `apps/examples/observability-nextjs/features/dashboards/OperationalDashboard.tsx`
- [x] T067 [US3] Compose the server-visible dashboard baseline, shared scope/replay updates, versioned layout hydration, reset confirmation, and deterministic Demo states in `apps/examples/observability-nextjs/app/dashboards/page.tsx`
- [x] T068 [US3] Add focus retention, reduced-motion behavior, zero/unavailable/extreme/mixed-unit fixtures, and chart/table non-color cues in `apps/examples/observability-nextjs/features/dashboards/OperationalDashboard.tsx`
- [x] T069 [US3] Verify bounded panel DOM, one coherent selector/chart update per replay tick, no chart-engine remount on data-only updates, and 1280px/768px no-overflow behavior in `apps/examples/observability-nextjs/test/dashboard-performance.spec.ts`
- [x] T070 [US3] Record any observed dashboard ordering, named-size, chart accessibility, or composition friction with evidence placeholders in `apps/examples/observability-nextjs/COMPONENT-EVALUATION.md`

**Checkpoint**: User Story 3 works with keyboard-only input, persists independently by breakpoint, and exposes equivalent chart information without relying on canvas or color alone.

---

## Phase 6: User Story 4 - Manage Alert Rules and Incidents (Priority: P2)

**Goal**: On-call users can inspect incident lifecycles and create/edit/preview/persist/reset valid alert rules using only synthetic destinations.

**Independent Test**: Open an incident, create an incomplete rule, correct focused validation errors, preview historical firing, save synthetic destinations, reload the saved rule, and reset demonstration data without changing layout or theme.

### Tests for User Story 4

- [x] T071 [P] [US4] Write failing rule-model tests enforcing a trimmed non-empty case-insensitively unique name, at least one resolving service ID, finite signal-bounded threshold, positive allowed evaluation window, required warning/critical severity, non-empty owner, at least one unique resolving synthetic destination ID, and required enabled state in `apps/examples/observability-nextjs/test/unit/alert-rule.test.ts`
- [x] T072 [P] [US4] Write failing store/lifecycle tests for immutable baseline overlays, deterministic created IDs, draft-invalid-previewed-saved-edited transitions, cancel preservation, incident triggered/acknowledged/muted/resolved transitions, invalid persisted-neighbor isolation, and Reset demo data boundaries in `apps/examples/observability-nextjs/test/unit/alert-store.test.ts`
- [x] T073 [P] [US4] Write the failing incident-detail, rule validation/focus, preview, synthetic destination, save/reload/edit/cancel, simulated delivery, save-failure recovery, and confirmed reset journey in `apps/examples/observability-nextjs/test/alerts.spec.ts`

### Implementation for User Story 4

- [x] T074 [US4] Implement alert draft validation, historical preview projection, effective baseline/local rule merge, deterministic local IDs, persistence failures, and reset commands in `apps/examples/observability-nextjs/features/alerts/alert-rules.ts` and `apps/examples/observability-nextjs/features/alerts/alert-store.ts`
- [x] T075 [P] [US4] Build Rules/Incidents tabs, state/severity/service/owner filters, enabled controls, tables, synthetic delivery status, and detail/edit links in `apps/examples/observability-nextjs/features/alerts/AlertsWorkspace.tsx`
- [x] T076 [US4] Compose the server baseline, persisted alert overlay, URL-selected tab/filter state, Reset demo data entry point, and deterministic page states in `apps/examples/observability-nextjs/app/alerts/page.tsx`
- [x] T077 [P] [US4] Build the incident summary, affected services, ownership, duration, annotations, and chronological triggered/acknowledged/muted/resolved `c2-steps` timeline in `apps/examples/observability-nextjs/features/alerts/IncidentDetail.tsx`
- [x] T078 [US4] Generate every incident path, validate IDs, preserve scope, and render incident detail/not-found outcomes in `apps/examples/observability-nextjs/app/incidents/[incidentId]/page.tsx`
- [x] T079 [US4] Build the alert-rule form with name, signal, services, operator, threshold, window, severity, owner, fixed synthetic destinations, enabled state, inline errors, error summary, first-invalid focus, and preserved valid input in `apps/examples/observability-nextjs/features/alerts/AlertRuleForm.tsx`
- [x] T080 [US4] Build the historical threshold preview with firing intervals, understandable explanation, chart summary, loading/empty/error outcomes, and no production-evaluation implication in `apps/examples/observability-nextjs/features/alerts/AlertRulePreview.tsx`
- [x] T081 [US4] Compose new and baseline/local edit routes with cancel behavior, save feedback, generated static parameters for baseline rules, and query-backed local-rule editing in `apps/examples/observability-nextjs/app/alerts/rules/new/page.tsx` and `apps/examples/observability-nextjs/app/alerts/rules/[ruleId]/page.tsx`
- [x] T082 [US4] Implement confirmed Reset demo data and simulated-delivery feedback without clearing theme/dashboard keys or accepting real addresses, endpoints, or credentials in `apps/examples/observability-nextjs/features/alerts/AlertActions.tsx`
- [x] T083 [US4] Add keyboard-only operation, modal focus return, one non-duplicated announcement path, missing-owner handling, long-label layout, and reduced-motion behavior in `apps/examples/observability-nextjs/features/alerts/AlertsWorkspace.tsx` and `apps/examples/observability-nextjs/features/alerts/AlertRuleForm.tsx`
- [x] T084 [US4] Add failing-then-passing malformed storage, unknown rule/incident ID, unavailable storage, quota failure, and stale destination recovery coverage in `apps/examples/observability-nextjs/test/alert-edge-cases.spec.ts`

**Checkpoint**: User Story 4 validates, previews, persists, edits, and resets local rules without real integrations, while incident detail remains fully inspectable and accessible.

---

## Phase 7: User Story 5 - Evaluate the Component Library (Priority: P3)

**Goal**: Developers can understand the c2n composition on every page and receive a complete, evidence-backed report covering every component used in Next.js.

**Independent Test**: Launch from a clean checkout, complete the four operational journeys, inspect Built with c2n on every primary page, follow documentation/source links, and verify the final report covers 100% of shipped c2 tags with all required evidence fields.

### Tests for User Story 5

- [x] T085 [P] [US5] Write a failing registry audit that compares rendered/imported c2 tags with unique component usage records and enforces at least 25 distinct elements across navigation, input, data, chart, layout, and feedback in `apps/examples/observability-nextjs/test/unit/component-usage.test.ts`
- [x] T086 [P] [US5] Write failing raw-HTML, production hydration, Strict Mode, property preservation, custom-event, duplicate-registration, console-warning, route reload, and no-JavaScript meaningful-content coverage in `apps/examples/observability-nextjs/test/hydration.spec.ts`

### Implementation for User Story 5

- [x] T087 [US5] Build the page-scoped Built with c2n sheet with region-to-package mapping, Demo state selector, documentation links, representative source links, keyboard operation, and trigger focus return in `apps/examples/observability-nextjs/components/built-with/BuiltWithC2n.tsx`
- [x] T088 [P] [US5] Complete actual shipped-tag usage mappings for Overview, Services, Traces, Logs, Dashboards, Alerts, and Settings/theme regions in `apps/examples/observability-nextjs/lib/data/component-usage.ts`
- [x] T089 [US5] Integrate Built with c2n into every primary page without duplicating page state or persistence in `apps/examples/observability-nextjs/components/app-shell/AppShell.tsx`
- [x] T090 [P] [US5] Add and verify working c2n documentation/source URL builders for deployed base paths and repository source links in `apps/examples/observability-nextjs/components/built-with/component-links.ts`
- [x] T091 [US5] Populate the component inventory with exact versions, exercised APIs, regions, outcomes, positive patterns, findings, and evidence for 100% of shipped tags in `apps/examples/observability-nextjs/COMPONENT-EVALUATION.md`
- [x] T092 [US5] Audit anticipated and newly observed Next.js integration, SSR/hydration, API/types, events/bindings, styling, composition, accessibility, documentation, performance, and developer-experience findings; append unresolved concise entries to `COMPONENT-FEEDBACK.md` or record fixed-in-change tests and disposition in `apps/examples/observability-nextjs/COMPONENT-EVALUATION.md`
- [x] T093 [US5] Document launch, architecture, deterministic-data limitations, component compositions, property/event patterns, public styling hooks, evaluation link, and unsupported production capabilities in `apps/examples/observability-nextjs/README.md`
- [x] T094 [US5] Make the component evaluation audit pass for required IDs, categories, priorities, versions, reproduction, evidence, workaround, recommendation, and feedback/fixed disposition in `apps/examples/observability-nextjs/test/unit/component-evaluation.test.ts`

**Checkpoint**: User Story 5 proves Next.js interoperability and leaves a complete, actionable improvement record rather than scattered notes.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Validate system-wide quality, portability, performance, edge cases, documentation synchronization, and constitutional compliance.

- [x] T095 [P] Add representative WCAG A/AA axe scans, keyboard P1/P2 journeys, focus restoration, live-announcement, chart-alternative, and 200% zoom coverage for every primary route/state in `apps/examples/observability-nextjs/test/accessibility.spec.ts`
- [x] T096 [P] Add 1280px/768px layout, long names/messages/attributes/labels, scoped dense-table scrolling, side-nav behavior, and no page-level overflow coverage in `apps/examples/observability-nextjs/test/responsive.spec.ts`
- [x] T097 [P] Add Chromium/Firefox/WebKit production smoke coverage for registration, hydration, primary navigation, filters, overlays, charts, form controls, and direct route reloads in `apps/examples/observability-nextjs/test/portability.spec.ts`
- [x] T098 [P] Add light/dark/system first-paint reconciliation and reduced-motion behavior coverage without persistence cross-talk in `apps/examples/observability-nextjs/test/theme-motion.spec.ts`
- [x] T099 [P] Add unknown IDs, missing correlations, conflicting filters, zero/unavailable/extreme metrics, invalid URL neighbors, stale storage, replay cleanup, and synthetic failure recovery coverage in `apps/examples/observability-nextjs/test/edge-cases.spec.ts`
- [x] T100 [P] Add deterministic table DOM, chart update/remount, and documented one-worker initial-content/local-feedback measurement scenarios in `apps/examples/observability-nextjs/test/performance.spec.ts`
- [x] T101 [P] Assert no runtime application-data requests leave localhost/static assets and no UI accepts secrets, real contact details, or arbitrary endpoints in `apps/examples/observability-nextjs/test/offline-security.spec.ts`
- [ ] T102 Run and fix app type-check, unit tests, production build, browser suites, root lint/format, `npm run docs:check`, `npm run check:dogfood`, `npm run examples:build`, and `npm run ui:build`, updating only failing in-scope files under `apps/examples/observability-nextjs`, `apps/ui`, `package.json`, and `package-lock.json`
- [x] T103 Record VoiceOver/Safari, NVDA/Firefox-or-Chrome, keyboard-only, 200% zoom, performance environment/results, and remaining limitations in `apps/examples/observability-nextjs/COMPONENT-EVALUATION.md`
- [ ] T104 Execute every scenario in `specs/003-nextjs-observability/quickstart.md`, reconcile the final component report and root feedback log, and record the final constitution/completion audit in `apps/examples/observability-nextjs/COMPONENT-EVALUATION.md`

**Checkpoint**: All automated and manual evidence is complete, the static docs deployment contains the example, and every open component-library issue is traceable.

---

## Dependencies & Execution Order

### Phase dependencies

- **Phase 1 — Setup**: Starts immediately. T009 follows T002; T006 precedes T007; T008 follows T002.
- **Phase 2 — Foundational**: Depends on Phase 1 and blocks all stories. Test tasks T011/T014/T016/T018/T020 precede their paired implementations.
- **Phase 3 — US1**: Depends on Phase 2 and is the MVP.
- **Phase 4 — US2**: Depends on Phase 2 plus the shared trace route/waterfall from T042–T043; its trace and log search work is otherwise isolated.
- **Phase 5 — US3**: Depends only on Phase 2 and may run alongside US1/US2.
- **Phase 6 — US4**: Depends only on Phase 2 and may run alongside US1/US2/US3.
- **Phase 7 — US5**: The Built with c2n shell can begin after Phase 2, but the final inventory/report tasks T091–T094 depend on US1–US4 completion.
- **Phase 8 — Polish**: Depends on all selected stories; T102–T104 are sequential final gates.

### User story dependency graph

```text
Setup → Foundation → US1 (MVP) ─┐
                  ├→ US2 ──────┤
                  ├→ US3 ──────┼→ US5 final evaluation → Polish
                  └→ US4 ──────┘
```

- **US1** owns the minimal trace/correlated-log path needed for the service investigation MVP.
- **US2** extends that shared trace detail into full independent trace/log search and URL restoration.
- **US3** and **US4** share only foundational state and can proceed independently.
- **US5** consumes each page's completed component registry records and therefore closes after the operational stories.

### Within each story

1. Write the listed unit and browser tests and confirm expected failures.
2. Implement story-specific selectors/models.
3. Build components and route composition.
4. Add state, accessibility, persistence, and edge behavior.
5. Run the story checkpoint before starting the next sequential priority.

## Parallel Opportunities

- Setup configuration tasks T003–T005 and T010 can run after T001 without editing the same files.
- Foundational test tasks T011, T014, T016, T018, and T020 can be written in parallel; T022, T025, and T028 are also file-isolated.
- After Foundation, US3 and US4 can run in parallel with US1; US2 can begin its query/table work while US1 completes the shared trace detail.
- Within US1, T035, T037, and T040 are parallel component tracks after selectors.
- Within US2, trace tasks T048–T052 and log tasks T053–T056 can progress in parallel before correlation integration.
- Within US3, panel catalog/selectors/renderers T061, T062, and T064 can run in parallel before dashboard composition.
- Within US4, incident detail T077 can run in parallel with alert-rule form/preview work T079–T080.
- Polish test suites T095–T101 are file-isolated and parallelizable before the final gates.

## Parallel Execution Examples

### User Story 1

```text
Task T035: Build OverviewDashboard.tsx
Task T037: Build ServiceFilters.tsx
Task T040: Build ServiceDetail.tsx
```

### User Story 2

```text
Task T048: Implement trace-search.ts
Task T049: Build TraceFilters.tsx
Task T053: Implement log-search.ts
Task T054: Build LogFilters.tsx and LogResults.tsx
```

### User Story 3

```text
Task T061: Define panel-catalog.ts
Task T062: Implement dashboard-selectors.ts
Task T064: Build DashboardPanel.tsx
```

### User Story 4

```text
Task T077: Build IncidentDetail.tsx
Task T079: Build AlertRuleForm.tsx
Task T080: Build AlertRulePreview.tsx
```

### User Story 5

```text
Task T085: Write component usage audit
Task T086: Write SSR/hydration coverage
Task T090: Add documentation/source URL builders
```

## Implementation Strategy

### MVP first

1. Complete Setup and Foundation.
2. Complete US1 through T044.
3. Run the US1 unit, journey, accessibility, responsive, production-build, and hydration checks.
4. Demonstrate the independent service-to-trace-to-logs workflow before expanding scope.

### Incremental delivery

1. **MVP**: US1 service investigation.
2. **Search increment**: US2 trace/log filtering, pagination, and correlation.
3. **Operations increment**: US3 dashboards and US4 alerts/incidents, in either order or parallel.
4. **Developer increment**: US5 page guidance and complete component evaluation.
5. **Release candidate**: cross-cutting Phase 8 gates and quickstart audit.

### Safe stopping points

- After T030: framework/data foundation builds and hydrates.
- After T044: deployable service-investigation MVP.
- After T058: complete P1 observability investigation/search surface.
- After T084: all operational P1/P2 stories complete.
- After T094: full component-library teaching and feedback deliverable complete.
- After T104: release-ready evidence and repository gates complete.

## Notes

- Keep every c2 usage on documented public APIs; never access shadow roots.
- If an app workaround exposes component friction, update the evaluation immediately and either fix the component with synchronized tests/docs/manifests or append root feedback.
- Preserve unrelated existing changes in `apps/ui/src/content/guides/frameworks.mdx` and `specs/002-reliable-reorder-list/spec.md`.
- Do not invent evaluation findings before observing them in implementation.
- Commit after logical task groups and rerun the relevant story checkpoint before proceeding.

## Phase 9: Convergence

- [x] T105 Render the selected service's current alert rules and incident evidence in `apps/examples/observability-nextjs/features/services/ServiceDetail.tsx`, with focused selector and UI coverage, per FR-006 and T040 (partial)
- [x] T106 Apply the page-scoped Normal, Loading, Empty, and recoverable Error states to the Services inventory without changing URL, scope, or persistence, and add regression coverage, per FR-017, FR-017a, SC-003, SC-014, and T039 (partial)
- [x] T107 Preserve normalized environment, time range, filters, originating service, and explicit return context across service inventory, service detail, trace detail, and correlated logs; project service detail from the active scope rather than a fixed tick-zero snapshot, per FR-003, FR-025a, US1/AC1-3, T041, and T044 (partial)
- [x] T108 Drive service evidence, trace/log searches and details, alerts/incidents, and dashboard/overview projections from the same bounded replay snapshot, define deterministic end-of-timeline behavior, and add cross-signal replay tests, per FR-030, US3/AC4, the replay edge case, and plan: shared replay (partial)
- [x] T109 Apply the global environment and time scope to alert/incident filtering and alert-rule service choices instead of hard-coding production, preserving valid URL filters and synthetic-only destinations, per FR-003 and FR-013 (partial)
- [x] T110 Centralize deployment-aware internal href construction for custom elements and server-visible fallback anchors, replace root-relative service/trace/log links that bypass the Next.js static `basePath`, and add deployed-base-path navigation assertions, per FR-025, FR-027, and plan: static base path (contradicts)

## Phase 10: Convergence

- [x] T111 Preserve normalized environment and time-range scope in the brand and every primary navigation destination, keep valid URL state authoritative, and add navigation/reload coverage proving scope survives route changes without stale-provider resets, per FR-003, FR-026, and US1/AC1 (contradicts)
- [x] T112 Apply one exact relative-or-absolute replay window to overview summaries and changes, service deployments and correlated evidence, trace-detail logs, dashboard metrics/rankings/distributions/incidents, and alerts; remove projection-specific synthetic drift and add cross-signal boundary tests covering baseline through replay completion, per FR-003, FR-030, and US3/AC2-4 (partial)
- [x] T113 Add operation to the canonical trace navigation schema and serialization, retain it through trace detail and trace/log return contexts alongside page, page size, filters, and sorting, and add copied-URL and detail-return regression coverage, per FR-007, FR-009a, and US2/AC5-6 (partial)
- [x] T114 Make Normal, Loading, Empty, and Error recovery coherent on every primary data page: returning from a forced state must restore Normal without unintentionally clearing the active URL query, scope, persisted preferences, or demo data, with focused recovery coverage, per FR-017, FR-017a, US2/AC4, and US5/AC5 (contradicts)
- [x] T115 Project the effective persisted alert-rule overlay into each service detail so locally created and edited rules appear under Current alert rules after save and reload without mutating the immutable baseline, with selector and UI coverage, per FR-006 and FR-016a (partial)
- [x] T116 Preserve normalized environment, exact time range, applicable filters, and explicit origin/return context in overview investigation links, service dependency/alert/incident links, and visible alert edit/incident actions, with deep-link regression coverage, per FR-003 and FR-025a (partial)

## Phase 11: Convergence

- [x] T117 Derive service health, overview KPIs, service-detail indicators, and operation summaries from the exact environment/time/replay metric and incident window instead of immutable baseline `Service` fields, and add baseline, narrow-relative, absolute-range, and replayed-snapshot coverage proving every visible service summary follows the active scope, per FR-003, FR-004, FR-006, US1/AC1-2, and plan/data model: replay-derived Service (partial)
- [x] T118 Extend the deterministic fixtures and shared replay projections so service, metric, trace, log, and incident sequences each advance observably and remain correlated through the full replay horizon, then assert identical baseline, intermediate, completion, pause, and refresh sequences across repeated runs, per FR-030, SC-011, US3/AC4, and plan: shared replay (partial)

## Phase 12: Convergence

- [x] T119 CRITICAL Replace the `c2-table` shadow-root row inspection in `apps/examples/observability-nextjs/test/performance.spec.ts` with assertions through documented public properties and accessibility semantics, and add a source regression guard rejecting shadow-root access anywhere in the example application or tests, per Constitution IV/V, FR-021, and plan: c2n integration (contradicts)
- [x] T120 Make the dashboard performance journey advance at least one real deterministic replay tick, assert the public replay/data state changed coherently, and only then verify that chart hosts remain mounted and unrelated UI is not rebuilt, per FR-030, SC-011, T100, and plan: verification strategy (partial)
- [x] T121 Replace the native disclosure in `apps/examples/observability-nextjs/features/alerts/AlertRulePreview.tsx` with the published `c2-details` element and extend the app-level component-usage audit so native equivalents require an explicit feedback-linked exemption, per FR-020, US5/AC3, and Constitution III (contradicts)

## Phase 13: Convergence

- [x] T122 HIGH Remove the fixed 16-record truncation from `apps/examples/observability-nextjs/components/built-with/BuiltWithC2n.tsx`, present every applicable major c2n composition for each primary/detail route through a complete usable grouping, and add route-level coverage proving no applicable registry entry is omitted, per FR-031, SC-013, and US5/AC4 (partial)
- [x] T123 Synchronize the `c2-details` alert-preview usage context and representative source across `apps/examples/observability-nextjs/lib/data/component-usage.ts` and `apps/examples/observability-nextjs/COMPONENT-EVALUATION.md`, then strengthen the evaluation audit to detect stale usage regions/workflows after component use expands, per FR-022a, SC-017, and plan: component evaluation contract (partial)

## Phase 14: Convergence

- [x] T124 HIGH Replace substring-based collection/detail classification in `apps/examples/observability-nextjs/components/built-with/component-map.ts` with explicit route semantics, ensure each Built with c2n page group lists only components behind visible major regions, and add independent positive and negative route expectations so `/services/` cannot inherit service-detail compositions and `/traces/` cannot inherit trace-detail compositions, per FR-031, SC-013, and US5/AC4 (partial)
- [x] T125 Synchronize the always-visible Built with c2n overlay's `c2-sheet` developer-guidance usage and representative source in `apps/examples/observability-nextjs/lib/data/component-usage.ts` and `apps/examples/observability-nextjs/COMPONENT-EVALUATION.md`, and add coverage proving the panel identifies its own major overlay composition on every primary route, per FR-022a, SC-017, and plan: component evaluation contract (partial)
