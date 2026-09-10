# @c2n/seperator

Seperator built with Lit: a horizontal or vertical rule with an optional label, themed through CSS custom properties.

```bash
npm install @c2n/seperator
```

```html
<script type="module">
  import '@c2n/seperator'
</script>

<c2-seperator></c2-seperator>
<c2-seperator>or</c2-seperator>
<c2-seperator orientation="vertical"></c2-seperator>
<c2-seperator decorative style="--c2-seperator--inset-start: 48px"></c2-seperator>
```

- **Orientation**: `orientation="vertical"` draws an inline rule that stretches to the height of its flex row (give it a `height` elsewhere). Horizontal is the default and fills the width.
- **Label**: slotted text sits between two line segments. `--c2-seperator__line-start--flex: 0 0 24px` pins it near the start; `0 0 0px` with `--c2-seperator__label--gap: 0px` turns it into a section heading followed by a rule.
- **Accessibility**: `role="separator"` with `aria-orientation`; add `decorative` for purely visual dividers (list rows, toolbars) so they are skipped.
- **Line**: `--c2-seperator--thickness`, `--c2-seperator--color` and `--c2-seperator--style` (`dashed`, `dotted`). `--c2-seperator--spacing` adds margin across the line, `--c2-seperator--inset-start` / `--inset-end` shorten it along its axis for inset list dividers.

The label is themed with `--c2-seperator__label--*` (colour, size, weight, letter spacing, text transform). The full list is in `custom-elements.json` and on the docs site.
