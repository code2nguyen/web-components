# Wheel Picker

`c2-wheel-picker` ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/wheel-picker'
```

```html
<c2-wheel-picker
  label="Height"
  value="5;10"
  columns='[{"label":"Feet","suffix":"ft","options":["4","5","6","7"]},{"label":"Inches","suffix":"in","options":["0","1","2","3","4","5","6","7","8","9","10","11"]}]'
></c2-wheel-picker>
```

iOS-style scroll wheels: each column scrolls and snaps, and the row in the band across the middle is its value.

- `columns` lists the wheels (`options`, `label`, `suffix`); `options` alone is one wheel. `value` holds one value per wheel, `;`-separated as an attribute.
- Swipe, scroll, click or keys (each wheel is a spin button) turn a wheel; `input` and `change` follow. Disabled rows are skipped.
- A form control: the form receives the values joined by `;`, and it takes part in `c2-form-field`.
- Themed through `--c2-wheel-picker*` custom properties (rows shown, row height, band); see the API page of the docs site.
