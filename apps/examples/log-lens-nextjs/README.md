# Log Lens

An OpenTelemetry log analyzer built with Next.js (App Router, static export) and nothing but c2n web components for its UI.

Most log viewers are a faster `grep`: a search box over an endless list. Log Lens starts from the other end. It reads the whole file first and answers the questions you would otherwise scroll for: what kinds of messages are in here, what changed and when, which requests failed, and what those failures have in common. The raw lines are still one tab away, filtered to whatever you were just looking at.

Everything runs in the browser tab. The file is never uploaded.

## Five ways to read one file

| View            | Question it answers                 | How                                                                                                                                                                                                                                                                                                                                                                                 |
| --------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Story**       | What happened, in order?            | The timeline is split into buckets. Error surges are buckets far above the file's own median (median + 4 MAD). Each chapter names the dominant error, the new message logged just before (the likely trigger), when the rate returned to normal, services that went silent (with their last words and comeback line), and messages that appear for the first time late in the file. |
| **Patterns**    | What is this file made of?          | Drain-style template mining: ids, numbers, durations, versions, IPs and quoted values become wildcards, and near-identical templates merge. Each pattern keeps its wildcard values, so the detail sheet shows what varies inside a message (latency min/avg/max, the three `reason=` values, …). Sort by rarest or newest to find the one-off lines that explain the rest.          |
| **Journeys**    | Where do failing requests go wrong? | Records are stitched into requests by `traceId`. Failed requests are compared only with successful requests of the same kind (same first pattern), which yields the shared path, the step where the failures fork off, and the steps healthy requests reach that failing ones never do.                                                                                             |
| **Differences** | What do the errors have in common?  | For each `key=value` on the records (resource and log attributes), coverage inside the chosen set vs. outside it. The set can be error records, warnings and errors, failed requests (attributes aggregated per request), or the current lens. Identifier-like keys are ignored.                                                                                                    |
| **Raw logs**    | Show me the lines.                  | `c2-log-viewer` with virtual scrolling over the lens, plus find, highlight or filter.                                                                                                                                                                                                                                                                                               |

**The lens** ties the views together. Clicking a chapter, a chart range, a pattern, a request, a service or an attribute narrows every view to those records. The chips in the lens bar show what is applied, and each one removes itself.

The built-in sample (`lib/sample.ts`, deterministic) is 15 minutes of a shop's checkout with a hidden incident. One payment pod reloads its config with a shorter gateway timeout; requests routed to it time out, retry and fail, and a circuit breaker opens. A fixed config then brings things back. Later, inventory restarts and goes quiet while checkout falls back to optimistic stock. Log Lens finds all of it: the story names the config reload as the trigger, and the Differences view points at `k8s.pod.name = payment-5f7c9-x2k`.

## Input

- One OTLP JSON document: `{ "resourceLogs": [...] }`, e.g. an OTLP/HTTP request body.
- JSON Lines with one such document per line. This is what the collector's `file` exporter writes by default.
- A JSON array of documents.

camelCase and snake_case field names, every `AnyValue` type, hex or base64 ids, and numeric or named severities are accepted. Malformed JSON lines are skipped and reported.

## c2n usage

| Region            | Components                                                                                                        |
| ----------------- | ----------------------------------------------------------------------------------------------------------------- |
| Shell             | `c2-header`, `c2-theme-select`, `c2-icon-button`, `c2-button`, `c2-toast-region`, Feather icons                   |
| Landing           | `c2-upload` (as a local file picker), `c2-card`, `c2-details`, `c2-code-viewer`, `c2-progress`, `c2-status-panel` |
| Summary and views | `c2-stat`, `c2-tabs`, `c2-button-group` (segmented), `c2-badge`                                                   |
| Story             | `c2-area-chart` (point-click and zoom set the lens), `c2-tree` (services → instances), `c2-card`                  |
| Patterns          | `c2-table` with `cell-slot` cells (`c2-badge`, `c2-sparkline`), `c2-sheet`, `c2-bar-chart`, `c2-progress`         |
| Journeys          | `c2-steps` (common path, failing branch, healthy branch, request timeline), `c2-table` with `renderCell`          |
| Raw logs          | `c2-log-viewer`, `c2-select` (multiple), `c2-text-field`, `c2-switch`                                             |

Integration follows the repo's Next.js conventions (see `observability-nextjs`):

- `components/c2n/C2Registry.tsx` registers every element once.
- `types/c2-elements.d.ts` pulls in the generated `@c2n/*/react` JSX declarations.
- Object properties (`rows`, `data`, `items`, `steps`, `open`) are assigned through `useElementProperties` once the element is defined.
- Kebab-case and non-bubbling events go through `useCustomEvent`.

The palette lives in `app/globals.css` as `--ll-*` tokens, bridged onto `--c2-theme--*`. Components are styled only through documented `--c2-*` variables; `npm run check:css-contracts -- apps/examples/log-lens-nextjs` validates them.

## Commands

```bash
npm run dev -w apps/examples/log-lens-nextjs
npm run build -w apps/examples/log-lens-nextjs      # static export into out/
npm run test:unit -w apps/examples/log-lens-nextjs  # parser, pattern mining, story, divergence, differences
npm run preview -w apps/examples/log-lens-nextjs    # serve out/ at /web-components/demo/log-lens-nextjs/
```
