# Time Slot Picker

`c2-time-slot-picker` ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/time-slot-picker'
```

```html
<c2-time-slot-picker time-zone="Europe/Paris" slots='[{"start":"2026-11-02T09:00:00+01:00"},{"start":"2026-11-02T14:00:00+01:00"}]'></c2-time-slot-picker>
```

Pick a free time from someone's calendar, like the booking step of Calendly: a row of days (a `c2-date-strip`), then
the day's times grouped into morning, afternoon and evening.

- `slots` lists `{ start, end?, available?, label? }`; times show and file under their day in `time-zone`.
- The value is the picked slot's `start`. `date-change` and `range-change` tell an app which days are shown, and
  `loading` shows placeholder times while it loads them.
- A form control: `name`, `required`, reset and `c2-form-field` support.
- Themed through `--c2-time-slot-picker*` custom properties; see the API page of the docs site.
