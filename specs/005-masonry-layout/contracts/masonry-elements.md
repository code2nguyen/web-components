# Proposed `@c2n/masonry` public contract

This contract is the design target for implementation, source JSDoc, generated `custom-elements.json`, package README, and the UI documentation. It describes an automatic, explicit-span tile packer. Use `c2-dashboard` for fixed tracks and application-chosen card coordinates.

## Package and composition

| Import                              | Registers / exports                                  |
| ----------------------------------- | ---------------------------------------------------- |
| `@c2n/masonry`                      | Registers `c2-masonry` and `c2-masonry-item`         |
| `@c2n/masonry/masonry-item.js`      | Registers and types the companion item independently |
| `@c2n/masonry/custom-elements.json` | Describes both tags and all public hooks             |

`c2-masonry` accepts direct `c2-masonry-item` children in its default slot. Each item accepts arbitrary content in its default slot. The container owns placement; the item owns its content surface, scrolling, and edit controls. Nested masonry containers are separate layouts.

## Responsive ranges

The active range uses container content width. Ranges are fixed in version 1: `xs` below 600 px / 1 column; `sm` from 600 px / 6 columns; `md` from 960 px / 9 columns; `lg` from 1280 px / 12 columns. A later version may add configurable ranges without changing the meaning of these names. Column spans are clamped for rendering to the active column count; the user's stored spans for other ranges remain untouched.

## Container API: `c2-masonry`

| Property                                     | Attribute     | Default     | Meaning                                                                                                                         |
| -------------------------------------------- | ------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `editable: boolean`                          | `editable`    | `false`     | Shows and enables tile move/resize controls. Literal `editable="false"` remains false under the repo's boolean converter.       |
| `saveLayout: boolean`                        | `save-layout` | `true`      | Restores and saves committed layouts in localStorage; literal `"false"` disables both.                                          |
| `storageKey: string \| undefined`            | `storage-key` | `undefined` | Optional exact localStorage key, overriding the automatic page-and-element key.                                                 |
| `layout: MasonryLayoutSnapshot \| undefined` | none          | `undefined` | Reconciles an application-supplied arrangement by stable IDs. A new assignment is authoritative; it emits no user-change event. |

`MasonryLayoutSnapshot` is `{ version: 1, items: MasonryLayoutItem[] }`. Array position is the global order. `MasonryLayoutItem` is `{ id: string, rows: number, columns: { xs: number, sm: number, md: number, lg: number } }`. See [data-model.md](../data-model.md) for validation and dynamic-child reconciliation. A successful user edit updates internal state immediately, saves the snapshot when `saveLayout` is true, and emits `layout-change`. An explicit `layout` assignment takes precedence over stored data and does not emit a user-change event.

The default storage key is `c2-masonry:<pathname>:<element-id>`, falling back to the container's index in its document or shadow root when it has no ID. Query parameters do not change the key. Invalid or unavailable storage is ignored without blocking editing. The container has no coordinate-placement property, fetch behavior, or dashboard-specific controls.

## Item API: `c2-masonry-item`

| Property                      | Attribute | Default | Meaning                                                                                             |
| ----------------------------- | --------- | ------- | --------------------------------------------------------------------------------------------------- |
| `itemId: string \| undefined` | `item-id` | absent  | Stable unique persistence identity. Every tile needs one before layout editing is available.        |
| `label: string \| undefined`  | `label`   | absent  | Human-readable name used by controls and announcements; falls back to `aria-label`, then `item-id`. |
| `rows: number`                | `rows`    | `10`    | Positive integer row span, shared across ranges.                                                    |
| `cols: number`                | `cols`    | `3`     | Positive integer base column span for ranges without an override.                                   |
| `colsXs: number \| undefined` | `cols-xs` | absent  | `xs` column-span override.                                                                          |
| `colsSm: number \| undefined` | `cols-sm` | absent  | `sm` column-span override.                                                                          |
| `colsMd: number \| undefined` | `cols-md` | absent  | `md` column-span override.                                                                          |
| `colsLg: number \| undefined` | `cols-lg` | absent  | `lg` column-span override.                                                                          |

Invalid numeric attributes use their default or base fallback and raise `layout-error`. Missing and duplicated `item-id` values keep every tile visible and scrollable, but disable edit controls for the whole layout until corrected. Edit controls never become drag handles for slotted buttons, links, inputs, or other interactive content.

## Events

All events originate on `c2-masonry`, do not bubble, and are not cancelable. Listeners attach to the container.

| Event           | Detail                                                                                                                                  | Emission rule                                                                                                                                   |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `layout-change` | `{ layout: MasonryLayoutSnapshot, itemId: string, action: 'move' \| 'resize', inputMethod: 'mouse' \| 'touch' \| 'pen' \| 'keyboard' }` | Exactly once after a real user change is committed. No event for canceled, no-op, initialization, width-change, or programmatic reconciliation. |
| `layout-error`  | `{ reason: 'missing-id' \| 'duplicate-id' \| 'invalid-span' \| 'invalid-layout', itemId?: string }`                                     | When a distinct invalid author input is detected; not repeated on every render of the same invalid state.                                       |

## Editing contract

When `editable` is false, no built-in edit control is shown. In edit mode, each valid tile has a named move control and resize targets on its right and bottom borders. Hovering the tile reveals the move control and highlights those borders; keyboard focus reveals them too. Right-border drags change column span; bottom-border drags change row span. Edge cursors reveal the pointer interaction, while a focus outline exposes the bottom-border keyboard resize control. Pointer press on a control or edge starts an armed gesture, movement starts a preview, and release commits only a changed candidate. `pointercancel` or lost capture cancels. Touch action is restricted on handles and edge hit zones only, leaving interior tile content scrollable.

With a focused move control, Enter or Space starts a keyboard session, Left/Up moves the candidate toward the previous order position, Right/Down toward the next, Home/End to the first/last position, Enter or Space commits, and Escape cancels. With a focused resize control, Enter or Space starts a session; Left/Right decrease/increase the active range's column span and Up/Down decrease/increase the shared row span, by one cell per keypress. Enter or Space commits; Escape cancels. At a boundary, the candidate stays valid and no-op completion emits no event. The preview exposes the target area before commit.

Control labels include the tile label. Instructions and a polite status message announce the current order position or span and whether an action committed or canceled. Focus remains on the relevant control after completion, or returns to the container if that tile disappears. Reduced-motion preference removes decorative movement without hiding the preview or status.

The nearest eligible vertical scroll container scrolls while a pointer drag is held near its edge; scrolling stops on every gesture exit. A container-width change during an active gesture revalidates the candidate, or cancels cleanly if it cannot remain valid. No listener, pointer capture, or animation frame remains after disconnect.

## Slots and styling parts

| Element           | Slot / part                                                                | Purpose                                                         |
| ----------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `c2-masonry`      | default slot                                                               | Direct masonry items.                                           |
| `c2-masonry`      | `grid` part                                                                | Packed grid region.                                             |
| `c2-masonry`      | `placeholder` part                                                         | Candidate destination during editing.                           |
| `c2-masonry-item` | default slot                                                               | Arbitrary application content in the scrollable content region. |
| `c2-masonry-item` | `move-icon` slot                                                           | Optional consumer move icon with built-in SVG fallback.         |
| `c2-masonry-item` | `content`, `controls`, `move-handle`, `resize-handle`, `resize-edge` parts | Stable internal regions for styling beyond variable values.     |

The content region retains the declared tile height and uses internal scrolling when content exceeds it. It is keyboard reachable when it overflows and has an accessible name derived from the tile label. The application owns the styling and semantics of slotted content.

## CSS custom properties

All public values below require matching `@cssproperty` declarations, Sass theme-map defaults, manifest entries, and visible-effect tests. The CSS custom properties control presentation only; `rows`, `cols`, and responsive range behavior remain structural API.

| Element   | Custom property                                | Default                           | Purpose                                                           |
| --------- | ---------------------------------------------- | --------------------------------- | ----------------------------------------------------------------- |
| Container | `--c2-masonry--gap`                            | `8px`                             | Gap between cells/tiles.                                          |
| Container | `--c2-masonry--row-height`                     | `8px`                             | Height of one layout row.                                         |
| Container | `--c2-masonry--padding`                        | `0px`                             | Inset around the packed region.                                   |
| Container | `--c2-masonry--background`                     | `transparent`                     | Grid background.                                                  |
| Container | `--c2-masonry--border`                         | `none`                            | Outer border.                                                     |
| Container | `--c2-masonry--border-radius`                  | `0px`                             | Outer corners.                                                    |
| Container | `--c2-masonry__placeholder--background`        | `rgb(37 99 235 / 8%)`             | Candidate tile fill.                                              |
| Container | `--c2-masonry__placeholder--border`            | `2px dashed #2563eb`              | Candidate tile edge.                                              |
| Container | `--c2-masonry__placeholder--border-radius`     | `6px`                             | Candidate corners.                                                |
| Container | `--c2-masonry__motion--duration`               | `160ms`                           | Decorative relocation duration; ignored under reduced motion.     |
| Container | `--c2-masonry__motion--timing-function`        | `ease`                            | Decorative relocation easing.                                     |
| Item      | `--c2-masonry-item--background`                | `transparent`                     | Tile surface.                                                     |
| Item      | `--c2-masonry-item--border`                    | `none`                            | Tile border.                                                      |
| Item      | `--c2-masonry-item--border-radius`             | `0px`                             | Tile corners.                                                     |
| Item      | `--c2-masonry-item--box-shadow`                | `none`                            | Tile elevation.                                                   |
| Item      | `--c2-masonry-item__content--padding`          | `0px`                             | Insets within scrollable content.                                 |
| Item      | `--c2-masonry-item__controls--gap`             | `4px`                             | Move-handle inset from top/right borders.                         |
| Item      | `--c2-masonry-item__controls--background`      | `transparent`                     | Surface behind the move-handle corner.                            |
| Item      | `--c2-masonry-item__handle--size`              | `32px`                            | Move-handle hit target size.                                      |
| Item      | `--c2-masonry-item__resize-handle--size`       | `8px`                             | Invisible edge hit-zone depth (at least 16px on coarse pointers). |
| Item      | `--c2-masonry-item__resize-edge__hover--color` | `rgb(37 99 235 / 35%)`            | Right and bottom edge highlight on hover or keyboard focus.       |
| Item      | `--c2-masonry-item__handle--icon-size`         | `16px`                            | Built-in icon size.                                               |
| Item      | `--c2-masonry-item__handle--color`             | `#18181b`                         | Control foreground.                                               |
| Item      | `--c2-masonry-item__handle--background`        | `transparent`                     | Control surface.                                                  |
| Item      | `--c2-masonry-item__handle--border-radius`     | `6px`                             | Control corners.                                                  |
| Item      | `--c2-masonry-item__handle__hover--background` | `transparent`                     | Hover surface.                                                    |
| Item      | `--c2-masonry-item__handle__focus--outline`    | `2px solid #2563eb`               | Keyboard focus indicator.                                         |
| Item      | `--c2-masonry-item__dragging--opacity`         | `0.92`                            | Active tile opacity.                                              |
| Item      | `--c2-masonry-item__dragging--box-shadow`      | `0 12px 28px rgb(15 23 42 / 24%)` | Active tile elevation.                                            |

No variable may be declared without affecting its documented rendered target. `::part(...)` can style regions structurally without reaching into private shadow selectors. Consumer-defined slotted content is styled by the consumer.
