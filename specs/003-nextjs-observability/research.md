# Research: Next.js Observability Showcase

## 1. Application placement and framework

**Decision**: Create `apps/examples/observability-nextjs` as a private TypeScript workspace using the Next.js App Router.

**Rationale**: `apps/examples/*` is already a root npm workspace and is the repository convention for complete external-consumer applications. App Router Server Components provide a current, high-value demonstration of server-rendered custom-element markup and focused client interactivity.

**Alternatives considered**:

- Add the feature to `apps/ui`: rejected because the Astro site is the documentation host, not a Next.js consumer example.
- Use the Pages Router: rejected because it would demonstrate an older Next.js architecture.
- Use the existing generic example generator: rejected because it scaffolds Vite/HTML applications and would require more correction than a purpose-built Next.js workspace.

## 2. Framework versions and deployment mode

**Decision**: Pin Next.js 16.3.3, React/React DOM 19.3.0, and repository TypeScript 6.0.3 exactly; build with `output: 'export'`, `trailingSlash: true`, and the documentation demo base path.

**Rationale**: The repository and CI use Node 24, while Next.js 16 requires Node 20.9 or newer. The official August 2026 security release identifies 16.3.3 as the Active LTS security patch. Static export creates HTML per route, supports App Router Server Components at build time, and fits the existing GitHub Pages pipeline without a runtime server. React 19.3.0 is already the exact version in the repository's React example.

**Alternatives considered**:

- `next start`: rejected because it needs a Node service and cannot be copied into the static Pages artifact.
- A client-only SPA: rejected because it would not prove the required server-rendered initial content and hydration behavior.
- A floating `next@latest` range: rejected because the repository pins framework/tool versions and reproducible feedback must identify an exact version.

**Primary sources**:

- [Next.js installation and platform requirements](https://nextjs.org/docs/app/getting-started/installation)
- [Next.js static exports](https://nextjs.org/docs/app/guides/static-exports)
- [Next.js August 2026 security release](https://nextjs.org/blog)

## 3. Repository build and documentation integration

**Decision**: Add the app to root `examples:build`; extend example metadata with framework `nextjs` and an optional `outputDir` defaulting to `dist`; declare `out` for this app so the existing documentation sync copies the static export.

**Rationale**: Existing examples are discovered from `app.config.json`, built through Wireit, copied under `apps/ui/public/demo`, and linked automatically from the docs collection. A metadata-driven output directory preserves all existing Vite examples while respecting Next.js's conventional static output.

**Alternatives considered**:

- Copy `out` to a fake `dist`: rejected as duplicate output and unnecessary work.
- Label the app as React: rejected because it hides the framework integration being demonstrated.
- Add a separate deployment workflow: rejected because the current static artifact already provides the correct hosting path.

## 4. c2n registration and React bindings

**Decision**: Register globally used custom elements once from a root client module; import generated `/react` declarations for JSX typing; keep server markup to documented kebab-case attributes and serializable primitives; assign property-only values through typed refs and attach custom events with `addEventListener`.

**Rationale**: The existing React example documents that elements must be defined before React assigns object properties. Generated `/react` modules provide JSX types but intentionally are not runtime wrappers. Several c2n events are kebab-case and non-bubbling, so React event props cannot represent them. Node import probes for representative button, table, chart, and dashboard packages succeed, making module-scope registration compatible with prerender evaluation; hydration tests remain the acceptance gate.

**Alternatives considered**:

- Build wrapper components for every c2 element: rejected because it would obscure standards-based custom-element use and create a parallel API.
- Import registration in effects: rejected because React could hydrate and assign values before upgrade.
- Pass every complex value as a JSX object prop during SSR: rejected because property/attribute behavior before upgrade is component- and renderer-sensitive.
- Disable SSR for the entire application: rejected because it defeats the primary Next.js interoperability goal.

## 5. Component inventory and chart engines

**Decision**: Commit to a meaningful baseline of more than 25 c2 elements across navigation, input, data, chart, layout, and feedback. Use line, area, bar, sparkline, and chart-series subpath imports with `uplot`; add ECharts only if a chosen radial or scatter panel materially improves the workflow.

**Rationale**: Repository manifests support a credible 46-element inventory without decorative padding. Subpath chart imports minimize registration and engine cost. The core observability panels can be expressed with uPlot-backed trends and bars, while data tables and textual summaries provide accessible alternatives.

**Alternatives considered**:

- Import every component and chart from package barrels: rejected because the evaluation must cover components actually used, not inflate counts.
- Use icons as most of the 25-element requirement: rejected because the specification requires functional category breadth.
- Always install both chart engines: rejected until a real panel requires ECharts.

## 6. Deterministic telemetry generation

**Decision**: Generate one normalized immutable dataset from a fixed UTC baseline, integer seed, stable identifiers, integer time offsets, and an explicitly implemented deterministic PRNG. Build indexes once and expose pure selectors.

**Rationale**: Every service, metric, trace, span, log, incident, and alert view must agree. Fixed generation makes replay, screenshots, tests, URL sharing, and feedback reproduction stable. Pure domain modules can run during server rendering and in Node unit tests without browser APIs.

**Alternatives considered**:

- `Math.random()` or current wall time: rejected because output would drift between server render, hydration, and test runs.
- Independent fixtures per page: rejected because correlations could contradict each other.
- Runtime data fetches: rejected because the example must run without accounts, secrets, or network data.

## 7. Replay model

**Decision**: Use one replay state machine with a paused tick-zero server snapshot. Playback advances one logical integer tick per timer callback; pause stops the timer; refresh cancels it and returns to tick zero. Selectors receive a replay snapshot rather than reading a global clock.

**Rationale**: A logical clock keeps all signals coherent and makes sequences repeatable even when browser scheduling varies. The paused server snapshot prevents hydration differences and meets the explicit baseline behavior.

**Alternatives considered**:

- Derive state from elapsed wall-clock time: rejected because delayed callbacks would skip or drift.
- One timer per widget: rejected because panels and signals could disagree.
- Persist replay position: rejected because reload must restore the documented paused baseline.

## 8. URL investigation state

**Decision**: Define one allowlisted parser/normalizer/serializer for global scope plus per-route filters, sorting, page, and page size. The static export server-renders the documented default snapshot; a focused client boundary inside Suspense reads and applies the current query after hydration, with a first client render that matches the server default. The URL then overrides local preferences, defaults are omitted, parameters are emitted in stable order, and invalid fields fall back independently. Detail URLs carry an explicit normalized return query.

**Rationale**: Shared observability investigations must be reproducible. Static export cannot produce request-specific HTML for arbitrary query strings, so the server must emit a stable default while the client applies URL state without mismatching hydration. One codec prevents control/link disagreement and supports raw URL, reload, back/forward, and cross-signal tests. Independent field recovery preserves valid neighboring parameters.

**Alternatives considered**:

- Store investigation scope only in local storage: rejected because links would not be shareable and the server could not render the same state.
- Depend only on browser history for returning from details: rejected because copied detail URLs would lose context.
- Duplicate parsing in route and client code: rejected because normalization would eventually diverge.

## 9. Pagination

**Decision**: Use controlled `c2-table` plus slotted `c2-pagination`, defaulting to 25 rows with 25/50/100 options. Page and page size are URL state; filters that invalidate a page reset it to the first valid page.

**Rationale**: Both components already expose a pager context and page events. Controlled URL synchronization satisfies shareability and context restoration. At the specified page sizes, light-DOM rich cell slots remain bounded.

**Alternatives considered**:

- Infinite scroll: rejected because it is harder to share, restore, navigate by keyboard, and test deterministically.
- Virtualize all 1,000 records in one view: rejected because it bypasses the required pagination workflow and complicates URL state.

## 10. Local persistence and reset boundaries

**Decision**: Store independent envelopes `{ schemaVersion, updatedAt, data }` under namespaced keys for alert overlays, dashboard layouts by breakpoint, and theme. Validate on read, migrate known versions, discard invalid/unknown versions safely, and catch storage errors. Never read local storage during server render.

**Rationale**: Independent versioned records prevent one malformed value from corrupting all app state and make recovery behavior testable. A post-mount external-store adapter preserves a deterministic server snapshot.

**Alternatives considered**:

- One unversioned application blob: rejected because schema changes and partial recovery would be unsafe.
- Cookies: rejected because there is no server-side personalization requirement.
- Persist demo state or replay: rejected because both must reset on navigation or reload.

## 11. Dashboard arrangement

**Decision**: Let the application own ordered stable panel IDs and named sizes, validate them as a complete permutation of curated panels, persist them by responsive breakpoint, and drive `c2-dashboard.layout`. Provide explicit keyboard move controls and named size choices; pointer drag is optional.

**Rationale**: `c2-dashboard` supports placement and accessible track resize, but its storage covers track sizes rather than panel ordering and has no named whole-panel size model. App ownership satisfies the specification without shadow-DOM access and creates precise feedback for future library improvements.

**Alternatives considered**:

- Rely only on `c2-dashboard storage-key`: rejected because it cannot persist the required ordering model.
- Treat `c2-reorder-list` as a grid editor: rejected because its contract is a linear list.
- Implement pointer-only grid drag: rejected because the required P2 workflow must be keyboard operable.

## 12. Accessibility model

**Decision**: Provide a skip link, landmarks, meaningful route titles, visible focus, one polite/atomic status region, focused validation errors, restored trigger focus for overlays, named dashboard actions with position/size announcements, text/table alternatives for charts, non-color status cues, reduced-motion behavior, and scoped table scrolling.

**Rationale**: The app must demonstrate component composition, not merely render it. Canvas charts need adjacent semantic summaries because their marks are not inherently exposed. Dashboard visual and DOM order must agree after rearrangement.

**Alternatives considered**:

- Rely on automated axe results alone: rejected because keyboard sequence, focus restoration, announcements, and chart comprehension need behavioral tests and manual smoke review.
- Duplicate toast and live-region messages: rejected because assistive technology may announce the same outcome twice.

## 13. Testing and performance evidence

**Decision**: Use Node tests for pure logic and a per-app Playwright suite against the production static export. Gate unexpected console errors, raw server HTML, hydration, URL restoration, cross-signal journeys, replay, persistence/reset, keyboard dashboard editing, alerts, forced states, accessibility, responsive layout, and no runtime data network calls. Add deterministic cost assertions and separately document one-worker wall-clock measurements.

**Rationale**: This uses existing repository tools and distinguishes stable correctness checks from environment-sensitive performance measurements. Production-export testing is the only reliable proof that static routing and hydration work as deployed.

**Alternatives considered**:

- Test only with `next dev`: rejected because development behavior does not prove the deploy artifact.
- Add another test framework: rejected because Node and Playwright already cover the required layers.
- Make wall-clock thresholds the only CI performance gate: rejected because shared runners are noisy.

## 14. Component evaluation and feedback

**Decision**: Maintain a typed component-usage registry that powers Built with c2n panels and the final coverage audit. Publish `apps/examples/observability-nextjs/COMPONENT-EVALUATION.md` with an entry for every shipped component and stable evidence-backed finding IDs. Append concise unresolved friction to root `COMPONENT-FEEDBACK.md`; findings fixed and tested in the same change stay in the evaluation with their verification evidence.

**Rationale**: Capturing usage during implementation prevents reconstruction errors and makes the 100% coverage success criterion automatable. Separating the complete evaluation from the concise repository backlog preserves both learning and actionable maintenance.

**Alternatives considered**:

- Write an informal retrospective after completion: rejected because it would be incomplete and non-testable.
- Log only defects: rejected because successful patterns are needed to preserve good contracts and teach future consumers.
- Pre-invent findings during planning: rejected because actual integration evidence must drive the report.

## Anticipated Findings to Verify, Not Assume

Research identified areas that require implementation evidence before becoming formal feedback:

- Dashboard panel ordering and named-size ergonomics.
- Trace-waterfall composition from tree labels and public slots.
- Accessible text/data alternatives and naming for canvas charts.
- React/Next property and custom-event ergonomics without runtime wrappers.
- Server-rendered complex property handling.
- URL-controlled table/pagination synchronization.
- Lack of a dedicated removable filter-chip primitive.
- Theme ownership and first-paint reconciliation.
- Responsive side-navigation hydration.

These are investigation targets, not conclusions. Each becomes a report finding only after reproduction and evidence.
