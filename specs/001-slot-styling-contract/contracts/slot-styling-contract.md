# Contract: Public Slot Styling

## Scope

This contract applies to every public slot declared by a publishable custom element. It defines how consumers discover and style consumer-owned assigned content and component-owned slot regions without private shadow-tree access.

## Required Audit Decision

Every `(tag, slot)` pair MUST have exactly one primary decision in `scripts/data/slot-styling-audit.json`:

| Decision           | Required fields         | Meaning                                                                                                                                                                                   |
| ------------------ | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `part`             | `parts`, `reason`       | One or more semantic public parts expose a meaningful component-owned wrapper, placement region, slot boundary, fallback, control, or shared state.                                       |
| `variables`        | `variables`, `reason`   | Existing public custom properties provide complete styling control and no structural part is required.                                                                                    |
| `assigned-content` | `reason`                | The slot is a transparent projection point; consumers style assigned elements directly, while bare text uses inherited host styling, another documented hook, or an author-owned wrapper. |
| `delegated`        | `delegateTag`, `reason` | Styling belongs to the assigned/nested custom element's own public contract.                                                                                                              |

The default slot is represented by `"slot": ""`.

## Part Selection Rules

1. Prefer the nearest meaningful component-owned element that owns layout, composition, visibility, or fallback presentation.
2. Reuse an existing part when it already exposes equivalent control.
3. Use a purpose-based semantic name such as `body`, `header`, `actions`, `state`, or `supporting-text`.
4. Do not add a part only because a `<slot>` exists.
5. Put a part directly on `<slot>` only when exposing the slot/inheritance boundary itself is intentional; document that the slot normally has no box and the part does not style assigned-node internals.
6. Expose the actual fallback element when consumers need fallback-only control; expose a real wrapper when assigned and fallback content share a placement region.
7. Stable shared regions are preferred over dynamic part names for indexed/keyed slot families.
8. Existing public part names MUST NOT be renamed, repurposed, or removed.

## Documentation Contract

Every referenced part MUST have explicit authoritative source prose that states:

- the related slot or slot family;
- the exact element or semantic region exposed;
- whether it controls placement, fallback presentation, assigned-content surroundings, or a shared state;
- the conditions or states in which it exists; and
- any relevant boundary, especially that it does not pierce assigned custom-element shadow roots.

Generated generic text such as `Shadow DOM styling hook for the body element.` is insufficient for a slot-region part.

Slot documentation MUST tell consumers to style assigned elements directly when that is the selected route. Because a bare text node cannot receive a class or be targeted directly, its documentation MUST instead identify inherited host styling, another applicable public hook, or the need for an author-owned wrapper element. Framework guidance MUST identify when a scoped stylesheet cannot emit a usable `::part()` selector and where that rule must be placed instead.

## Registry Validation Contract

The documentation validator MUST fail for any of the following:

- missing, duplicate, or stale `(tag, slot)` entries;
- an unknown decision value;
- missing decision-specific fields or forbidden fields from another decision;
- a referenced part, variable, or delegate tag absent from generated manifests;
- an empty reason;
- a referenced slot-region part without explicit semantic documentation; or
- a generated component manifest that differs after the required build.

Multiple slots MAY reference one shared part, and one slot MAY reference multiple complementary parts.

## Browser Verification Contract

For every new representative pattern, a package test MUST:

1. render assigned or fallback content through the public slot;
2. apply CSS from outside the component with `host-selector::part(name)`;
3. verify a computed style or geometry change on the public region;
4. verify the assigned node remains assigned and visible;
5. verify conditional/fallback transitions still behave correctly; and
6. preserve applicable keyboard, focus, semantic, and accessibility assertions.

An assertion that an internal element merely has a `part` attribute is not sufficient.

## Conditional Region Hydration Contract

Any component that conditionally hides a component-owned slot region MUST satisfy all of the following:

1. Presence MUST distinguish server-unknown state from confirmed empty state; authored elements and non-whitespace text are meaningful content during reconciliation and later `slotchange` events.
2. Server-unknown state MUST NOT emit a permanently hidden content-backed region, and MUST NOT remain authoritative after hydration.
3. A pre-existing server-rendered assignment MUST NOT depend on a future `slotchange` event to become visible.
4. Client-created elements SHOULD resolve before their first render. Hydrated elements MUST reconcile after the initial adopted render from `updateComplete` or an equivalent safe boundary; writing reactive presence state directly inside `firstUpdated()` or `updated()` is non-conforming.
5. Wrapper visibility, conditional classes, fallback selection, and ARIA references MUST use the same reconciled presence state.
6. Later insertion, removal, and reassignment MUST continue to update the region through `slotchange` or an equivalent observable mechanism.

The initial audit scope includes every direct `hasSlottedContent` consumer and every component with reactive slot-presence state. Inclusion in the audit does not require a rewrite when SSR/hydration verification already passes.

## Reactive Update Contract

Shared component lifecycle code MUST distinguish internal cache maintenance from an observable state change:

- A cache reset needed only because the first shadow render has committed MUST NOT request a second Lit update when the current `updated()` path can consume the refreshed value.
- Runtime external changes that affect rendered DOM or engine options MUST continue to notify the host exactly once.
- Every concrete component inheriting a shared lifecycle path MUST be covered by a warning assertion or by a parameterized family test.
- Chart validation MUST prove both sides: no initial `change-in-update` warning and continued response to runtime theme changes.
- Confirmed non-chart first-update scheduling paths MUST use the same warning harness. DOM-dependent later passes MAY remain only with a documented reason and focused regression test.
- Static validation SHOULD flag new reactive writes or `requestUpdate()` calls in `firstUpdated()` and slot-presence logic that depends exclusively on `slotchange`.

## Integration Example Contract

The framework example MUST show both independent operations:

- a local/scoped class styles the consumer-owned node supplied to a slot; and
- a host `::part()` rule styles the component-owned region.

The example MUST state that styling inside an assigned custom element uses that child element's own parts or custom properties.
