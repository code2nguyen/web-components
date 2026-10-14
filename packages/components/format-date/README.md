# Format Date

`c2-format-date` ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/format-date'
```

```html
<p>Published <c2-format-date date-style="long" date="2026-10-14T15:05:09Z"></c2-format-date></p>
<p>
  Starts
  <c2-format-date weekday="short" hour="numeric" minute="2-digit" time-zone="Europe/Paris" time-zone-name="short" date="2026-10-14T15:05:09Z"></c2-format-date>
</p>
<p>Due: <c2-format-date>No date</c2-format-date></p>
```

Formats a date with `Intl.DateTimeFormat` in the reader's language and, optionally, a fixed time zone. The text sits in a `<time>` element whose `datetime` is the exact instant.

| Attribute                                                            | Description                                                                               |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `date`                                                               | ISO 8601 string or millisecond timestamp; a `Date` as a property.                         |
| `date-style`, `time-style`                                           | Preset lengths: `full`, `long`, `medium`, `short`. They win over the individual fields.   |
| `weekday`, `era`, `year`, `month`, `day`, `hour`, `minute`, `second` | Individual fields, as `Intl.DateTimeFormat` names their values. With none, `medium` date. |
| `time-zone-name`                                                     | `short`, `long`, `shortOffset`, `longOffset`, `shortGeneric` or `longGeneric`.            |
| `time-zone`                                                          | IANA time zone (`UTC`, `Asia/Ho_Chi_Minh`). Empty uses the reader's zone.                 |
| `hour-format`                                                        | `auto` (default), `12` or `24`.                                                           |
| `locale`                                                             | BCP 47 locale. Empty uses the nearest `lang` attribute, then the browser's language.      |

The default slot is shown while `date` is unset or invalid. Style it with `--c2-format-date--{color,font-size,font-weight,font-variant-numeric,white-space}`; `formatDate(date, options)` is exported for use outside the element.
