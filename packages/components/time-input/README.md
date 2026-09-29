# Time Input

A form-associated, themeable time-of-day input for Lit applications.

```bash
npm install @c2n/time-input
```

```html
<c2-time-input name="start" value="09:30" min="09:00" max="17:00" step="900" required aria-label="Start time"></c2-time-input>
```

The clock button, or Alt+ArrowDown in the field, opens a themeable picker: a readout of the chosen time over scroll-snapping hour, minute (and seconds when `step` is below 60, AM/PM on 12-hour locales) columns. The columns follow `step`, and times outside `min`/`max` are dimmed. Style it through the `--c2-time-input__picker*` variables.
