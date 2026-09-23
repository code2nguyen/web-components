# Contract: Replay, Persistence, and Reset

## Deterministic replay

The application exposes one shared replay clock:

```text
snapshot = {
  baselineInstant,
  tick: non-negative integer,
  status: paused | playing,
  stepMs: positive integer
}
```

- Server rendering, first hydration, navigation reload, and Refresh use `tick=0`, `status=paused`.
- Play creates at most one timer and increments exactly one logical tick per callback.
- Pause cancels the timer and preserves the current tick.
- Refresh cancels the timer, resets tick to zero, and leaves the clock paused.
- Every selector receives the same immutable snapshot for one render/update.
- Repeating the same commands from baseline yields identical services, metrics, traces, logs, alerts, and incidents.
- Replay state is never persisted and never inferred from wall-clock time.

## Demo state

`normal | loading | empty | error` is page-scoped client memory:

- It changes presentation/selectors only; it never mutates baseline data, URL state, replay state, or storage.
- It resets to `normal` on navigation and reload.
- Error is recoverable and retains the active investigation scope.
- The control is visibly labeled as a synthetic evaluator aid.

## Storage namespace

| Key                                      | Contents                  | Reset owner        |
| ---------------------------------------- | ------------------------- | ------------------ |
| `c2n-observability:v1:alerts`            | Alert mutation envelope   | Reset demo data    |
| `c2n-observability:v1:dashboard:desktop` | Desktop panel order/sizes | Reset layout       |
| `c2n-observability:v1:dashboard:tablet`  | Tablet panel order/sizes  | Reset layout       |
| `c2n-observability:v1:theme`             | Theme preference          | Theme control only |

Every value is an envelope:

```text
{
  schemaVersion: 1,
  updatedAt: UTC timestamp,
  data: validated payload
}
```

## Read/write rules

- Browser storage is accessed only after mount or through an external-store adapter with a deterministic server snapshot.
- Read operations catch unavailable-storage, security, quota, and JSON errors.
- Unknown versions and invalid payloads are removed or ignored and replaced with the documented default.
- Each key validates independently; one corrupt value cannot reset other areas.
- Writes are replace-style and occur only after a valid user action.
- No storage record contains real contact details, endpoints, credentials, telemetry from external users, or other sensitive information.

## Alert overlay

- Baseline rules are immutable.
- Local creation/editing writes validated complete rules keyed by stable ID.
- Effective rules are the baseline overlaid by local records.
- Save failure leaves the draft intact and presents recovery feedback.
- Reset demo data requires confirmation and clears alert/demo mutation keys only. Theme and dashboard layout remain unchanged.

## Dashboard layout

- Persist an exact permutation of the curated panel IDs plus one allowed named size per panel.
- Store desktop and tablet layouts independently.
- Invalid/missing panel IDs, duplicates, unsupported sizes, or impossible placement discard that breakpoint record and restore its default.
- Successful keyboard or pointer changes write one new complete layout and announce the panel's new position or size.
- Reset layout clears dashboard keys only and restores the documented default in one action.
- Track-size persistence internal to `c2-dashboard` is not the authoritative app layout record.

## Theme

- Accepted values are `light`, `dark`, and `system`.
- Initial document theming must avoid a server/client attribute mismatch or visible incorrect-theme flash.
- Theme reset is independent of application demo-data and dashboard resets.

## Failure matrix

| Failure                   | Required result                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------- |
| Storage unavailable       | Application remains fully usable for the current session; persistence limitation is non-blocking. |
| Quota exceeded            | Keep current in-memory state, report save failure, do not clear unrelated keys.                   |
| Malformed JSON            | Ignore/remove only that key and use its default.                                                  |
| Unknown schema version    | Do not guess; use default and retain no invalid state.                                            |
| Stale dashboard panel IDs | Restore valid default for the affected breakpoint.                                                |
| Invalid alert destination | Reject the stored rule overlay and retain valid neighboring rules.                                |
| Timer survives navigation | Treat as a defect; providers must clean it up.                                                    |
