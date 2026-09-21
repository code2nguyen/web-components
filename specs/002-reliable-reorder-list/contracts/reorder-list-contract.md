# Contract: `c2-reorder-list`

## Purpose and Boundaries

`c2-reorder-list` presents consumer-owned direct children as one vertical ordered collection and, when editable, lets users change their visual order with pointer or keyboard input.

The component owns interaction state, visual placement, focus management, feedback, and the immediate committed visual order. The application owns the direct-child elements and persistence of the resulting business-data order.

Out of scope: horizontal/grid layout, transfer between lists, nesting, copying, deletion, undo history, and persistence.

## Host Properties and Attributes

| Property             | Observed attribute   | Type      | Default | Contract                                                                                                                                                  |
| -------------------- | -------------------- | --------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `editable`           | `editable`           | `boolean` | `false` | Enables pointer and keyboard reordering. False exposes no reorder affordance and intercepts no reorder input.                                             |
| `dragStartThreshold` | `dragstartthreshold` | `number`  | `10`    | Minimum summed pointer movement in CSS pixels before an armed pointer becomes a drag. Negative and non-finite values normalize to the documented default. |
| `autoScrollDisabled` | `autoscrolldisabled` | `boolean` | `false` | Prevents component-driven ancestor scrolling during pointer reordering.                                                                                   |

The existing lowercase observed attribute names remain supported for compatibility. The component uses the repository boolean converter, so literal `"false"` and `"0"` are false.

Global `aria-label` and `aria-labelledby` on the host name the component-owned list boundary. Documentation MUST require one of them for an editable list when surrounding context does not already provide an accessible name.

## Direct-Child Item Markers

Every ordinary direct child is one item. Nested descendants belong to that item and are never independent reorder targets.

| Marker               | Type                      | Default       | Contract                                                                                                                                                 |
| -------------------- | ------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `data-fixed`         | repository boolean string | false         | Holds the item at its absolute visual index and rejects pickup through every input method. Empty presence or a value other than `"false"`/`"0"` is true. |
| `data-reorder-key`   | optional non-empty string | absent        | Stable application identity included in events. Missing keys are valid; non-empty keys MUST be unique within the list.                                   |
| `data-reorder-label` | optional non-empty string | text fallback | Human-readable label used in reorder instructions and announcements. Persistence keys are not spoken by default.                                         |

Interactive descendants include links, buttons, inputs, textareas, selects, editable content, and their descendants. Pointer and reorder-key events originating from them retain native behavior and MUST NOT arm or move an item.

## Content and Slots

| Content                     | Contract                                                                                                                                                       |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ordinary direct children    | Items authored without numeric slot metadata. The component may assign private projection metadata but consumers MUST NOT depend on or persist it.             |
| `slot="placeholder"`        | Optional consumer-owned content displayed at the current pointer destination. It is excluded from item order and has a component-provided visible fallback.    |
| `slot="dragging-item"`      | Optional consumer-owned pointer preview content. It is excluded from item order. Without it, the component provides a recognizable preview of the active item. |
| Dynamic internal item slots | Private projection mechanism only. Numeric names are not a consumer-authored API despite appearing in the rendered assignment.                                 |

Special placeholder/preview children never receive item semantics, positions, focus, or event identities.

## Visual Order and Reconciliation

1. Initial visual order equals authored ordinary-child DOM order.
2. A successful user reorder commits and retains visual order immediately.
3. The component MUST NOT physically reorder consumer-owned direct children.
4. Any application-authored direct-child insertion, removal, or DOM reorder while idle becomes authoritative and reconciles visual order without success events.
5. Such a mutation during a session cancels first, clears all transient state, and then adopts authored order.
6. Each ordinary child appears exactly once after every initialization, commit, cancel, and reconciliation.

Fixed elements keep absolute indexes. Movable items may cross them by reordering the movable-only subsequence and refilling non-fixed positions. For `[A, F, B, C]`, moving A last yields `[B, F, C, A]` while F remains index 1.

## Pointer Contract

- Accept one primary pointer and primary mouse button at a time.
- Pointerdown records the source; it does not start a drag or suppress an ordinary activation.
- Crossing `dragStartThreshold` validates keys, starts feedback, and captures the pointer.
- Pointer movement uses viewport coordinates and current visible rectangles.
- Pointerup inside the valid list commits the current candidate when it differs from the original order.
- Pointerup outside the valid list cancels.
- Pointercancel, unexpected lost capture, Escape, direct-child mutation, editability loss, active-item removal, disconnect, or invalid visibility cancels.
- Every terminal path releases capture, stops auto-scroll, removes listeners, cancels animation frames, restores transient assignments/styles, and leaves no preview or placeholder active.
- Pointer reordering never steals keyboard focus.

While editing is enabled, movable item surfaces declare vertical gesture ownership through `touch-action` before pointerdown; browsers decide touch panning before the threshold is crossed, so this cannot be activated lazily. Consumers that need native vertical scrolling from every point inside a row should wait for a future dedicated-handle mode rather than relying on ambiguous threshold behavior.

## Keyboard Contract

Exactly one movable placement wrapper uses `tabindex="0"`; other movable wrappers use `-1`. Fixed wrappers are not reorder controls, while their interactive descendants remain normally focusable.

| Key         | Idle                                                   | Active keyboard reorder                                                                                |
| ----------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `Space`     | Pick up the focused movable item after key validation. | Commit when the position changed; otherwise exit without an event.                                     |
| `ArrowUp`   | No reorder action.                                     | Move to the previous permitted movable destination, crossing fixed indexes without moving fixed items. |
| `ArrowDown` | No reorder action.                                     | Move to the next permitted movable destination.                                                        |
| `Home`      | No reorder action.                                     | Move to the first permitted destination.                                                               |
| `End`       | No reorder action.                                     | Move to the last permitted destination.                                                                |
| `Escape`    | No reorder action.                                     | Cancel and restore the original order.                                                                 |

Enter is not a reorder key. Reorder keys from interactive descendants are ignored. Focus remains tied to the moved element through move, commit, and cancel. If the active item disappears, focus moves to the nearest surviving movable item or the host when none remains.

## Accessibility Contract

- Component-owned `container` boundary: default `role="list"`, named from the host's consumer-provided `aria-label` or resolved `aria-labelledby`. Keeping the role on this boundary prevents the sibling live-status region from becoming an invalid owned child of the list.
- Ordinary placement wrapper: `role="listitem"`, absolute `aria-posinset`, and `aria-setsize` for the total ordinary-item count.
- Reorderable wrapper: references persistent hidden keyboard instructions.
- Status: one persistent visually hidden `role="status"`, `aria-live="polite"`, `aria-atomic="true"` region.
- Do not use listbox/option, `aria-grabbed`, or `aria-dropeffect`.
- Displayed order, absolute position metadata, and composed sequential focus order MUST agree.

Required status messages convey:

- pickup label, position, size, and Space/arrow/Escape instructions;
- each moved position;
- first/last permitted boundary;
- committed from/to positions;
- restored position after cancellation; and
- duplicate-key configuration error.

## Canonical Events

```ts
export type ReorderInputMethod = 'mouse' | 'touch' | 'pen' | 'keyboard'

export interface ReorderItemReference {
  element: HTMLElement
  key?: string
}

export interface ReorderEventDetail {
  item: ReorderItemReference
  fromIndex: number
  toIndex: number
  order: readonly ReorderItemReference[]
  inputMethod: ReorderInputMethod
}

export interface ReorderErrorEventDetail {
  reason: 'duplicate-key'
  key: string
  elements: readonly HTMLElement[]
}

export interface ReorderListEventMap {
  reorder: CustomEvent<ReorderEventDetail>
  'reorder-error': CustomEvent<ReorderErrorEventDetail>
  /** @deprecated Listen for `reorder`. */
  change: CustomEvent<number[]>
}
```

The component declares repository-standard typed `addEventListener` and `removeEventListener` overloads using `ReorderListEventMap`.

### `reorder`

- Fires exactly once after a real user-initiated order change.
- `bubbles: true`, `composed: true`, `cancelable: false`.
- `fromIndex`, `toIndex`, and `order` use zero-based absolute visual positions including fixed items.
- Element references are authoritative; `key` is included only when a non-empty unique key is present.
- Never fires for initialization, external reconciliation, threshold-only interaction, cancellation, no-op, or error.

### `reorder-error`

- Fires once for an attempted pointer or keyboard pickup when a non-empty key is duplicated.
- `bubbles: true`, `composed: true`, `cancelable: false`.
- The operation does not start, order/focus remain unchanged, and no success event fires.

## Deprecated `change` Compatibility

During the compatibility window, a successful reorder also emits one deprecated `change` event with the existing `number[]` payload: the array is indexed by authored ordinary-child order, and each value is that child's resulting zero-based visual position. Moving the authored first of three items to the end produces `[2, 0, 1]`.

The event preserves its existing flags (`bubbles: true`, `cancelable: true`) and does not gain identity or input-method fields. It never fires alone or for a non-change. It is removed in the next explicitly breaking release; documentation MUST show migration to `reorder`.

## Public Parts

| Part            | Contract                                                                                                                                  |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `container`     | Ordered list layout and component-owned scrolling/spacing boundary.                                                                       |
| `item`          | Repeated placement wrapper for each ordinary direct child. It receives focus and active states without styling inside the assigned child. |
| `placeholder`   | Current pointer destination and its fallback content; present only during pointer reordering.                                             |
| `dragging-item` | Fixed-position pointer preview region; active only during pointer reordering.                                                             |

Consumers style their own direct-child content directly. Parts expose only component-owned regions and do not pierce a child's shadow root.

## CSS Custom Properties

Existing properties remain supported and receive authoritative `@cssproperty` declarations:

- `--c2-reorder-list--container-border-width`
- `--c2-reorder-list--container-border-color`
- `--c2-reorder-list--container-border-radius`
- `--c2-reorder-list--container-padding`
- `--c2-reorder-list--container-margin`
- `--c2-reorder-list--container-gap`
- `--c2-reorder-list--item-background`
- `--c2-reorder-list--item-padding`
- `--c2-reorder-list--divider-height`
- `--c2-reorder-list--divider-color`
- `--c2-reorder-list--placeholder-background`
- `--c2-reorder-list--dragging-item-background`

The design adds documented presentation hooks for focus, active feedback, visible default destination/preview, and motion:

- `--c2-reorder-list__item__focus--outline-width`
- `--c2-reorder-list__item__focus--outline-color`
- `--c2-reorder-list__item__focus--outline-offset`
- `--c2-reorder-list__item__active--opacity`
- `--c2-reorder-list__placeholder--border-width`
- `--c2-reorder-list__placeholder--border-style`
- `--c2-reorder-list__placeholder--border-color`
- `--c2-reorder-list__dragging-item--opacity`
- `--c2-reorder-list__dragging-item--box-shadow`
- `--c2-reorder-list__motion--duration`
- `--c2-reorder-list__motion--timing-function`

Exact defaults live in the SCSS theme map and match source JSDoc. Under `prefers-reduced-motion: reduce`, the effective duration is zero and nonessential interpolation/fades/scaling are disabled; direct tracking and necessary auto-scroll remain functional.

## Automatic Scrolling

- Select the nearest ancestor whose computed vertical overflow is `auto` or `scroll` and whose scroll height exceeds its client height.
- Scroll only during an active pointer reorder near a relevant edge.
- Use one animation-frame loop, bounded step size, and fresh geometry.
- Stop at container boundaries and on every commit/cancel path.
- If no eligible ancestor exists, continue safely without automatic scrolling.
- `autoScrollDisabled` suppresses all component-driven scrolling.

## Documentation and Verification Obligations

Source JSDoc, generated manifest, React/Vue declarations, package README, standalone harness, UI docs/gallery, slot-styling audit, and AI metadata MUST agree on this contract.

Browser coverage MUST include pointer and keyboard success, threshold/no-op, fixed rows, nested controls, duplicate keys, event flags/cardinality/payload, external reconciliation, every cancellation reason, offset scrolling with unequal sizes, focus/live announcements, axe, styling parts/variables, and reduced motion. Hardware/device claims MUST distinguish trusted browser input, pointer-type contract tests, and manual device checks.
