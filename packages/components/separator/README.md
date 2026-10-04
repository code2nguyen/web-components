# @c2n/separator

Separator built with Lit: a horizontal or vertical rule with an optional label, themed through CSS custom properties.

```bash
npm install @c2n/separator
```

```html
<script type="module">
  import '@c2n/separator'
</script>

<c2-separator></c2-separator>
<c2-separator>or</c2-separator>
<c2-separator orientation="vertical"></c2-separator>
<c2-separator decorative style="--c2-separator--inset-start: 48px"></c2-separator>
```

- **Orientation**: `orientation="vertical"` draws an inline rule that stretches to the height of its flex row (give it a `height` elsewhere). Horizontal is the default and fills the width.
- **Label**: slotted text sits between two line segments. `--c2-separator__line-start--flex: 0 0 24px` pins it near the start; `0 0 0px` with `--c2-separator__label--gap: 0px` turns it into a section heading followed by a rule.
- **Accessibility**: `role="separator"` with `aria-orientation`; add `decorative` for purely visual dividers (list rows, toolbars) so they are skipped.
- **Line**: `--c2-separator--thickness`, `--c2-separator--color` and `--c2-separator--style` (`dashed`, `dotted`). `--c2-separator--spacing` adds margin across the line, `--c2-separator--inset-start` / `--inset-end` shorten it along its axis for inset list dividers.

The label is themed with `--c2-separator__label--*` (colour, size, weight, letter spacing, text transform). The full list is in `custom-elements.json` and on the docs site.
