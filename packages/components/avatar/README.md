# @c2n/avatar

Avatar built with Lit: image, initials or any slotted content, with an optional status dot or badge.

```bash
npm install @c2n/avatar
```

```html
<script type="module">
  import '@c2n/avatar'
</script>

<c2-avatar name="Ada Lovelace" initial-count="2"></c2-avatar>
<c2-avatar name="Ada Lovelace" src="/ada.jpg" status="online"></c2-avatar>
<c2-avatar name="Ada Lovelace" auto-color initial-count="2"></c2-avatar>
```

- **Content resolution**: the `src` image first (a failed load fires `error` and falls back to the initials), then slotted content (an icon, an emoji, an `<img>`), then the initials computed from `name`. `initial-count="2"` uses the first and last word of a longer name; `initials` overrides the computation.
- **Colour**: `auto-color` derives a stable hue from the name, tunable with the `auto-color--saturation` and `--lightness` tokens.
- **Status and badge**: `status="online|away|busy|offline"` draws a dot in the bottom-right corner; the `badge` slot replaces it with your own element (a count, an icon) and gets the same ring.
- **Sizing**: one `--c2-avatar--size` token drives width, height and the font size (40% of the size by default); `--c2-avatar--width` and `--height` override it for non-square shapes.
- **Accessibility**: the avatar is `role="img"` labelled by `alt` or `name`.

Every visual aspect is a CSS custom property (`--c2-avatar--*`, `--c2-avatar__badge--*`, `--c2-avatar__image--*`). For stacked groups give each avatar `--c2-avatar--box-shadow: 0 0 0 2px <page background>` and a negative margin. The full list is in `custom-elements.json` and on the docs site.
