# Date Time Picker

A form-associated, themeable date-and-time field with a time zone, for Lit applications.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/date-time-picker'
```

```html
<c2-date-time-picker
  name="starts-at"
  time-zone-name="starts-at-zone"
  value="2026-10-14T09:30"
  time-zone="Europe/Paris"
  time-zones="Europe/Paris America/New_York Asia/Tokyo"
  step="900"
  aria-label="Starts at"
></c2-date-time-picker>
```

The value is a wall-clock `YYYY-MM-DDTHH:mm` string read in `time-zone` (empty: the browser's zone). `valueAsDate` and `valueAsISOString` give the instant it names. The calendar button, or Alt+ArrowDown in the field, opens a popup with a month calendar, a `c2-time-input` and, when `time-zones` lists several zones, a zone choice. Style it through the `--c2-date-time-picker__*` variables.
