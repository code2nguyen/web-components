# @c2n/indicator

Indicator built with Lit: a solid dot or count pinned to an edge or corner of any element.

```bash
npm install @c2n/components
```

```html
<script type="module">
  import '@c2n/components/indicator'
</script>

<c2-indicator count="3" accessible-label="{count} unread messages">
  <button>Inbox</button>
</c2-indicator>
<c2-indicator tone="success" position="bottom-end" accessible-label="Online">
  <img src="avatar.png" alt="Ada" />
</c2-indicator>
```

- **Target**: the default slot holds the element the indicator is pinned to; it keeps its own role and focus, and the marker ignores the pointer.
- **Dot or count**: without `count`, and with nothing in the `label` slot, the indicator is a dot. `count` is clamped at `max` (default `99`, rendered as `99+`); `0` hides it unless `show-zero` is set. The `label` slot takes a short word or an `<svg>` icon instead.
- **Position**: `position="top-start|top-center|top-end|middle-start|middle-end|bottom-start|bottom-center|bottom-end"`, in logical terms, so `end` is the right in a left-to-right page and the left in a right-to-left one.
- **State**: `invisible` scales the indicator out (for read notifications); `pulse` adds a fading ring. Both animations respect `prefers-reduced-motion`.
- **Accessibility**: `accessible-label="{count} unread messages"` replaces the visible marker in the accessibility tree, `{count}` being the displayed count.
- **Tones**: `tone="neutral|primary|success|warning|danger|info"` (default `danger`) picks a background/text pair, each a CSS variable (`--c2-indicator__success--background`, …); `--c2-indicator--background` / `--color` override the active tone.

Size, ring, typography and placement are CSS custom properties (`--c2-indicator--height`, `--c2-indicator__dot--size`, `--c2-indicator--border`, `--c2-indicator--offset-x`, …). For a round target such as an avatar set both offsets to `14.6%`. The full list is in `custom-elements.json` and on the docs site.
