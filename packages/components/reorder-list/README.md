# Reorder List

`c2-reorder-list` presents ordinary direct children as a vertical collection and, when `editable`, lets users reorder movable items with a pointer or keyboard. It commits the visual order immediately without moving the application-owned light DOM. Listen for `reorder` to persist the result in application state.

Use this component for one vertical queue. It does not support grids, moving items between lists, nesting, copying, deletion, undo history, or persistence.

## Installation

```sh
npm install @c2n/reorder-list
```

```js
import '@c2n/reorder-list'
```

## Complete example

```html
<c2-reorder-list id="queue" editable aria-label="Deployment queue">
  <article data-reorder-key="verify" data-reorder-label="Verify release">Verify release</article>
  <article data-fixed data-reorder-key="approval" data-reorder-label="Required approval">Required approval</article>
  <article data-reorder-key="publish" data-reorder-label="Publish package">Publish package <button type="button">Details</button></article>
  <div slot="placeholder">Drop task here</div>
  <div slot="dragging-item">Moving task</div>
</c2-reorder-list>

<script type="module">
  import '@c2n/reorder-list'

  const queue = document.querySelector('#queue')
  queue.addEventListener('reorder', (event) => {
    const keys = event.detail.order.map((item) => item.key)
    saveQueue(keys)
  })
</script>
```

Ordinary items do not need `slot` attributes. The component assigns private projection metadata and never physically reorders those children. After `reorder`, update the application data in the reported order; a later application-authored child insertion, removal, or DOM reorder becomes authoritative without firing another success event.

## Interaction

- Pointer: press a movable row, cross `dragStartThreshold`, move to the visible placeholder, and release inside the list. Mouse, touch, and pen use the same Pointer Events path.
- Keyboard: focus a movable placement, press Space to pick it up, move with ArrowUp/ArrowDown or Home/End, press Space to commit, or Escape to cancel.
- Interactive descendants such as buttons, links, inputs, and editable content keep their native pointer and keyboard behavior.
- Whole-row touch reordering owns vertical direct manipulation while editing is enabled. Automatic scrolling moves the nearest eligible vertical scroll container. Set `autoScrollDisabled` when the application must own scrolling.
- Fixed items reject pickup and retain their absolute indexes. Movable items can cross them.

Provide `aria-label` or `aria-labelledby` when surrounding context does not already give the editable list an accessible name. `data-reorder-label` supplies concise announcement text; otherwise the component uses the item's accessible or visible text.

## Public API

| Property             | Attribute            | Default | Purpose                                                                         |
| -------------------- | -------------------- | ------- | ------------------------------------------------------------------------------- |
| `editable`           | `editable`           | `false` | Enables pointer and keyboard reordering.                                        |
| `dragStartThreshold` | `dragstartthreshold` | `10`    | Summed pointer travel in CSS pixels required for pickup. Invalid values use 10. |
| `autoScrollDisabled` | `autoscrolldisabled` | `false` | Disables component-driven ancestor scrolling.                                   |

Direct-child markers:

- `data-fixed`: empty presence or any value except literal `false`/`0` pins the item.
- `data-reorder-key`: optional non-empty stable persistence identity. Duplicate keys block pickup and fire `reorder-error`.
- `data-reorder-label`: optional human-readable announcement label.

Special slots `placeholder` and `dragging-item` are feedback only and never participate in item order. Their built-in fallbacks remain visible when custom content is absent.

## Events

`reorder` bubbles, is composed, and is not cancelable. It fires exactly once after a real user change:

```ts
interface ReorderEventDetail {
  item: { element: HTMLElement; key?: string }
  fromIndex: number
  toIndex: number
  order: readonly { element: HTMLElement; key?: string }[]
  inputMethod: 'mouse' | 'touch' | 'pen' | 'keyboard'
}
```

`reorder-error` has `{ reason: 'duplicate-key', key, elements }`. Initialization, external reconciliation, threshold-only gestures, cancellation, errors, and no-op drops emit no success event.

The deprecated `change` event is emitted alongside a successful `reorder` during the compatibility window. Its `number[]` detail remains indexed by authored child order and contains each child's resulting visual index. Migrate persistence listeners to `reorder`; `change` will be removed in the next explicitly breaking release.

## Styling

Style consumer-owned item content with its own class. Component-owned regions are `::part(container)`, `::part(item)`, `::part(placeholder)`, and `::part(dragging-item)`.

Existing variables remain supported for container border/spacing, item background/padding, dividers, placeholder background, and preview background. State hooks include:

- `--c2-reorder-list__item__focus--outline-width`, `--outline-color`, `--outline-offset`
- `--c2-reorder-list__item__active--opacity`
- `--c2-reorder-list__placeholder--border-width`, `--border-style`, `--border-color`
- `--c2-reorder-list__dragging-item--opacity`, `--box-shadow`
- `--c2-reorder-list__motion--duration`, `--timing-function`

Reduced-motion mode makes decorative transitions immediate while direct tracking, keyboard movement, and necessary automatic scrolling remain functional.
