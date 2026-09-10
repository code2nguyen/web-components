# @c2n/slider

Slider built with Lit on a native `<input type="range">`: the browser handles dragging, keyboard steps, RTL and the `slider` role; the component draws a themeable track, fill, thumb, step ticks and a value bubble.

```bash
npm install @c2n/slider
```

```html
<script type="module">
  import '@c2n/slider'
</script>

<c2-slider value="40" aria-label="Volume"></c2-slider>
<c2-slider min="0" max="10" step="1" value="6" ticks show-value aria-label="Rating"></c2-slider>
<c2-slider orientation="vertical" value="70" aria-label="Level"></c2-slider>
```

- **Value**: `value`, `min`, `max` and `step` mirror the native input; `value` reflects and is snapped by the browser. `input` fires on every step of a drag, `change` when the value is committed.
- **Bubble**: `show-value` shows the value above the thumb while hovering, dragging or focused; `--c2-slider__value--opacity: 1` keeps it always on. Set the `formatValue` property (`(v) => \`${v}%\``) to format both the bubble and `aria-valuetext`.
- **Ticks**: `ticks` draws a mark for every `step` (up to 200), coloured differently on the filled part.
- **Orientation**: `orientation="vertical"` turns the track upright; its length is `--c2-slider__container--length`. Horizontal sliders fill their width.
- **Accessibility**: label it with `aria-label` or `aria-labelledby`; Arrow keys, Page Up/Down, Home and End work natively.

Theme the track (`--c2-slider__track--*`, `--c2-slider__fill--color`), the thumb (`--c2-slider__thumb--*`, with hover and active halos and a focus ring), the ticks and the bubble. The full list is in `custom-elements.json` and on the docs site.
