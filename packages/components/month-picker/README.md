# Month Picker

`c2-month-picker` ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/month-picker'
```

```html
<c2-month-picker name="period" value="2026-09" max="2026-10"></c2-month-picker>
```

Pick a month, or a year: billing periods, reports and card expiry. The value is `YYYY-MM`, as an `<input type="month">`
gives, or `YYYY` with `granularity="year"`.

- `min` / `max` disable the months outside them and stop the paging.
- The title opens a grid of years; `granularity="year"` picks a year.
- A form control: `name`, `required`, reset and `c2-form-field` support. Month names follow the page's language.
- Themed through `--c2-month-picker*` custom properties; see the API page of the docs site.
