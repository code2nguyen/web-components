# @c2n/toast

Notification cards and a stack manager for bursts of notifications.

```sh
npm install @c2n/toast
```

```ts
import { toast, getToastRegion } from '@c2n/toast'

toast.show({ message: 'New message received', variant: 'info' })
const id = toast.show({ id: 'upload', message: 'Uploading…', duration: 0 })
toast.update(id, { message: 'Upload complete', variant: 'success', duration: 5000 })
getToastRegion().maxVisible = 3
getToastRegion().position = 'bottom-right'
```

`toast.show()` returns an ID. Reusing an ID updates its card. `toast.update()` restarts its duration, `toast.dismiss(id)` removes one item, and `toast.clear()` removes everything. Call the manager in the browser; importing is SSR-safe.

Three cards are visible by default. Overflow waits in FIFO order and receives its full timeout after becoming visible. Timers pause on hover, keyboard focus, hidden documents and region disconnection. Duration defaults to 5 seconds; 0 is persistent. Managed toasts are dismissible by default.

For a scoped stack, use `<c2-toast-region>` and call `show`, `updateToast`, `dismiss`, `clear`, `pause`, or `resume`. Inspect `count` and `queuedCount`. Six `position` values cover top/bottom and left/center/right. `inline` embeds the stack in normal flow.

`actionLabel` displays an action button. Region `toast-action` events contain `{ id, toast }` and are followed by dismissal. `toast-dismiss` contains `{ id, toast, reason }`, where reason is `timeout`, `close`, `action`, `programmatic`, or `clear`.

Standalone `<c2-toast message="Saved" variant="success" dismissible>` cards do not auto-expire. They support `heading`, `action-label`, `close-label`, and the default, `icon`, `action`, and `close-icon` slots. Standalone dismissal hides the card and emits `toast-close`.

Theme through `--c2-toast__container--*`, `--c2-toast__icon--*`, and the variables documented in `custom-elements.json`. Region layout uses `--c2-toast-region__container--{width,gap,offset,z-index}`. Managed cards inherit toast variables from their region.

Run queue and timer regression checks with `node --test packages/components/toast/scripts/toast-controller.test.ts` from the repository root.

## Animations

Configure the region's `enterAnimation` (default `slide-up`), `exitAnimation` (default `fade`), and `animationDuration` (default 200 ms). Attribute equivalents are `enter-animation`, `exit-animation`, and `animation-duration`. Effects: `none`, `fade`, `slide-up`, `slide-down`, `slide-left`, `slide-right`, and `scale`. Directions describe movement: slide-down enters from above and exits below.

Closing cards keep their slot until the exit completes. The next queued card then starts its lifetime, and `toast-dismiss` fires after removal. Updating a closing card cancels its removal. Reduced-motion preferences disable effects. These animations apply to managed toasts.

## Countdown and alignment

Icons are centered vertically by default; use `--c2-toast__icon--align-self: flex-start` for top alignment. Timed managed toasts show a thin, shrinking countdown bar by default. Set `region.showProgress = false` to hide it for a region, or override `showProgress` per notification. Persistent notifications have no countdown. The bar shares the dismissal clock, including pauses, queue promotion, and lifetime resets on updates. Theme it with `--c2-toast__progress--{height,color,background}`. Standalone cards support `show-progress` and a static `progress` fraction (0–1).
