# Angle Slider

`c2-angle-slider` is a round knob. In `angle` mode it picks a direction on a full circle (0 at the top, clockwise). In `arc` mode it picks a value between `min` and `max` along an open arc, like a thermostat or a volume dial. Drag the handle, press anywhere on the dial, or use the arrow, Page and Home/End keys. It is a form control and takes part in `c2-form-field`.

It ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/angle-slider'
```

```html
<c2-angle-slider label="Gradient angle" value="135" step="15"></c2-angle-slider>
<c2-angle-slider label="Volume" mode="arc" min="0" max="100" value="60"></c2-angle-slider>
```

- Attributes: `mode` (`angle` | `arc`), `value`, `min`, `max`, `step`, `name`, `disabled`, `label`. The `formatValue` property formats the value for the middle of the dial and for screen readers.
- Events: `input` while the value changes, `change` when it is committed.
- Slot: the default slot replaces the value in the middle.
- Styling: `--c2-angle-slider--size`, `--c2-angle-slider__arc--sweep` (degrees), and the track, fill, needle, thumb and value variables listed on the API tab.
