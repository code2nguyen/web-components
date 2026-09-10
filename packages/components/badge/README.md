# @c2n/badge

Badge built with Lit: a tinted pill for status text, counts and dots, optionally pinned to a corner of another element.

```bash
npm install @c2n/badge
```

```html
<script type="module">
  import '@c2n/badge'
</script>

<c2-badge tone="success">Active</c2-badge>
<c2-badge tone="danger" count="120"></c2-badge>
<c2-badge dot tone="success" pulse></c2-badge>
<c2-badge tone="danger" count="5">
  <button slot="anchor">Inbox</button>
</c2-badge>
```

- **Tones**: `tone="neutral|primary|success|warning|danger|info"` picks a background/text pair; each pair is a CSS variable (`--c2-badge__success--background`, `--c2-badge__success--color`, …) and `--c2-badge--background` / `--c2-badge--color` override whichever tone is active.
- **Count**: `count` shows a number instead of the slotted text, clamped at `max` (default `99`, rendered as `99+`). A count of `0` hides the badge unless `show-zero` is set.
- **Dot**: `dot` renders a small circle in the tone colour; `pulse` adds a fading ring animation (disabled under `prefers-reduced-motion`).
- **Anchor**: put an element in the `anchor` slot and the badge becomes an overlay pinned to a corner chosen with `placement="top-right|top-left|bottom-right|bottom-left"`, ringed by `--c2-badge__anchor--border`. Add `overlap="circular"` for round anchors (avatars, icon buttons) so it lands on the edge of the circle; `--c2-badge__anchor--offset-x/y` fine-tune the position.
- **Icon**: the `prefix-icon` slot places an icon before the text, sized by `--c2-badge__icon--size`.

Shape and typography are CSS custom properties (`--c2-badge--height`, `--c2-badge--border-radius`, `--c2-badge--font-size`, `--c2-badge--text-transform`, …). For an outlined badge set `--c2-badge--background: transparent` and `--c2-badge--border: 1px solid currentColor`. The full list is in `custom-elements.json` and on the docs site.
