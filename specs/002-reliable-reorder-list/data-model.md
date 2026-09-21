# Data Model: Reliable Reorder List

This component has no durable storage. Its data model describes consumer-owned items, component-owned visual order, transient interaction state, geometry, announcements, and public event records.

## Item Reference

- **element**: Authoritative ordinary direct-child `HTMLElement` owned by the consumer.
- **key**: Optional non-empty stable string from `data-reorder-key`.
- **label**: Reorder announcement label from `data-reorder-label`, then an accessible/visible-text fallback.
- **fixed**: Boolean interpreted from `data-fixed`; absent, `"false"`, and `"0"` are false, while empty presence or another value is true.
- **assignmentId**: Component-owned stable private projection identifier for the lifetime of the element.

Validation:

- Each ordinary direct child appears exactly once.
- Placeholder and drag-preview children are feedback content, not Item References.
- Element references are unique by identity.
- Missing keys are valid. Non-empty keys must be unique within the list before a reorder may start.
- Numeric assignment metadata is never consumer identity and is not required in authored markup.

## Authored Order

- **items**: Ordinary direct children in consumer-owned DOM order.
- **revision**: Internal monotonic change counter used only to recognize reconciliation boundaries.

Rules:

- Initial visual order equals Authored Order.
- Any direct-child insertion, removal, or authored reorder while idle makes the new Authored Order authoritative.
- A mutation during a reorder cancels the session before the new Authored Order is adopted.
- Reconciliation emits no user success event.

## Visual Order

- **items**: Ordered Item References currently presented to the user.
- **focusedItem**: Optional element whose placement wrapper owns the roving tab stop.

Rules:

- Visual Order contains the same ordinary children as Authored Order, exactly once.
- A successful reorder commits the candidate order immediately without physically reordering consumer-owned direct children.
- A later external mutation replaces Visual Order through reconciliation.
- Fixed elements retain their absolute indexes. Movable elements occupy the remaining indexes in their current relative order.
- Visible order, listitem position metadata, sequential composed focus order, and canonical event order must agree.

## Reorder Session

- **phase**: `armed-pointer`, `dragging-pointer`, or `reordering-keyboard`.
- **inputMethod**: `mouse`, `touch`, `pen`, or `keyboard`.
- **item**: Active Item Reference.
- **originalOrder**: Immutable Visual Order snapshot used for cancellation and event indexes.
- **fromIndex**: Zero-based absolute index of the active item in originalOrder.
- **candidateOrder**: Current proposed order.
- **candidateIndex**: Zero-based absolute index of the active item in candidateOrder.
- **pointerId**: Present for pointer phases only.
- **originPoint**: Initial viewport coordinate for the threshold.
- **pickupOffset**: Pointer offset inside the active item used to align the preview.
- **captureElement**: Element that owns pointer capture after pickup.

State transitions:

1. `idle -> armed-pointer`: eligible primary pointerdown on a movable item outside interactive descendants.
2. `armed-pointer -> dragging-pointer`: movement crosses the pickup threshold and keys are valid.
3. `idle -> reordering-keyboard`: Space on the roving movable wrapper and keys are valid.
4. `dragging-pointer | reordering-keyboard -> same phase`: valid destination movement updates candidateOrder/candidateIndex.
5. `dragging-pointer -> committed`: pointerup inside the valid list with candidateIndex different from fromIndex.
6. `reordering-keyboard -> committed`: Space with candidateIndex different from fromIndex.
7. Any active phase becomes `canceled` on Escape, invalid/outside release, pointercancel, unexpected lost capture, child mutation, editability loss, active-item removal, disconnect, or invalid visibility.
8. `committed | canceled -> idle`: one idempotent cleanup clears every transient resource.

No-op commit requests return to idle without success events.

## Destination Model

- **absoluteIndex**: Candidate zero-based index including fixed items.
- **movableOrdinal**: Position within the movable-only subsequence.
- **valid**: False when the destination would displace a fixed item or leave the active item unchanged.
- **placeholderRect**: Current viewport rectangle shown for the destination.

Transformation:

1. Remove the active item from the movable subsequence.
2. Insert it at the requested movable ordinal.
3. Refill non-fixed absolute positions from the new movable subsequence.
4. Preserve every fixed element at its original absolute index.

## Geometry Snapshot

- **listRect**: Current viewport rectangle for the component's list region.
- **itemRects**: Current viewport rectangles keyed by element identity.
- **scrollContainerRect**: Optional viewport rectangle for the eligible scroll container.
- **pointerPoint**: Current `clientX`/`clientY` viewport coordinate.

Rules:

- All values share viewport coordinates.
- Snapshot refreshes after relevant scroll, destination render, and observed size/layout change.
- Empty lists, disconnected elements, and zero-sized invalid targets produce no destination rather than throwing.

## Auto-Scroll State

- **container**: Nearest eligible vertical scroll ancestor or absent.
- **direction**: `up`, `down`, or `none`.
- **frameId**: At most one pending animation-frame identifier.
- **enabled**: Inverse of `autoScrollDisabled` for the active session.

Rules:

- Scrolling begins only when an active pointer approaches an obscured valid destination near an eligible edge.
- Each frame applies a bounded step, refreshes geometry, and re-evaluates direction.
- Commit, cancel, disabled state, absent container, or boundary arrival cancels frameId.

## Announcement State

- **instructionsId**: Stable id referenced by reorderable wrappers.
- **message**: Current polite, atomic status text.
- **activeItemLabel**: Human-readable label; never defaults to the persistence key.

Message transitions:

- Pickup: item, absolute position, list size, and active keys.
- Move: item and new absolute position.
- Boundary: first/last permitted movable position.
- Commit: item and from/to positions.
- Cancel: restored item position.
- Invalid keys: duplicate-key configuration prevents reordering.

## Reorder Event Record

- **item**: `{ element, key? }` for the moved item.
- **fromIndex**: Zero-based absolute original position.
- **toIndex**: Zero-based absolute committed position.
- **order**: Immutable ordered collection of `{ element, key? }` records for all ordinary items.
- **inputMethod**: `mouse`, `touch`, `pen`, or `keyboard`.

Validation:

- Emitted exactly once as canonical `reorder` after a real user-initiated change.
- order equals committed Visual Order.
- fromIndex and toIndex include fixed items.
- Never emitted for initialization, reconciliation, cancel, no-op, threshold-only input, or error.

## Legacy Change Record

- **detail**: `number[]` indexed by Authored Order; each value is that child's resulting zero-based visual position.
- **deprecated**: True; removed at the next explicitly breaking release.

Rules:

- Emitted once alongside a canonical successful reorder during the compatibility window.
- Preserves the existing payload and event flags.
- Never emitted independently.

## Reorder Error Record

- **reason**: `duplicate-key`.
- **key**: Duplicate non-empty key.
- **elements**: All direct-child elements that supplied that key.

Rules:

- Emitted once for the attempted pointer or keyboard operation before pickup.
- The reorder does not start; order and focus remain stable.
- No canonical or legacy success event follows.
