# Quick Time Menu

`c2-quick-time-menu` ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/quick-time-menu'
```

```html
<c2-quick-time-menu label="Snooze until" name="snooze"></c2-quick-time-menu>
```

A menu of quick times (Later today, This evening, Tomorrow, This weekend, Next week), each showing the time it falls at, plus "Pick a date and time…" for anything else.

- `presets` replaces the rows with `{ id, label, at }`, where `at` is a function or an expression: `+3h`, `tomorrow 09:00`, `next monday 09:00`, `friday 17:00`, `end of day`.
- The value is a wall-clock `YYYY-MM-DDTHH:mm` in `time-zone`; `valueAsDate` is the instant. A pick fires `input`, `change` and `time-select`.
- A form control with `name`, `required` and `c2-form-field` support; `inline` draws the list without a trigger.
- `resolveQuickTime()` and `formatQuickTime()` are exported for server-side use and tests.
- The trigger, menu and rows are styled through `--c2-quick-time-menu*` custom properties; see the API page of the docs site.
