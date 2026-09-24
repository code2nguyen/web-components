# Quickstart Validation: Next.js Observability Showcase

This guide validates the completed feature end to end. It assumes implementation tasks have created the planned workspace scripts and application files.

## Prerequisites

- Node.js 24, matching repository CI.
- npm with the repository lockfile.
- Chromium installed for routine Playwright validation; Firefox and WebKit for the portability pass.
- No account, secret, database, or external telemetry service.

Design references:

- [Data model](./data-model.md)
- [URL/navigation contract](./contracts/navigation-state.md)
- [Replay and persistence contract](./contracts/replay-and-persistence.md)
- [c2n Next.js integration contract](./contracts/c2n-integration.md)
- [Component evaluation contract](./contracts/component-evaluation.md)

## 1. Install and build

From the repository root:

```bash
npm install
npm run build -w apps/examples/observability-nextjs
```

Expected:

- The required c2n packages and theme build before the app.
- Next.js completes a production static export under `apps/examples/observability-nextjs/out/`.
- Every known dynamic service, trace, incident, and baseline alert route is generated.
- The build reports no hydration, unsupported static-export feature, duplicate-registration, or invalid binding warning.
- No credentials or environment variables are requested.

Then validate full repository integration:

```bash
npm run examples:build
npm run ui:build
```

Expected:

- The example is copied into the docs demo directory using its declared `out` output.
- The documentation examples index identifies it as Next.js and links to its running preview, source, README, and component evaluation.

## 2. Static and type checks

```bash
npm run type-check -w apps/examples/observability-nextjs
npm run test:unit -w apps/examples/observability-nextjs
npm run lint:check
npm run format:check
```

Expected unit coverage:

- Fixed-seed generation is repeatable and meets all minimum record counts.
- Every foreign key, correlation identity, trace tree, incident transition, and timestamp invariant is valid.
- URL codecs round-trip canonical state and preserve valid neighbors around malformed parameters.
- Pagination, filtering, sorting, replay, alert validation, storage migration/recovery, and dashboard permutation rules pass.
- Component-usage registry entries are unique and complete.

## 3. Run the production artifact

```bash
npm run preview -w apps/examples/observability-nextjs
```

Open the local URL printed by the command. The preview serves the static export under the same base-path shape used by the documentation deployment.

Before enabling JavaScript behavior, inspect the initial response or use the automated raw-HTML assertion.

Expected:

- The response contains the page title, paused replay state, meaningful overview headings, KPI labels/values, and synthetic-data disclosure.
- The initial UI is not an empty client shell.
- Reloading every primary and generated detail URL returns content rather than a hosting 404.

## 4. Automated browser validation

```bash
npm run test:e2e -w apps/examples/observability-nextjs
```

Expected browser coverage:

- No unexpected console error, hydration mismatch, duplicate registration, or invalid custom-element binding.
- No runtime application-data request leaves localhost/static asset paths.
- Primary routes and unknown identifiers show their documented outcomes.
- A copied investigation URL restores environment, range, filters, sorting, page, and page size.
- Trace and log detail navigation restores the prior list context.
- Normal, Loading, Empty, and Error demo states are enterable and reset on navigation/reload.
- Repeating Play/Pause/Refresh from baseline produces the same signal sequence.
- Alert create/edit validation, synthetic destinations, save, reload, and Reset demo data behave as specified.
- Dashboard keyboard move/resize, announcements, persistence, boundary behavior, and Reset layout pass.
- 1280px and 768px layouts have no page-level horizontal overflow.
- Light/dark themes and reduced motion preserve every primary outcome.

Run the portability pass before completion:

```bash
npm run test:e2e:all -w apps/examples/observability-nextjs
```

Expected: focused hydration, navigation, component interaction, and route-reload smoke tests pass in Chromium, Firefox, and WebKit.

## 5. Manual workflow acceptance

### Service investigation

1. Start at Overview with replay paused.
2. Select the documented degraded production service.
3. Inspect latency, traffic, error rate, dependencies, operations, deployments, recent traces, logs, and alerts.
4. Open the slow or failed trace.
5. Open correlated logs.

Expected: the journey completes in under 3 minutes, retains environment/time scope, highlights the relevant span, and never presents contradictory IDs or timestamps.

### Trace and log search

1. Apply service, status/severity, duration, and text filters.
2. Change sorting, navigate to a later page, and select 50 or 100 rows.
3. Open a record and use its explicit return action.
4. Copy the URL into a fresh tab.

Expected: result counts and removable criteria agree; both return and fresh-tab load restore normalized scope, filters, sorting, page, and size.

### Dashboard

1. Inspect at least six complementary panels and their text/data alternatives.
2. Use only the keyboard to move and resize at least three panels.
3. Reload, then use Reset layout.
4. Repeat at 768px.

Expected: every change announces the panel name and resulting position or named size; DOM and visual reading order agree; reload restores the layout; reset restores the documented default.

### Alert rules and incidents

1. Open an incident and read its complete lifecycle.
2. Create a rule, intentionally omit required fields, and attempt to save.
3. Correct every error, preview historical behavior, choose synthetic destinations, and save.
4. Reload and confirm persistence, then Reset demo data.

Expected: focus moves to the first invalid field without losing valid input; the preview is understandable; all delivery results are marked simulated; reload preserves and reset removes local changes.

### Developer evaluation

1. Open Built with c2n on each primary page.
2. Confirm the listed components match the major visible regions.
3. Follow documentation and representative source links.

Expected: each link is reachable in no more than two actions and the distinct inventory matches the implementation registry.

## 6. Accessibility review

```bash
npm run test:a11y -w apps/examples/observability-nextjs
```

Expected:

- Representative WCAG A/AA axe scans pass for every primary route and demo state.
- Real keyboard journeys complete all P1/P2 flows.
- Focus remains visible, overlays restore focus, and validation/status announcements are not duplicated.
- Charts expose meaningful names and adjacent summaries or data alternatives.
- Reduced-motion emulation removes decorative movement without removing functionality.

Manual release smoke:

- VoiceOver with Safari.
- NVDA with Firefox or Chrome.
- 200% zoom at desktop and tablet widths.
- Confirm route titles, navigation landmarks, dashboard announcements, alert validation, chart summaries, and status changes are understandable.

Record manual results separately from automation evidence.

## 7. Performance validation

Run the app's one-worker performance scenario in the documented environment.

Expected:

- Initial meaningful content appears within 2 seconds.
- Local filter/navigation feedback appears within 200 milliseconds.
- Tables render only the selected 25/50/100-row page rather than all 1,000 logs.
- Each replay tick causes one coherent selector/chart update and does not remount chart engines or rebuild unrelated UI.

Record machine/browser versions, repetitions, median/worst measurement, and deterministic cost assertions. Do not treat one noisy CI wall-clock sample as the only proof.

## 8. Component evaluation gate

Open `apps/examples/observability-nextjs/COMPONENT-EVALUATION.md` and verify it against [the evaluation contract](./contracts/component-evaluation.md).

Expected:

- 100% of actually used c2 tags appear in the inventory.
- Positive patterns and improvement opportunities are both recorded.
- Every improvement contains category, priority, exact version, workflow, expected/actual behavior, reproduction, evidence, workaround, recommendation, and disposition.
- Every unresolved finding cross-links a concise entry in root `COMPONENT-FEEDBACK.md`.
- Findings fixed in the same change link their regression tests instead of creating stale open feedback.

The feature is not complete when this audit fails, even if the application itself builds.
