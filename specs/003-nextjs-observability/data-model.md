# Data Model: Next.js Observability Showcase

All domain data is local, synthetic, deterministic, and normalized. IDs are stable lowercase strings; timestamps are UTC ISO strings derived from one baseline instant plus integer offsets. The implementation may use TypeScript types, but the behavioral constraints below are the source of truth.

## Dataset Root

### TelemetryDataset

| Field             | Type                      | Rules                                                                |
| ----------------- | ------------------------- | -------------------------------------------------------------------- |
| `schemaVersion`   | integer                   | Starts at `1`; generation and selectors reject unsupported versions. |
| `seed`            | integer                   | Fixed, non-zero generation seed.                                     |
| `baselineInstant` | UTC timestamp             | Fixed for all server renders and replay resets.                      |
| `environments`    | Environment[]             | At least production and staging; unique IDs.                         |
| `services`        | Service[]                 | At least 8.                                                          |
| `metricSeries`    | MetricSeries[]            | Covers dashboard and service indicators for every required scope.    |
| `traces`          | Trace[]                   | At least 150.                                                        |
| `spans`           | Span[]                    | Every trace has one root and a valid tree.                           |
| `logs`            | LogRecord[]               | At least 1,000.                                                      |
| `alertRules`      | AlertRule[]               | At least 8 baseline rules.                                           |
| `incidents`       | Incident[]                | At least 6.                                                          |
| `destinations`    | NotificationDestination[] | Fixed synthetic catalog only.                                        |
| `dashboard`       | Dashboard                 | One curated operational dashboard with at least 6 panels.            |

### Dataset indexes

Indexes are derived once and are not serialized:

- Service by ID and by environment.
- Trace by ID, service, operation, status, and time.
- Span children by parent ID and spans by trace ID.
- Logs by ID, service, trace ID, span ID, severity, and time.
- Metric series by metric name, environment, service, and dimensions.
- Rules by ID and incidents by ID/rule/service.

Generation fails a unit test if a foreign key is unresolved, an ID is duplicated, a trace tree is cyclic, a timestamp falls outside its parent interval, or minimum cardinalities are not met.

## Core Entities

### Environment

| Field       | Type    | Validation                              |
| ----------- | ------- | --------------------------------------- |
| `id`        | string  | Unique stable key such as `production`. |
| `name`      | string  | Non-empty display name.                 |
| `region`    | string  | Synthetic region label.                 |
| `isDefault` | boolean | Exactly one environment is default.     |

### Service

| Field                                            | Type                                        | Validation                                                           |
| ------------------------------------------------ | ------------------------------------------- | -------------------------------------------------------------------- |
| `id`                                             | string                                      | Unique, URL-safe.                                                    |
| `name`                                           | string                                      | Non-empty; long-name fixture included.                               |
| `environmentId`                                  | Environment ID                              | Must resolve.                                                        |
| `owner`                                          | string                                      | Synthetic team label.                                                |
| `health`                                         | `healthy \| warning \| critical \| unknown` | Derived consistently from indicators/incidents at a replay snapshot. |
| `throughputPerMinute`                            | number                                      | Finite and non-negative.                                             |
| `latencyP50Ms` / `latencyP95Ms` / `latencyP99Ms` | number                                      | `0 <= p50 <= p95 <= p99`.                                            |
| `errorRate`                                      | number                                      | Inclusive range 0–1.                                                 |
| `dependencies`                                   | Service ID[]                                | Unique, no self-reference, all resolve.                              |
| `operations`                                     | OperationSummary[]                          | Operation names unique within the service.                           |
| `deployments`                                    | DeploymentMarker[]                          | Ordered by timestamp.                                                |

### MetricSeries

| Field           | Type                                                               | Validation                                                          |
| --------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------- |
| `id`            | string                                                             | Unique stable key.                                                  |
| `metric`        | string                                                             | Canonical metric name.                                              |
| `unit`          | `count \| requests-per-second \| milliseconds \| percent \| bytes` | Must agree with values and formatting.                              |
| `environmentId` | Environment ID                                                     | Must resolve.                                                       |
| `serviceId`     | Service ID or null                                                 | Resolves when present.                                              |
| `dimensions`    | string map                                                         | Stable keys/values.                                                 |
| `points`        | MetricPoint[]                                                      | Strictly ascending integer offsets; finite values or explicit null. |

### Trace

| Field           | Type           | Validation                                           |
| --------------- | -------------- | ---------------------------------------------------- |
| `id`            | string         | Unique trace identifier.                             |
| `environmentId` | Environment ID | Must resolve.                                        |
| `rootServiceId` | Service ID     | Must resolve.                                        |
| `rootOperation` | string         | Non-empty.                                           |
| `startOffsetMs` | integer        | Relative to baseline.                                |
| `durationMs`    | integer        | Positive.                                            |
| `status`        | `ok \| error`  | Must agree with span errors.                         |
| `rootSpanId`    | Span ID        | Must resolve to a span in this trace with no parent. |
| `spanIds`       | Span ID[]      | Non-empty, unique, all resolve to this trace.        |
| `attributes`    | scalar map     | JSON-safe values only.                               |

### Span

| Field           | Type                | Validation                                                       |
| --------------- | ------------------- | ---------------------------------------------------------------- |
| `id`            | string              | Unique span identifier.                                          |
| `traceId`       | Trace ID            | Must resolve.                                                    |
| `parentSpanId`  | Span ID or null     | Parent belongs to same trace; exactly one null parent per trace. |
| `serviceId`     | Service ID          | Must resolve.                                                    |
| `operation`     | string              | Non-empty.                                                       |
| `startOffsetMs` | integer             | Falls within the trace interval.                                 |
| `durationMs`    | integer             | Positive and ends within trace interval.                         |
| `status`        | `ok \| error`       | Error details required when `error`.                             |
| `attributes`    | scalar map          | JSON-safe values only.                                           |
| `events`        | SpanEvent[]         | Ordered and inside span interval.                                |
| `error`         | ErrorDetail or null | Present only for failed spans.                                   |

### LogRecord

| Field               | Type                                      | Validation                                      |
| ------------------- | ----------------------------------------- | ----------------------------------------------- |
| `id`                | string                                    | Unique and URL-safe.                            |
| `timestampOffsetMs` | integer                                   | Relative to baseline.                           |
| `environmentId`     | Environment ID                            | Must resolve.                                   |
| `serviceId`         | Service ID                                | Must resolve.                                   |
| `severity`          | `debug \| info \| warn \| error \| fatal` | Canonical ordering used for filters.            |
| `message`           | string                                    | Non-empty; includes long-message fixture.       |
| `traceId`           | Trace ID or null                          | Resolves when present.                          |
| `spanId`            | Span ID or null                           | Resolves and belongs to `traceId` when present. |
| `attributes`        | scalar map                                | JSON-safe structured fields.                    |

### NotificationDestination

| Field         | Type                                    | Validation                                        |
| ------------- | --------------------------------------- | ------------------------------------------------- |
| `id`          | string                                  | Unique fixed ID.                                  |
| `label`       | string                                  | Clearly fictional, for example “Primary on-call”. |
| `type`        | `on-call \| team-chat \| email-summary` | Closed synthetic set.                             |
| `description` | string                                  | States that delivery is simulated.                |

No destination contains or accepts a real address, endpoint, token, or credential.

### AlertRule

| Field                     | Type                                                | Validation                                                                |
| ------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------- |
| `id`                      | string                                              | Stable; created IDs use a deterministic local prefix/counter.             |
| `name`                    | string                                              | Trimmed, non-empty, unique case-insensitively among effective rules.      |
| `signal`                  | `latency \| error-rate \| throughput \| saturation` | Closed set.                                                               |
| `serviceIds`              | Service ID[]                                        | At least one, all resolve.                                                |
| `operator`                | `above \| below`                                    | Must be meaningful for signal.                                            |
| `threshold`               | number                                              | Finite and inside signal-specific bounds.                                 |
| `evaluationWindowMinutes` | integer                                             | Positive allowed value.                                                   |
| `severity`                | `warning \| critical`                               | Required.                                                                 |
| `owner`                   | string                                              | Non-empty synthetic team/person label.                                    |
| `destinationIds`          | NotificationDestination ID[]                        | At least one, unique, all resolve.                                        |
| `enabled`                 | boolean                                             | Required.                                                                 |
| `origin`                  | `baseline \| local`                                 | Baseline rules remain immutable; local overlay replaces effective values. |

#### AlertRule lifecycle

`draft -> invalid` when validation fails; `draft -> previewed` after a valid historical evaluation; `previewed -> saved` after explicit save; `saved -> edited` on later local changes. Cancel returns to the previously saved effective rule. Reset demo data removes local overlays and restores baseline rules.

### Incident

| Field              | Type                                          | Validation                              |
| ------------------ | --------------------------------------------- | --------------------------------------- |
| `id`               | string                                        | Unique and URL-safe.                    |
| `ruleId`           | AlertRule ID                                  | Resolves to baseline rule.              |
| `serviceIds`       | Service ID[]                                  | Non-empty and all resolve.              |
| `severity`         | `warning \| critical`                         | Agrees with originating rule.           |
| `state`            | `active \| acknowledged \| muted \| resolved` | Derived from latest timeline event.     |
| `owner`            | string or null                                | Missing-owner fixture included.         |
| `startedOffsetMs`  | integer                                       | Before all subsequent events.           |
| `resolvedOffsetMs` | integer or null                               | Required only when resolved.            |
| `timeline`         | IncidentEvent[]                               | Chronological; begins with `triggered`. |
| `annotations`      | IncidentAnnotation[]                          | Chronological, synthetic authors.       |

#### Incident transitions

- `triggered -> acknowledged -> resolved`
- `triggered|acknowledged -> muted -> active|resolved`
- Resolved is terminal in demonstration data.
- Invalid backwards transitions fail generation tests.

### Dashboard

| Field      | Type                | Validation                                    |
| ---------- | ------------------- | --------------------------------------------- |
| `id`       | string              | Stable; one default dashboard.                |
| `name`     | string              | Non-empty.                                    |
| `panelIds` | DashboardPanel ID[] | At least 6, unique, documented default order. |

### DashboardPanel

| Field            | Type                                                          | Validation                                      |
| ---------------- | ------------------------------------------------------------- | ----------------------------------------------- |
| `id`             | string                                                        | Unique stable key used by layout persistence.   |
| `title`          | string                                                        | Non-empty.                                      |
| `kind`           | `stat \| line \| area \| bar \| distribution \| ranked-table` | Curated set.                                    |
| `metric`         | string                                                        | Resolves to available selector/series.          |
| `unit`           | Metric unit                                                   | Agrees with source series.                      |
| `defaultSize`    | `small \| medium \| large`                                    | Named accessible size.                          |
| `supportedSizes` | size[]                                                        | Contains default size.                          |
| `description`    | string                                                        | Provides chart/table accessible summary intent. |

## Runtime State

### ReplayClockSnapshot

| Field             | Type                 | Rules                                       |
| ----------------- | -------------------- | ------------------------------------------- |
| `baselineInstant` | UTC timestamp        | Matches dataset.                            |
| `tick`            | non-negative integer | Starts at zero.                             |
| `status`          | `paused \| playing`  | Paused during SSR and after reload/refresh. |
| `stepMs`          | positive integer     | Constant for one dataset version.           |

Commands: `play`, `pause`, `refresh`. Only one timer may exist. Refresh cancels it before resetting.

### InvestigationState

| Field           | Type                                     | Rules                                         |
| --------------- | ---------------------------------------- | --------------------------------------------- |
| `environmentId` | Environment ID                           | Default environment when absent/invalid.      |
| `range`         | approved relative range or absolute pair | Absolute `from < to`; both required together. |
| `filters`       | route-specific scalar/list map           | Allowlisted and independently validated.      |
| `sortField`     | route allowlist                          | Default per route.                            |
| `sortDirection` | `asc \| desc`                            | Default per route.                            |
| `page`          | positive integer                         | Defaults to 1 and clamps after filtering.     |
| `pageSize`      | `25 \| 50 \| 100`                        | Defaults to 25.                               |

### DemoState

`normal | loading | empty | error`. It is page-scoped, client-memory only, never serialized, and returns to `normal` on navigation or reload.

### AlertMutationStore

| Field           | Type                | Rules                                              |
| --------------- | ------------------- | -------------------------------------------------- |
| `schemaVersion` | `1`                 | Unknown versions discarded safely.                 |
| `updatedAt`     | UTC timestamp       | Informational; not used for generation.            |
| `rulesById`     | record of AlertRule | Every entry validates against the current catalog. |

Effective rules are `baseline rules` overlaid by `rulesById`. Reset demo data clears this record only after confirmation.

### DashboardLayoutPreference

| Field             | Type                             | Rules                                        |
| ----------------- | -------------------------------- | -------------------------------------------- |
| `schemaVersion`   | `1`                              | Unknown versions discarded safely.           |
| `breakpoint`      | `desktop \| tablet`              | Stored independently.                        |
| `orderedPanelIds` | DashboardPanel ID[]              | Exact permutation of current curated panels. |
| `sizes`           | record of panel ID to named size | Every key resolves; size supported by panel. |
| `updatedAt`       | UTC timestamp                    | Informational.                               |

Move commands preserve a complete permutation. Boundary moves are disabled/ignored and announced. Reset layout removes only dashboard keys.

### ThemePreference

| Field           | Type                      | Rules                              |
| --------------- | ------------------------- | ---------------------------------- |
| `schemaVersion` | `1`                       | Unknown versions discarded safely. |
| `theme`         | `light \| dark \| system` | Defaults to system.                |

### ComponentUsageRecord

| Field         | Type                  | Rules                                           |
| ------------- | --------------------- | ----------------------------------------------- |
| `tag`         | c2 custom-element tag | Unique registry key.                            |
| `packageName` | published package     | Must match the registration import.             |
| `regions`     | page/region IDs[]     | At least one.                                   |
| `purpose`     | string                | Explains user value, not just visual placement. |
| `docsPath`    | string                | Working documentation link.                     |
| `sourcePaths` | string[]              | Representative implementation links.            |

The registry powers Built with c2n panels and the final evaluation coverage audit.

### ComponentEvaluationFinding

| Field                 | Type                                | Rules                                                                                                                                                     |
| --------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                  | `C2N-NEXT-NNN`                      | Stable and unique.                                                                                                                                        |
| `kind`                | `successful-pattern \| improvement` | Both kinds required across the final report.                                                                                                              |
| `category`            | enum                                | Next.js integration, SSR/hydration, API/types, events/bindings, styling, composition, accessibility, documentation, performance, or developer experience. |
| `priority`            | `blocker \| high \| medium \| low`  | Explicit for every improvement.                                                                                                                           |
| `packages` / `tags`   | string[]                            | At least one affected component.                                                                                                                          |
| `version`             | string                              | Exact evaluated package version.                                                                                                                          |
| `workflow`            | string                              | Route and user journey.                                                                                                                                   |
| `expected` / `actual` | string                              | Concrete observable behavior.                                                                                                                             |
| `reproduction`        | string[]                            | Minimal ordered steps.                                                                                                                                    |
| `evidence`            | path/link[]                         | Test, log, screenshot, or source evidence when applicable.                                                                                                |
| `workaround`          | string or `None`                    | Explicit.                                                                                                                                                 |
| `recommendation`      | string                              | Smallest actionable library change.                                                                                                                       |
| `feedbackLink`        | link or `fixed-in-change`           | Required for improvements.                                                                                                                                |

## Relationship Summary

```text
Environment 1 ── * Service
Service * ── * Service (dependencies)
Service 1 ── * MetricSeries
Trace 1 ── * Span
Trace 0..1 ── * LogRecord
Span 0..1 ── * LogRecord
AlertRule * ── * Service
AlertRule 1 ── * Incident
AlertRule * ── * NotificationDestination
Dashboard 1 ── 6..* DashboardPanel
DashboardPanel 1 ── 1 Metric selector/series
ComponentUsageRecord 1 ── * ComponentEvaluationFinding
```
