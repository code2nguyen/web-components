# Relative Time

`c2-relative-time` ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/relative-time'
```

```html
<p>Edited <c2-relative-time date="2026-09-30T14:20:00Z"></c2-relative-time></p>
<p>Last login: <c2-relative-time>Never</c2-relative-time></p>
```

Phrases a moment relative to now ("3 minutes ago", "in 2 days", "yesterday") with `Intl.RelativeTimeFormat` and redraws itself exactly when the rounded value changes. The full date and time is the hover title of the inner `<time>`.

| Attribute   | Description                                                                          |
| ----------- | ------------------------------------------------------------------------------------ |
| `date`      | ISO 8601 string or millisecond timestamp; a `Date` as a property.                    |
| `format`    | `long` (default), `short` or `narrow`.                                               |
| `numeric`   | `auto` (default; "yesterday", "now") or `always` ("1 day ago").                      |
| `locale`    | BCP 47 locale. Empty uses the nearest `lang` attribute, then the browser's language. |
| `no-update` | Draw the phrase once and stop updating it.                                           |

The default slot is shown while `date` is unset or invalid. Style it with `--c2-relative-time--{color,font-size,font-weight,font-variant-numeric,white-space}`; `formatRelativeTime(date, now, options)` is exported for use outside the element.
