# Feature: `c2-master-detail` — a list beside the record it opens

**Status**: Implemented (`packages/components/master-detail`)
**Roadmap**: #69, section D, P2
**Research**: [research.md](./research.md)
**Mock**: [c2-master-detail mock](https://claude.ai/artifact/1gsjtT6ssND3oV154ktGpA)
**Related**: `c2-split-panel` (resizable panes, no narrow mode), `c2-sheet` (page-level panel), `c2-list` / `c2-table` / `c2-tree` (the usual master), `c2-status-panel` (the usual placeholder).

## Decisions

1. **The layout follows the element's own width.** A `ResizeObserver` picks the layout from `breakpoint` (default 720px). Before the first observation (a server-rendered page), a container query on the host lays it out at the default 720px.
2. **Three layouts.** `split` at or above the breakpoint; below it `collapse="stack"` (default, one pane at a time) or `collapse="overlay"` (the detail over the inert master, behind a backdrop).
3. **No selection inside.** The app fills the `detail` slot and sets `open`. The element clears `open` on Back (built-in bar or any `[master-detail-back]` element), Escape (overlay) and the backdrop, each preceded by a cancelable `close-request`.
4. **No host attribute.** The layout is the read-only `layout` property, the `layout-change` event and the `:state(split | stack | overlay)` custom states.
5. **Width changes keep the open record** (Material): narrowing while open shows the detail; widening while closed shows the placeholder. A layout change made by the width does not animate.

## Usage

```html
<c2-master-detail breakpoint="720" collapse="stack">
  <c2-list slot="master" required aria-label="Inbox">…</c2-list>
  <article slot="detail">…</article>
  <c2-status-panel slot="placeholder" heading="Select a conversation"></c2-status-panel>
</c2-master-detail>
```

```js
list.addEventListener('selection-change', (event) => {
  showRecord(event.detail.value[0])
  layout.open = true
})
layout.addEventListener('close-request', (event) => {
  if (form.dirty) event.preventDefault()
})
```

## Public API

| Kind      | Name                                                                               | Notes                                                                             |
| --------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Property  | `open` (reflected)                                                                 | The detail is showing.                                                            |
| Property  | `breakpoint`                                                                       | Width in px from which the panes sit side by side. Default 720.                   |
| Property  | `collapse` (reflected)                                                             | `stack` (default) or `overlay`.                                                   |
| Property  | `detail-label`, `back-label`                                                       | Accessible name of the detail pane / text of the Back button; localised defaults. |
| Read-only | `layout`                                                                           | `split`, `stack` or `overlay`.                                                    |
| Methods   | `show()`, `close()`                                                                | Set `open` without a `close-request`.                                             |
| Slots     | `master`, `detail`, `placeholder`, `toolbar`, `back-icon`                          |                                                                                   |
| Events    | `close-request` (cancelable), `layout-change`                                      | Neither bubbles.                                                                  |
| States    | `:state(split)`, `:state(stack)`, `:state(overlay)`                                | Also `:state(measured)`.                                                          |
| Parts     | `layout`, `master`, `detail`, `body`, `toolbar`, `back`, `placeholder`, `backdrop` |                                                                                   |

## Accessibility

- The detail pane is a `region` named "Details" (`detail-label`); in the overlay layout it is a `dialog` with the master inert.
- Stack and overlay: opening moves focus to an `[autofocus]` element in the detail, else to the pane; closing returns focus to the master element that had it, else to the master pane. The hidden pane is `inert`, so it is out of the tab order and the accessibility tree.
- Split: opening moves no focus; the user keeps walking the list.
- Reduced motion turns the slide off.

## Non-goals (for now)

- Drag-to-resize the master column (nest content in `c2-split-panel`, or a later `resizable` reusing it).
- A third column (list-detail-detail, SAP's three-column layout).
- Browser history: the app owns routing and sets `open` from the URL.
