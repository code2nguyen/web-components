# @c2n/skeleton

Skeleton built with Lit: a placeholder block standing in for content that has not arrived, in three shapes and three animations.

```bash
npm install @c2n/skeleton
```

```html
<script type="module">
  import '@c2n/skeleton'
</script>

<c2-skeleton></c2-skeleton>
<c2-skeleton variant="text" lines="3"></c2-skeleton>
<c2-skeleton variant="circle" label="Loading profile"></c2-skeleton>
<c2-skeleton animation="wave" style="--c2-skeleton--height: 120px"></c2-skeleton>
```

- **Shapes**: `variant="rect"` (default) for images, cards and buttons; `text` for copy, where `lines` repeats the block with a shorter last line; `circle` for avatars.
- **Animations**: `animation="pulse"` (default) fades the block, `wave` sweeps a highlight across it, `none` leaves it still. Reduced motion stops all three.
- **Accessibility**: the blocks are `aria-hidden` — a screen reader announcing a row of empty boxes helps nobody. Mark the waiting region `aria-busy="true"`, and give **one** skeleton in a group a `label` to turn it into a `role="status"` that announces the wait once.
- **Layout**: the host is a block that fills its container, and works as a flex or grid item without collapsing. A `circle` is sized by `--c2-skeleton__circle--size` on both axes, so it stays round in a container that is not square.

Theme it with `--c2-skeleton--width`, `--c2-skeleton--height`, `--c2-skeleton--border-radius`, `--c2-skeleton--background-color`, `--c2-skeleton__sheen--color` (the `wave` highlight), `--c2-skeleton__pulse--opacity`, `--c2-skeleton--animation-duration`, `--c2-skeleton--gap`, `--c2-skeleton__last-line--width` and `--c2-skeleton__circle--size`. The full list is in `custom-elements.json` and on the docs site.

Build a skeleton that traces the layout it replaces, then swap the whole thing for the real content. For a wait with no shape to hold, use [`@c2n/spinner`](../spinner); for one with a measurable amount of work left, [`@c2n/progress`](../progress).
