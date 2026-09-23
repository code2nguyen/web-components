# Contract: Routes and Investigation State

## Purpose

Define the user-visible URL contract for static routing, shareable investigations, list/detail context, and safe recovery from malformed parameters.

## Route surface

| Route                      | Purpose                           | Detail strategy                                                                                          |
| -------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `/`                        | Operational overview              | Primary page                                                                                             |
| `/services/`               | Service inventory                 | Primary page                                                                                             |
| `/services/[serviceId]/`   | Service health detail             | Static parameters for every known service                                                                |
| `/traces/`                 | Trace search                      | Primary page                                                                                             |
| `/traces/[traceId]/`       | Trace waterfall/detail            | Static parameters for every known trace                                                                  |
| `/logs/`                   | Log search and selected-log sheet | `log=<id>` identifies optional selected record                                                           |
| `/dashboards/`             | Curated operational dashboard     | Primary page                                                                                             |
| `/alerts/`                 | Rules and incidents               | `view=rules                                                                                              | incidents` selects tab |
| `/alerts/rules/new/`       | New alert rule                    | Static page                                                                                              |
| `/alerts/rules/[ruleId]/`  | Edit alert rule                   | Static parameters for baseline rules; local-only rule editing may use the alerts route with a rule query |
| `/incidents/[incidentId]/` | Incident lifecycle detail         | Static parameters for every known incident                                                               |

Unknown path identifiers render a helpful not-found state with a route back to the relevant collection. Unknown query-selected IDs render a recoverable inline state without discarding valid filters.

## Canonical parameters

### Global scope

| Parameter     | Form                                                       | Default                                       |
| ------------- | ---------------------------------------------------------- | --------------------------------------------- |
| `env`         | Environment ID                                             | Dataset default                               |
| `range`       | Approved relative range such as `30m`, `2h`, `24h`         | `2h`                                          |
| `from` / `to` | UTC ISO or epoch representation selected by implementation | Absent; valid only as a pair with `from < to` |

An absolute pair replaces `range`. Partial/invalid absolute input falls back to the relative default without invalidating other parameters.

### Collection state

| Parameter     | Form                               | Rules                                                                   |
| ------------- | ---------------------------------- | ----------------------------------------------------------------------- |
| `q`           | Trimmed search text                | Omit when empty.                                                        |
| Route filters | Repeatable or delimited stable IDs | Each route owns an allowlist; invalid values are removed independently. |
| `sort`        | Route-specific field               | Falls back to route default.                                            |
| `dir`         | `asc` or `desc`                    | Falls back to route default.                                            |
| `page`        | Positive integer                   | Defaults to `1`; clamps to first valid page after filtering.            |
| `pageSize`    | `25`, `50`, or `100`               | Defaults to `25`.                                                       |

Defaults are omitted from generated links. Serialization uses stable key order so equivalent state produces identical URLs.

## Ownership and precedence

1. A valid URL value wins over every local preference.
2. A missing URL value uses the documented route default, not stale list state from another route.
3. Purely visual preferences such as theme and dashboard layout remain outside investigation URLs.
4. Demo state is never encoded.
5. Replay tick/status is never encoded; every reload starts paused at baseline.
6. Because deployment is a static export, the server-rendered document uses the documented default investigation snapshot. A focused client boundary inside Suspense reads the current query after hydration; its first client render must match the server default before applying normalized URL state.

## Navigation operations

- Filter change: preserve scope and sorting; reset `page` to `1`.
- Sort change: preserve scope and filters; reset `page` to `1`.
- Page/page-size change: preserve scope, filters, and sorting. Page-size change keeps the first previously visible item in range where possible.
- Open detail: retain the normalized collection query in the detail URL or a validated `return` representation.
- Return to list: use an explicit generated link that restores collection state; browser Back must produce the same result but is not the only mechanism.
- Trace to logs: preserve environment and time, set the trace identity filter, and clear incompatible trace-only parameters.
- Log to trace: preserve environment and time, navigate only when the trace identity resolves.
- Global scope change: propagate scope to the destination URL and reset invalid route-specific paging.

## Parsing requirements

- One pure codec is shared by client controls, link generation, selectors, and tests; static route rendering uses its documented default snapshot rather than request-specific query data.
- Parse and validate each parameter independently.
- Never throw for user-authored query strings.
- Ignore unknown parameters during normalization unless explicitly reserved.
- Decode bounded input; excessively long text/list parameters fall back or truncate to documented safe limits.
- Produce a fully normalized `InvestigationState` before rendering any selector results.

## Acceptance examples

- `/traces/?env=production&range=2h&status=error&page=2&pageSize=50` reloads with the same valid scope, filter, and page.
- Adding `pageSize=37` changes only the page size to 25; other valid parameters remain.
- Changing a filter while on page 6 produces page 1 and announces the new result count.
- A trace detail return link restores the exact trace list query even when opened in a new tab.
- `/logs/?trace=unknown&q=timeout` shows no correlated trace result while retaining the text query and recovery controls.
