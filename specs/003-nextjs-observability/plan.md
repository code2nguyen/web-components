# Implementation Plan: Next.js Observability Showcase

**Branch**: `003-nextjs-observability` | **Date**: 2026-09-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/003-nextjs-observability/spec.md`

## Summary

Build a production-shaped, original observability console as a private Next.js App Router example at `apps/examples/observability-nextjs`. The application will statically export into the existing documentation deployment, server-render a deterministic paused telemetry baseline, and use focused client boundaries for c2n custom-element registration, replay, filtering, dashboard layout, and alert mutations. URL parameters are the canonical investigation state; versioned browser storage is limited to alert overlays, dashboard preferences, and theme. The example will exercise at least 25 published c2n elements across service health, traces, logs, dashboards, alerts, incidents, and developer guidance, then deliver a complete evidence-backed c2n evaluation report.

## Technical Context

**Language/Version**: TypeScript 6.0.3, React 19.3.0, Node.js 24

**Primary Dependencies**: Next.js 16.3.3 App Router, React 19.3.0, published `@c2n/*` workspaces, `@c2n/theme`, `uplot`; use ECharts only if a selected panel needs a radial or scatter visualization

**Storage**: Immutable TypeScript demonstration fixtures plus versioned `localStorage` envelopes for alert-rule overlays, dashboard layout, and theme; URL search parameters for shareable investigation state; no database or external service

**Testing**: Node.js built-in test runner for pure domain/state modules; Playwright 1.63.0 and `@axe-core/playwright` 4.13.0 for end-to-end, accessibility, hydration, responsive, and performance validation

**Target Platform**: Static GitHub Pages export in modern browsers supported by Next.js 16 (Chrome/Edge 111+, Firefox 111+, Safari 16.4+), with primary validation at 1280px desktop and 768px tablet widths

**Project Type**: Statically exported server-rendered web application inside the npm-workspaces monorepo

**Performance Goals**: Meaningful initial content within 2 seconds; local navigation/filter feedback within 200ms; one coherent chart/data update per replay tick; bounded table DOM at 25, 50, and 100-row page sizes

**Constraints**: No accounts, secrets, runtime backend, Server Actions, live ingestion, external notification delivery, or application-data network requests; direct URLs must survive static hosting; no duplicate custom-element registration or hydration warnings; use only documented c2n properties, events, slots, CSS variables, and parts

**Scale/Scope**: Seven primary navigation destinations, service/trace/incident/alert detail routes, at least 8 services, 150 traces, 1,000 logs, 8 alert rules, 6 incidents, at least 6 dashboard panels, and a committed baseline of more than 25 distinct c2n elements

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design._

| Principle                                     | Gate                                                                                                                                           | Pre-design result                                                                                          | Post-design result                                                                                                                                          |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. AI-First Component Contracts               | Every consumed component must be discoverable through published contracts; app-specific integration conventions and findings must be explicit. | Pass: the plan uses package manifests, generated React JSX declarations, and typed event/property helpers. | Pass: `contracts/c2n-integration.md` and `contracts/component-evaluation.md` define the integration and evidence contracts.                                 |
| II. Complete Styling Control                  | Styling must use public CSS variables, parts, and slots; shadow-root reach-through is prohibited.                                              | Pass: public theme and styling hooks are the only planned customization path.                              | Pass: the integration contract makes this testable and routes any gap to feedback or a component fix.                                                       |
| III. Real-World Examples Are Product Surface  | The feature must be a realistic, runnable, copyable application rather than isolated snippets.                                                 | Pass: the feature contains complete observability journeys and deterministic data.                         | Pass: the source layout, quickstart, docs discovery, and static deployment are specified.                                                                   |
| IV. One Contract, Every Documentation Surface | Public API changes found during dogfooding must update source, types, manifests, docs, examples, and tests together.                           | Pass: no public component changes are assumed; any same-change fix must follow repository gates.           | Pass: the evaluation contract distinguishes fixed-and-verified findings from unresolved feedback entries.                                                   |
| V. Accessible, Portable Web Standards         | Keyboard, focus, names, announcements, reduced motion, framework portability, and element-boundary testing are required.                       | Pass: the specification contains measurable accessibility and Next.js hydration outcomes.                  | Pass: UI contracts and quickstart include keyboard dashboard actions, chart alternatives, axe scans, cross-browser smoke coverage, and console-error gates. |

No constitution violations require a complexity exception.

## Architecture Decisions

### Rendering and deployment

- Use Next.js App Router with Server Components for layouts, route entry points, deterministic fixture selection, metadata, and meaningful initial light-DOM content.
- Use `output: 'export'`, `trailingSlash: true`, and the documentation demo base path so `next build` produces a static `out/` tree compatible with GitHub Pages.
- Generate static parameters for known record routes. Use validated query parameters for log selection and list-return context where generating one page per log would add no product value.
- Add `nextjs` to the documentation example framework schema and allow `app.config.json` to declare its output directory so the existing sync step can copy `out/` without a fake `dist/` stage.

### c2n and React interoperability

- Register each consumed c2n package once from a root client module whose side-effect imports run before interactive custom-element markup hydrates.
- Import each package's generated `/react` declaration in `types/c2-elements.d.ts`; these are JSX contracts, not wrapper components.
- Render primitive, attribute-safe values on the server using manifest-defined kebab-case attribute names.
- Assign arrays, objects, callbacks, and renderer properties through typed refs after upgrade, or use JSON strings only where the documented converter guarantees identical server/client parsing.
- Listen for kebab-case, non-bubbling, and form-control events through a typed `addEventListener` hook rather than React synthetic event props.
- Import chart elements by subpath to avoid registering unused chart families and engines.

### Data, state, and replay

- Generate the entire immutable telemetry graph from a fixed UTC baseline, explicit integer seed, stable IDs, integer offsets, and a repository-owned deterministic PRNG. Never use `Date.now()`, `Math.random()`, locale-dependent parsing, or fetch.
- Build indexes once and query all pages through pure selectors so traces, spans, logs, metrics, services, incidents, and rules cannot drift apart.
- Keep one replay clock `{ baselineInstant, tick, status, stepMs }`, paused at tick zero during server render and reload. Playback increments logical ticks; pause freezes them; refresh returns to the baseline.
- Keep page Demo state ephemeral and separate from telemetry, URL, and persistence.
- Treat saved alert rules as a validated local overlay over immutable baseline rules.

### Navigation and persistence

- Treat normalized URL parameters as the source of truth for environment, time range, filters, sorting, page, and page size. The static server export renders the documented default snapshot; a focused client boundary inside Suspense reads and applies the current query after hydration. Its first client render matches the server default, and valid URL state then overrides local preferences.
- Preserve list context by carrying the normalized list query into detail URLs and explicit return links rather than relying on browser history alone.
- Store independent versioned envelopes under `c2n-observability:v1:*`; validate and recover each area separately.
- Keep reset boundaries distinct: Refresh resets replay only, Reset layout resets dashboard state only, and Reset demo data resets alert/demo mutations only.
- Let the application own dashboard panel order and named sizes. Drive `c2-dashboard` through its public layout contract; do not depend on its unversioned track-size storage for the full feature state.

### Component usage baseline

The implementation should use the smallest credible subset of the researched 46-element inventory while preserving the required coverage. The planned baseline includes:

- Shell/navigation: `c2-header`, `c2-side-nav`, `c2-breadcrumb`, `c2-theme-select`, `c2-button`, `c2-icon-button`, `c2-button-group`, `c2-tooltip`.
- Filters/forms: `c2-select`, `c2-list-item`, `c2-text-field`, `c2-autocomplete`, `c2-number-input`, `c2-date-input`, `c2-date-selector`, `c2-checkbox`, `c2-radio-group`, `c2-radio`, `c2-switch`.
- Data/detail: `c2-table`, `c2-table-column`, `c2-pagination`, `c2-stat`, `c2-badge`, `c2-card`, `c2-tabs`, `c2-tab`, `c2-details`, `c2-tree`, `c2-tree-item`.
- Charts/layout: `c2-line-chart`, `c2-area-chart`, `c2-bar-chart`, `c2-sparkline`, `c2-chart-series`, `c2-dashboard`, `c2-dash-card`.
- Feedback/overlays: `c2-steps`, `c2-step`, `c2-sheet`, `c2-modal`, `c2-toast-region`, `c2-status-panel`, `c2-skeleton`, `c2-spinner`, `c2-progress`.
- Supporting actions: `c2-menu`, `c2-menu-item`, `c2-link-button`, `c2-kbd`; `c2-reorder-list` may support a separate linear layout editor but is not treated as a grid-reordering solution.

The final component registry and evaluation report must describe what was actually shipped rather than count unused imports.

## Project Structure

### Documentation (this feature)

```text
specs/003-nextjs-observability/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── c2n-integration.md
│   ├── component-evaluation.md
│   ├── navigation-state.md
│   └── replay-and-persistence.md
└── tasks.md
```

### Source Code (repository root)

```text
apps/examples/observability-nextjs/
├── app.config.json
├── next.config.ts
├── package.json
├── playwright.config.ts
├── tsconfig.json
├── README.md
├── COMPONENT-EVALUATION.md
├── app/
│   ├── globals.css
│   ├── layout.tsx
│   ├── not-found.tsx
│   ├── page.tsx
│   ├── services/
│   │   ├── page.tsx
│   │   └── [serviceId]/page.tsx
│   ├── traces/
│   │   ├── page.tsx
│   │   └── [traceId]/page.tsx
│   ├── logs/page.tsx
│   ├── dashboards/page.tsx
│   ├── alerts/
│   │   ├── page.tsx
│   │   ├── rules/new/page.tsx
│   │   └── rules/[ruleId]/page.tsx
│   └── incidents/[incidentId]/page.tsx
├── components/
│   ├── app-shell/
│   ├── built-with/
│   ├── c2n/
│   │   ├── C2Registry.tsx
│   │   ├── element-bindings.ts
│   │   └── useCustomEvent.ts
│   ├── scope/
│   └── state/
├── features/
│   ├── overview/
│   ├── services/
│   ├── traces/
│   ├── logs/
│   ├── dashboards/
│   └── alerts/
├── lib/
│   ├── data/
│   ├── domain/
│   ├── query/
│   ├── replay/
│   ├── storage/
│   ├── validation/
│   └── format/
├── providers/
├── public/
├── types/c2-elements.d.ts
└── test/
    ├── unit/
    ├── service-investigation.spec.ts
    ├── trace-log-correlation.spec.ts
    ├── dashboard.spec.ts
    ├── alerts.spec.ts
    ├── url-restoration.spec.ts
    ├── responsive.spec.ts
    ├── hydration.spec.ts
    └── accessibility.spec.ts
```

Repository integration also updates:

```text
package.json                         # Wireit examples:build dependency
package-lock.json                    # exact Next.js and app dependencies
apps/ui/src/schemas/index.ts         # nextjs example framework and outputDir metadata
apps/ui/scripts/sync-examples.mjs    # per-example output directory
COMPONENT-FEEDBACK.md                # unresolved c2n consumption findings only
```

**Structure Decision**: The feature is a standalone framework-consumer application under the existing `apps/examples/*` workspace convention. Domain and state logic remain framework-free under `lib/`; route files coordinate server rendering; client components own browser APIs and custom-element properties/events; Playwright and Node tests remain inside the example so its contract can be run independently.

## Verification Strategy

1. Unit-test deterministic generation, minimum cardinalities, reference integrity, selectors, URL codec round trips, invalid-neighbor recovery, pagination, replay state transitions, storage validation/migration, alert validation, and dashboard layout permutations.
2. Assert meaningful paused baseline content in raw production HTML before client JavaScript.
3. Fail browser tests on hydration mismatch, duplicate-registration, invalid-binding, or unexpected console errors.
4. Exercise P1/P2 workflows with real pointer and keyboard input, including trace/log correlation, alert authoring, and dashboard move/resize controls.
5. Verify URL copy/reload/back behavior, static detail routes, unknown identifiers, state reset boundaries, and deterministic replay across repeated refreshes.
6. Run representative axe scans, reduced-motion checks, keyboard-only journeys, chart text/table alternatives, and no-page-overflow assertions at 1280px and 768px.
7. Record deterministic cost assertions for table DOM bounds and chart updates, and document one-worker measurements for the 2-second and 200-millisecond success criteria.
8. Complete a component-usage coverage audit and publish `COMPONENT-EVALUATION.md`; append unresolved consumption findings to the root feedback log.

## Complexity Tracking

No constitution violations or unjustified architecture complexity were identified.
