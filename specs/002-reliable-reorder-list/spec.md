# Feature Specification: Reliable Reorder List

**Feature Branch**: `Not created (specification only)`

**Created**: 2026-09-21

**Status**: Implemented

**Input**: User description: "The reorder list still does not work; create a specification for this component."

## Clarifications

### Session 2026-09-21

- Q: After a successful reorder, who should own and apply the committed order? → A: The component commits its visual order and emits the result; the application persists or reconciles its data afterward.
- Q: How should reordered items be identified in the change notification? → A: Include direct child element references and optional stable string keys when supplied.

## User Scenarios & Testing

### User Story 1 - Reorder Items Reliably With a Pointer (Priority: P1)

A user can drag an editable item to a new position in a vertical list with a mouse, touch contact, or pen. The list gives continuous, stable feedback during the gesture and commits exactly the order shown at the drop position.

**Why this priority**: Pointer reordering is the component's primary purpose. If pickup, movement, dropping, or the resulting order is unreliable, the component provides no usable value.

**Independent Test**: Render three distinct items, move the first item to the end with each supported pointer type, and verify the preview, placeholder, final visual order, item identity, and single change notification.

**Acceptance Scenarios**:

1. **Given** an editable list containing three movable items, **When** the user drags the first item beyond the pickup threshold and drops it after the third item, **Then** the placeholder tracks the intended destination and the committed order is second, third, first.
2. **Given** an editable list, **When** the user presses and releases an item without crossing the pickup threshold, **Then** no drag starts, the order does not change, and no reorder notification is emitted.
3. **Given** a non-editable list, **When** the user attempts to drag any item, **Then** the list remains unchanged and ordinary interaction with content inside the item still works.
4. **Given** an item containing an interactive descendant, **When** the user activates that descendant without initiating a drag, **Then** the descendant receives its normal interaction and the list does not reorder.
5. **Given** a drag that returns to its original position, **When** the user drops the item, **Then** the order remains unchanged and no reorder notification is emitted.

---

### User Story 2 - Reorder Without a Pointer (Priority: P1)

A keyboard user can discover, initiate, move, commit, and cancel reordering while focus remains predictable and the current position is announced.

**Why this priority**: Reordering is a core action, not an optional enhancement. A pointer-only component excludes keyboard and assistive-technology users from its primary task.

**Independent Test**: Focus a movable item, enter reorder mode, move it down twice, commit the move, then repeat and cancel; verify the final order, focus target, announcements, and notifications without using a pointer.

**Acceptance Scenarios**:

1. **Given** focus on a movable item in an editable list, **When** the user starts keyboard reordering, moves the item down, and commits, **Then** the item moves one valid position, focus remains associated with that item, and the new position is announced.
2. **Given** an active keyboard reorder, **When** the user cancels, **Then** the original order is restored, focus remains on the same item, and no reorder notification is emitted.
3. **Given** a movable item at the first or last permitted position, **When** the user attempts to move beyond the boundary, **Then** the order remains stable and the boundary is communicated without losing focus.
4. **Given** a non-editable list or fixed item, **When** it receives keyboard input used for reordering, **Then** no reorder operation starts.

---

### User Story 3 - Keep Fixed and Dynamic Items Predictable (Priority: P2)

A developer can mix fixed and movable direct children, add or remove items at runtime, and trust the component to preserve every child exactly once in a deterministic order.

**Why this priority**: Real lists change over time and often contain pinned rows. Losing, duplicating, or unexpectedly moving consumer-owned content is a severe data and usability failure.

**Independent Test**: Render movable items around fixed items, perform moves across both directions, then insert and remove children before, during, and after a reorder; verify stable fixed positions, unique items, deterministic ordering, and safe cancellation.

**Acceptance Scenarios**:

1. **Given** fixed and movable items, **When** a movable item crosses a fixed item, **Then** the fixed item remains at its original list position while only movable items change relative order.
2. **Given** a fixed item, **When** the user attempts pointer or keyboard pickup, **Then** the item cannot be moved and its ordinary controls remain usable.
3. **Given** a new ordinary direct child, **When** it is inserted while no reorder is active, **Then** it appears once at the authored insertion position and no user-reorder notification is emitted.
4. **Given** the active item is removed, the list becomes non-editable, or the component disconnects during a reorder, **When** the component observes that invalid state, **Then** it cancels cleanly without leaving a preview, placeholder, document-level interaction handler, or altered surviving item.

---

### User Story 4 - Reorder in Constrained and Scrolling Layouts (Priority: P2)

A user can move items in a list whose nearest container scrolls, whose items have different sizes, and whose page is offset from the viewport.

**Why this priority**: Coordinate mistakes and stale measurements commonly make drag-and-drop appear to work in a small demo but fail in real layouts.

**Independent Test**: Place varied-height items inside an offset, scrollable container, drag an item beyond the visible edge, and verify automatic scrolling, destination tracking, and the final order at multiple page scroll positions.

**Acceptance Scenarios**:

1. **Given** a list in a scrollable container, **When** the pointer approaches an obscured valid destination near an edge, **Then** the container scrolls in that direction and the placeholder continues to represent the current destination.
2. **Given** automatic scrolling is disabled, **When** the same edge gesture occurs, **Then** the component does not scroll an ancestor on the user's behalf.
3. **Given** unequal item heights or a page that has been scrolled, **When** the user drags through the list, **Then** hit detection and preview movement remain aligned with the visible items.
4. **Given** there is no scrollable ancestor, **When** a reorder occurs, **Then** the operation completes without errors or runaway scrolling.

---

### User Story 5 - Consume a Clear Public Contract (Priority: P3)

A developer or AI tool can determine how to provide items, enable editing, identify fixed items, customize drag feedback, respond to committed changes, and meet accessibility responsibilities without reading private implementation code.

**Why this priority**: Reliable runtime behavior is difficult to adopt if its inputs, outputs, states, and styling boundaries are ambiguous or inconsistent across documentation surfaces.

**Independent Test**: Use only the published component contract and examples to build an editable task queue with one fixed row, custom placeholder and preview content, change handling, and keyboard operation.

**Acceptance Scenarios**:

1. **Given** the published contract, **When** a consumer builds the documented primary example, **Then** the list works without manually assigning numeric placement metadata to ordinary items.
2. **Given** a successful reorder, **When** the consumer handles its notification, **Then** the component already displays the committed order and the notification identifies the moved item, its previous and new positions, and the complete resulting item order for application persistence.
3. **Given** custom placeholder or drag-preview content, **When** it is supplied, **Then** it appears only in the applicable active-drag state and does not participate as a reorderable item.
4. **Given** a consumer applies documented styling hooks, **When** default, active, placeholder, preview, focus, disabled, and reduced-motion states are exercised, **Then** the intended public regions can be customized without private tree access.

### Edge Cases

- The list is empty or contains a single movable item.
- All items are fixed, or fixed items appear at the beginning, middle, and end.
- Two items have identical text or visual content; identity must not depend on display text.
- Consumer-supplied stable keys are missing for some items or duplicated; element references remain authoritative and ambiguous keys must be reported as invalid consumer input.
- An item contains nested buttons, links, inputs, selectable text, or another draggable element.
- A pointer leaves the list or browser viewport, loses capture, is canceled, or is released outside the component.
- The user presses Escape during pointer or keyboard reordering.
- The component becomes non-editable, disabled by surrounding application state, hidden, disconnected, or emptied during a reorder.
- The active item or a destination item is removed while a reorder is active.
- Children are inserted, removed, or externally reordered while no gesture is active.
- Items differ substantially in height or change size during a reorder.
- The page and one or more ancestors are scrolled before or during a reorder.
- The list is inside a transformed, zoomed, or right-to-left page while its ordering axis remains vertical.
- A custom placeholder or preview is absent, empty, larger than the item, or contains interactive content.
- Motion reduction is requested by the user.
- Server-rendered output is produced before browser interaction is available.

## Requirements

### Functional Requirements

- **FR-001**: The component MUST treat each ordinary direct child as one reorderable-list item and MUST exclude dedicated placeholder and drag-preview content from the item order.
- **FR-002**: The component MUST present ordinary children in authored order on initialization without requiring consumers to provide numeric placement metadata.
- **FR-003**: When editing is enabled, users MUST be able to reorder movable items with mouse, touch, pen, and keyboard input.
- **FR-004**: The component MUST distinguish an intentional pointer reorder from a click, tap, text selection, or activation of interactive item content using a documented pickup threshold and cancellation behavior.
- **FR-005**: During an active pointer reorder, the component MUST display an item preview and a destination placeholder that remain aligned with the visible list as the pointer and relevant scroll containers move.
- **FR-006**: A drop MUST commit the exact order represented by the final valid placeholder position. A canceled, invalid, or no-op drop MUST restore the pre-gesture order.
- **FR-007**: Keyboard users MUST be able to start, move, commit, and cancel a reorder using documented keys, with predictable focus retention and announcements of pickup, position changes, boundaries, completion, and cancellation.
- **FR-008**: Items marked fixed MUST remain at their original absolute positions, MUST reject pickup through every input method, and MUST continue to support their ordinary descendant interactions.
- **FR-009**: Movable items MUST be able to change relative order across fixed positions without moving, duplicating, or removing a fixed item.
- **FR-010**: The component MUST emit exactly one canonical bubbling reorder notification after a successful user-initiated order change and MUST emit none for initialization, external child insertion/removal, canceled gestures, threshold-only gestures, or no-op drops. A deprecated compatibility notification MAY accompany the canonical notification through the next explicitly breaking release only when its existing payload and flags remain unchanged and migration guidance identifies the canonical replacement.
- **FR-011**: The canonical reorder notification MUST identify the moved item, its previous position, its new position, the complete resulting order, and the input method that committed the change. Item identity MUST include the direct child element reference and MUST also include its consumer-supplied stable string key when present. Stable keys MUST be unique within one list; missing keys fall back to element identity. An attempted reorder with duplicate keys MUST preserve the order, emit one actionable error notification, and emit no success notification.
- **FR-012**: The component MUST commit and retain the resulting visual order immediately after a successful reorder, and that visible order MUST agree with the order exposed by its notification. The component MUST NOT physically reorder consumer-owned direct child elements.
- **FR-013**: External insertion, removal, or authored reordering of direct children while idle MUST become the authoritative application order, reconcile any retained visual ordering without emitting a user-reorder notification, and leave every ordinary child present exactly once.
- **FR-014**: If active reorder state becomes invalid, the component MUST cancel safely, restore surviving content, stop automatic scrolling, remove temporary interaction handling, and clear all transient visual state.
- **FR-015**: The component MUST automatically scroll the nearest eligible vertical scroll container when an active pointer approaches an obscured valid destination, unless the consumer disables automatic scrolling.
- **FR-016**: Position calculation MUST remain correct for unequal item sizes, existing page or ancestor scroll offsets, and layout changes that occur during a reorder.
- **FR-017**: Non-editable mode MUST preserve list presentation while exposing no reorder affordance and causing no reorder-specific interception of pointer or keyboard interaction.
- **FR-018**: The public contract MUST document editing state, pickup threshold, automatic-scroll control, fixed-item marking, item identity expectations, notification payload and timing, keyboard controls, cancellation, direct-child rules, special content slots, styling hooks, and accessibility behavior.
- **FR-019**: Consumers MUST be able to customize the item placement region, placeholder, drag preview, focus indication, active state, spacing, dividers, and motion through documented public styling hooks without private-tree access.
- **FR-020**: Default placeholder, preview, focus, and active states MUST remain visibly understandable without consumer styling, and motion MUST respect the user's reduced-motion preference.
- **FR-021**: The component MUST expose list and item semantics appropriate to an ordered, reorderable collection and MUST provide an accessible name or documented naming route for the list.
- **FR-022**: The component MUST remain usable as a standards-based custom element without reliance on a particular application framework.
- **FR-023**: The package README, source contract, generated manifest, documentation page, realistic examples, and AI-facing catalog MUST describe the same public behavior and terminology.
- **FR-024**: Browser validation MUST exercise observable reordering through real pointer, touch-equivalent, and keyboard input, including cancellation, fixed items, nested controls, scrolling, dynamic children, notification cardinality, and accessibility state.
- **FR-025**: The standalone component example MUST load the published component successfully and demonstrate at least one complete reorder without relying on unpublished interfaces.

### Key Entities

- **Reorder List**: The ordered collection, including whether editing and automatic scrolling are enabled and the accessible name exposed to users.
- **Item**: An ordinary consumer-owned direct child identified authoritatively by its element reference and, when supplied, by a unique stable string key; it also has a current position, movable or fixed status, and potentially interactive descendants.
- **Reorder Session**: A temporary interaction with an input method, active item, original position, candidate position, original order, and committed or canceled outcome.
- **Destination Placeholder**: The visible location where the active item will be placed if the session is committed; it is feedback, not an item.
- **Drag Preview**: The transient representation of the active item during pointer reordering; it is feedback, not an item.
- **Reorder Notification**: The single post-commit record of the moved item, previous and new positions, resulting order, and committing input method.

## Success Criteria

### Measurable Outcomes

- **SC-001**: In the supported-browser test matrix, 100% of scripted mouse, touch-equivalent, pen-equivalent, and keyboard reorder journeys produce the expected order with no lost or duplicated items.
- **SC-002**: Across 100 consecutive completed, canceled, and no-op reorder attempts, every successful order change emits exactly one canonical reorder notification and every non-change emits zero success notifications; while the documented compatibility window remains open, no success emits more than one additional legacy notification.
- **SC-003**: Users can move any movable item to any permitted position in a 20-item list using pointer or keyboard input in under 10 seconds, excluding reading time.
- **SC-004**: Fixed items retain their original absolute positions in 100% of forward and backward reorder scenarios, including moves that cross multiple fixed positions.
- **SC-005**: Reordering remains correct in an offset scrolling container with varied item heights at the top, middle, and bottom of the page in every supported browser.
- **SC-006**: Keyboard-only users can initiate, move, commit, and cancel reordering with focus retained and each state change announced in 100% of accessibility test scenarios.
- **SC-007**: A developer can implement the documented editable task-queue example, including one fixed row and change handling, in under 15 minutes without reading component source.
- **SC-008**: All component behavior, contract, documentation, generated-artifact, and browser quality gates pass with no stale or contradictory public API descriptions.

## Assumptions

- The component is a vertical reorderable collection; horizontal and grid reordering are outside this feature's scope.
- Ordinary direct children are consumer-owned items. Nested descendants are content of their nearest direct-child item, not independent reorder targets.
- The component owns transient ordering metadata, visual feedback, and the immediate committed visual order. The consuming application owns its direct child elements and remains responsible for persisting and later reconciling the new business-data order after receiving a successful reorder notification.
- Fixed items keep their absolute list positions; movable items may change relative order around them.
- The default interaction reorders the whole item rather than requiring a dedicated handle. Interactive descendants must remain usable when the gesture does not cross the pickup threshold.
- Existing public presentation settings remain supported. Any incompatible behavioral or notification change requires migration guidance rather than silent breakage.
- The primary deliverable is a corrected, documented component contract and behavior. Multi-list transfer, nesting, copying, deletion, undo history, and application-level persistence are outside scope.
