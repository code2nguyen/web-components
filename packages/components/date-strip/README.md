# Date Strip

`c2-date-strip` ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/date-strip'
```

```html
<c2-date-strip value="2026-10-14" markers='["2026-10-16"]'></c2-date-strip>
```

A row of days to pick one from, a week at a time, with dots on the days that have something on them. The value is
`YYYY-MM-DD` in the local calendar.

- `days` (7 by default, starting on the locale's first day of the week) and `start` set the days shown.
- `min` / `max` disable days and stop the paging; `disabled-dates` turns off single days; `markers` lists the days with a dot and an optional label.
- `range-change` fires with the days shown after paging.
- A form control: `name`, `required`, reset and `c2-form-field` support.
- Themed through `--c2-date-strip*` custom properties; see the API page of the docs site.
