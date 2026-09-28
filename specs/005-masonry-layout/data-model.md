# Masonry data model

See [spec.md](spec.md) for user outcomes and [contracts/masonry-elements.md](contracts/masonry-elements.md) for the proposed public names and shapes.

## Responsive size range

The range is selected from the `c2-masonry` container's own content width, not the viewport. The initial public ranges are fixed for this version:

| Range | Container width   | Columns |
| ----- | ----------------- | ------- |
| `xs`  | below 600 px      | 1       |
| `sm`  | 600–959.99 px     | 6       |
| `md`  | 960–1279.99 px    | 9       |
| `lg`  | 1280 px and above | 12      |

Exactly one range is active while the container has measurable width. Until it can be measured, author content remains present and the first valid layout pass waits for a positive width. Changing range changes only the effective column count and selected span; it never changes committed order or emits a user layout-change notification.

## Authored tile

Each direct `c2-masonry-item` child has:

- `itemId`: optional stable, nonempty string. Every tile needs a unique `itemId` before layout editing is available or a persistent snapshot can be emitted. Tiles without one, or sharing an ID, still render.
- `label`: optional human-readable name for edit controls and announcements; falls back to `aria-label`, then `itemId`.
- `rows`: global positive integer row span, default 10.
- `cols`: positive integer base column span, default 3.
- optional `colsXs`, `colsSm`, `colsMd`, `colsLg`: positive integer range overrides.
- arbitrary slotted content. Content is independent of the span and scrolls inside the tile when taller than its allocated height.

For a range without an override, use `cols`. Clamp the effective column span to `1..columnCount` without changing another range's authored value. Invalid authored numbers use their documented defaults and yield a diagnostic; they must not break placement.

## Committed layout snapshot

`MasonryLayoutSnapshot` is the application's restorable value. It contains `version: 1` and an ordered `items` array. Each item has:

| Field        | Meaning                | Invariant                            |
| ------------ | ---------------------- | ------------------------------------ |
| `id`         | Stable tile identity   | Nonempty and unique within the array |
| `rows`       | Row span at all widths | Positive integer                     |
| `columns.xs` | Column span in `xs`    | Integer from 1 to 1                  |
| `columns.sm` | Column span in `sm`    | Integer from 1 to 6                  |
| `columns.md` | Column span in `md`    | Integer from 1 to 9                  |
| `columns.lg` | Column span in `lg`    | Integer from 1 to 12                 |

Array order is the committed order shared by all size ranges. The snapshot contains no coordinates or pixel dimensions. New authored tiles absent from an otherwise valid snapshot append in authored order; snapshot entries whose IDs are no longer present are ignored for rendering and omitted from the next emitted snapshot. An invalid supplied snapshot is rejected as a whole, leaving the last valid internal arrangement in place; on first render it falls back to authored order and spans. Assigning a snapshot is an external reconciliation and emits no `layout-change` event.

When `saveLayout` is true (the default), the component reads one valid snapshot from localStorage for its key and writes after each changed user commit. It does not write on initialization, width changes, cancellation, or programmatic `layout` assignment. `save-layout="false"` disables reads and writes; `storage-key` overrides the automatic page URL and element identity key. An explicit `layout` input wins over stored data. Malformed data and storage access errors are ignored.

## Placement

A placement is derived, never persisted: `{id, columnStart, rowStart, columnSpan, rowSpan}` with zero-based starts. The packer processes the ordered tile sequence and places each tile in the first free rectangle that fits, scanning rows top to bottom and columns left to right. The maximum `rowStart + rowSpan` is the used row count and determines container height. Re-running with identical inputs returns identical placements. Removing a tile releases its cells and a later pack fills any available earlier space.

The tile element stays in application-owned light DOM. Component-owned shadow wrappers follow the committed order and hold derived placements, so the component can update composed reading/focus order without moving application nodes.

## Editing session

An edit session contains `kind: move | resize`, `inputMethod: mouse | touch | pen | keyboard`, the active `itemId`, the original valid snapshot, a candidate snapshot, and a phase (`armed`, `active`, `committing`, or `canceled`). The visible placeholder follows the candidate. The committed snapshot remains unchanged until completion.

| Transition                                                                                              | Result                                                        |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Start on a valid move or resize control                                                                 | Capture original state and establish candidate                |
| Pointer or keyboard adjustment                                                                          | Update candidate only and re-pack preview                     |
| Commit with a real change                                                                               | Replace committed state; emit one `layout-change`             |
| Commit with no change                                                                                   | Restore ordinary view; emit nothing                           |
| Escape, pointer cancel, lost capture, edit mode off, active tile removal, or unsafe resize of container | Restore original state and focus where possible; emit nothing |

Only the active range's column span changes during resize; row span is global. A move changes one shared ordered array. All observer, capture, scroll-loop, and document listeners are removed on cancellation, commit, or disconnect.

## Error conditions

Missing and duplicate IDs disable editing for the entire layout until corrected but do not hide content. Invalid authored spans fall back to defaults. Invalid application snapshots are rejected atomically. Each condition has a stable diagnostic reason in the public `layout-error` event and cannot emit a successful `layout-change` event.
