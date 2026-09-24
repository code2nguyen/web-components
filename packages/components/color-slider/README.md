# Color Slider

`c2-color-slider` is a horizontal hue input. Install `@c2n/color-slider` and import it before using the custom element:

```html
<c2-color-slider aria-label="Hue" value="120"></c2-color-slider>
```

Style the gradient's left border with `--c2-color-slider--border-left` and its corners with the four documented `--c2-color-slider--border-*-radius` variables:

```css
c2-color-slider {
  --c2-color-slider--border-left: 2px solid #b1b1b1;
  --c2-color-slider--border-top-left-radius: 12px;
}
```

Migration: `--c2-color-slider--borde-leftr` never reached the rendered left border. Replace it with `--c2-color-slider--border-left`; the misspelled name has no alias. The previously documented `--c2-color-slider--border-radius` shorthand was also inert and has been removed; use the four corner variables instead. See the [feature migration record](../../../specs/004-verify-css-contracts/migration.md).
