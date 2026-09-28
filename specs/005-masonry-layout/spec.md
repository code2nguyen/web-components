# Feature Specification: Responsive Masonry Tile Layout

**Feature Branch**: `develop` (specification only; no feature branch created)

**Created**: 2026-09-25

**Status**: Draft

**Input**: User description: "Rewrite the older dashboard-layout component as a c2n masonry component, without a layout suffix."

## Clarifications

### Session 2026-09-25

- Q: After a user moves a tile, what should the masonry layout remember when the available width changes? → A: Remember tile order and sizes; automatically repack at every width.
- Q: What should happen when a tile’s content is taller than its declared height? → A: Keep the tile size; scroll its overflowing content.
- Q: When a user resizes a tile at one screen size, should that change its width at other screen sizes too? → A: Change the tile's span only for the current size range.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Pack a dashboard of different-sized tiles (Priority: P1)

An application author places cards, charts, and other content into a masonry container. Each tile declares its intended width and height in grid units. The container places tiles in a predictable order, fills available gaps, and grows to contain the resulting arrangement.

**Why this priority**: Useful automatic packing is the core reason to use this component instead of the existing dashboard's fixed, author-positioned tracks.

**Independent Test**: Render a set of tiles with mixed spans, inspect their order and positions, then add and remove a tile. The result remains visible, non-overlapping, and compact without the application assigning coordinates.

**Acceptance Scenarios**:

1. **Given** tiles with different valid spans, **When** the container renders, **Then** every tile is fully visible, tiles do not overlap, and available space is packed from top to bottom in a deterministic order.
2. **Given** an existing layout, **When** a tile is added, removed, or its span changes, **Then** the remaining tiles are packed again without stale empty space or clipped content.
3. **Given** an empty container, **When** it renders, **Then** it has no phantom tile or unnecessary occupied height.
4. **Given** a tile whose content exceeds its declared height, **When** a user reads or interacts with that content, **Then** the tile keeps its declared size and the user can scroll to reach all of the content.

---

### User Story 2 - Adapt the same tiles to available space (Priority: P2)

An application author uses the same tile set on a phone, tablet, and desktop. The container changes its available columns as space changes, and each tile can have an appropriate span at each size. Content and reading order remain usable throughout the transition.

**Why this priority**: The older component's responsive spans are part of its defining behavior, and dashboards need to work at narrow widths.

**Independent Test**: Resize the containing area through narrow, medium, and wide widths while keeping the same tiles. All tiles remain within bounds and retain a stable reading order.

**Acceptance Scenarios**:

1. **Given** tiles with responsive span choices and a user-chosen order, **When** the available width crosses a configured size range, **Then** the relevant spans take effect and the tiles repack in that same order without overlaps.
2. **Given** a tile wider than the current column count, **When** the layout narrows, **Then** its effective width is limited to the available columns and it remains visible.
3. **Given** a one-column narrow layout, **When** tiles render, **Then** they stack in their intended reading order.
4. **Given** a tile resized in one size range, **When** the layout switches to another size range, **Then** the tile uses its previously declared or edited span for that other range.

---

### User Story 3 - Arrange and resize tiles in edit mode (Priority: P3)

An end user enters edit mode to move a tile or change its size. The layout previews the intended destination, makes room for the edited tile, and reports the committed arrangement so the application can save it.

**Why this priority**: Dragging, resizing, and reporting layout changes are central interactions in the referenced component, but the initial packing experience remains useful without them.

**Independent Test**: Enable editing, move and resize a tile by pointer and keyboard, then leave edit mode. The committed layout remains valid and an application listener receives the new tile order and spans.

**Acceptance Scenarios**:

1. **Given** editing is off, **When** a user interacts with tile content, **Then** no move or resize gesture starts and the content works normally.
2. **Given** editing is on, **When** a user moves a tile to a valid destination, **Then** the destination is indicated, other tiles make room, and the final arrangement has no overlap.
3. **Given** editing is on, **When** a user resizes a tile, **Then** its span stays within the available columns, only the current size range's span changes, and the other tiles repack after the change.
4. **Given** a focused tile edit control, **When** a keyboard user moves or resizes the tile, **Then** they can complete or cancel the action and perceive the resulting position and size.
5. **Given** a completed move or resize, **When** the action is committed, **Then** one layout change notification reports stable tile identities, order, row spans, and all responsive column spans; a canceled action reports no committed change.

### Edge Cases

- Duplicate or missing tile identities: all tiles remain visible, but editing is unavailable for the layout until every tile has a unique stable identity; change reporting must not associate one tile's state with another.
- Non-positive or non-numeric spans: an invalid tile must not cause overlap, an infinite layout, or a broken container.
- Tiles added or removed while editing: an in-progress gesture must end safely and the current set must repack.
- Narrowing the container during a gesture: the destination and effective span must remain within the new bounds or the gesture must cancel cleanly.
- Scrolling during a long drag: the user must be able to reach off-screen destinations without losing the active tile.
- Interactive content inside a tile: using a button, input, or link must not start a layout gesture.
- A tile with no or very little content still occupies its declared size; taller content scrolls within that tile without changing neighboring positions.
- Reduced-motion preference: movement remains understandable without relying on animation.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The library MUST provide a standalone masonry container and a companion tile that application authors can use with arbitrary tile content. Their public names MUST follow the repository convention: package `@c2n/masonry`, tags `c2-masonry` and `c2-masonry-item`.
- **FR-002**: The container MUST automatically place tiles with declared column and row spans into a deterministic, non-overlapping arrangement. It MUST fill the earliest available space in reading order for each tile. Initial tile order MUST follow authored order unless the application supplies a documented order. A committed move changes tile order, not a fixed tile coordinate.
- **FR-003**: The container MUST recalculate placement when its available width, tile set, tile order, or a tile's declared span changes, and MUST size itself to the resulting content.
- **FR-004**: The layout MUST support narrow, medium, and wide arrangements, including a single-column state. Authors MUST be able to declare each tile's intended width across supported size ranges; the behavior when a span exceeds available columns MUST be documented. Resizing a tile MUST update its span only in the active size range, leaving its other responsive spans unchanged. On every width change, the layout MUST repack using the same tile order and each tile's applicable span rather than retain fixed positions.
- **FR-005**: Tile content MUST remain supplied by the application. The layout MUST preserve its accessible content and normal interaction outside editing. Content taller than the tile's declared height MUST scroll within the tile without changing its span, and all content MUST remain reachable by keyboard and pointer.
- **FR-006**: Editing MUST be explicitly enabled and disabled by the application. The component MUST expose separate, discoverable move and resize controls only while editing is enabled.
- **FR-007**: A move or resize MUST show the prospective occupied area, prevent out-of-bounds or overlapping committed positions, and provide a way to cancel without changing the committed layout.
- **FR-008**: Move and resize MUST be operable by keyboard as well as pointer. Edit controls MUST have accessible names, visible focus, understandable state or instructions, and a way to exit the operation.
- **FR-009**: The container MUST notify applications once after each user-committed change with each tile's stable identity, order, row span, and span for every supported size range. Fixed coordinates MUST NOT be part of the saved arrangement. A canceled edit or a programmatic input change MUST NOT report a user-committed change.
- **FR-010**: Presentation choices including gutter, container surface, tile surface, borders, radii, placeholder, handles, and motion MUST be themeable through documented CSS custom properties; meaningful internal regions MUST have documented styling parts where variables alone are insufficient.
- **FR-011**: The component MUST document and verify its public behavior and accessibility at the element boundary, including package README, generated manifest, reference documentation, a realistic application example, and browser tests.
- **FR-012**: The component MUST be usable without relying on a specific application framework and MUST not require the existing `c2-dashboard` or `c2-dash-card` to function.
- **FR-013**: All tiles MUST remain visible when any identity is missing or duplicated, but layout editing MUST be unavailable until every tile has a unique stable identity; the limitation MUST be discoverable to the application author.
- **FR-014**: By default, the container MUST restore a valid layout from localStorage and save each committed user change. Authors MUST be able to disable both behaviors with `save-layout="false"` and supply a stable `storage-key`. An explicit application `layout` input MUST take precedence; unavailable or invalid storage MUST NOT block editing.

### Key Entities _(include if feature involves data)_

- **Masonry layout**: The container and its current responsive arrangement, including available column count, visible tile order, and edit state.
- **Masonry tile**: A piece of application content with a stable identity, a row span, an independent column span for each supported size range, and an effective position and size within the current arrangement.
- **Layout change**: A committed snapshot of tile identities, order, row spans, and all responsive column spans that an application can use to save or restore a user arrangement at any supported width; positions are recalculated.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A mixed set of at least 12 tiles with at least three different span combinations displays with zero overlaps, zero out-of-bounds tiles, and deterministic placement across repeated renders.
- **SC-002**: All tiles remain visible and follow the same committed order at narrow, medium, and wide container widths, including a one-column arrangement; their positions repack without overlap at each width.
- **SC-003**: Adding, removing, or resizing a tile updates the visible arrangement within one second in a 12-tile dashboard under normal desktop conditions.
- **SC-004**: A user can complete and cancel both move and resize with pointer and keyboard; all four paths leave a valid layout and only completed changes notify the application.
- **SC-005**: In a representative integration exercise, an application author can build a responsive, editable dashboard and capture a committed layout change using only the published component guidance and public contract.
- **SC-006**: Every advertised styling option visibly affects its intended region or edit state, and at least one published, realistic example can be followed end to end without missing instructions.

## Assumptions

- The requested name means “masonry”; the package is `@c2n/masonry` and the custom element prefix remains `c2-` per this repository's convention. “Layout” is omitted from the public name.
- “Masonry” here means the referenced dashboard's explicit-span tile packing, not a photo gallery that infers each item's span from intrinsic content height. Authors choose tile sizes; the container chooses positions.
- The [older dashboard layout](https://github.com/code2nguyen/webcomponents/blob/master/src/components/dashboard-layout/dashboard-layout.component.ts) and [dashboard item](https://github.com/code2nguyen/webcomponents/blob/master/src/components/dashboard-item/dashboard-item.component.ts) are behavioral references, not APIs to retain verbatim. The old layout has responsive column counts, packing, drag and resize, auto-scroll, and a `layout-change` event.
- The existing `c2-dashboard` serves applications that want explicit tracks and placement. The new masonry component serves applications that want automatic packing of differently sized tiles.
- Built-in localStorage persistence is enabled by default. Applications can opt out and use `layout-change` plus the `layout` property for their own persistence. Tile data fetching and dashboard-specific business controls remain outside this feature.
- The project constitution requires a complete public contract, styling hooks, realistic examples, and accessible behavior for the new component.
