# Duration Input

`c2-duration-input` is a text field for an amount of time. It reads `1h 30m`, `90m`, `1.5h` (or `1,5h`), `1:30`,
`2 days 4 hours`, `1h30` or a bare `90` in `unit`, and stores the duration in seconds. It ships in the single
`@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/duration-input'
```

```html
<c2-duration-input name="estimate" aria-label="Estimate" value="5400" step="900"></c2-duration-input>
```

- **Value:** `value` is seconds, or `null` for none. The form receives the seconds under `name`. `min`, `max` and `step`
  are seconds too.
- **Display:** while typing, a preview after the text says how it was read (`= 1 hour, 30 minutes`). When the field is
  left, the text is rounded to `step` and rewritten in `format`:
  - `short`: `1h 30m` (the default);
  - `long`: `1 hour, 30 minutes`, in the element's language;
  - `clock`: `1:30`.
- **Units and calendar:** `largest-unit` and `smallest-unit` bound the units written. `day-hours` (default 24) and
  `week-days` (default 7) set how long `d` and `w` are.
- **Keyboard:** Arrow Up and Down add or remove one `step`, or one `unit` when there is no step.
- **Validation:** text that cannot be read sets `badInput`. Below `min` or above `max` sets the range flags, and
  `required` asks for a value. The message shows below the field once it has been left; inside a `c2-form-field`, the
  field shows it instead.
- **Events:** `input` while typing and `change` when the text is committed.
- **Exports:** `parseDuration(text, options)` and `formatDuration(seconds, options)`, for tables and APIs.

Every visible text and the words each unit accepts are translatable through `addTranslations` (`duration-input`).
