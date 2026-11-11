# Recurrence Editor

`c2-recurrence-editor` edits how something repeats — "every 2 weeks on Monday and Wednesday, 10 times", "monthly on
the third Tuesday", "every weekday at 09:30" — with a sentence summary and the next occurrences. Its `value` is an
RFC 5545 RRULE, or a five-field cron expression with `format="cron"`. It ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/recurrence-editor'
```

```html
<c2-recurrence-editor name="repeat" start="2026-11-16" value="FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;COUNT=10"></c2-recurrence-editor>
<c2-recurrence-editor name="schedule" format="cron" value="30 9 * * 1-5"></c2-recurrence-editor>
```

- `value`: the rule, an RRULE (`RRULE:` prefix optional) or, with `format="cron"`, a cron expression; empty for "Does not repeat".
- `start`: the first occurrence (`YYYY-MM-DD` or `YYYY-MM-DDTHH:MM`), today by default.
- `frequencies`: the frequencies offered (`none minutely hourly daily weekly monthly yearly`).
- `week-start`, `with-time`, `preview-count`, `required`, `disabled`, `name`.
- `rule` (an object), `summary`, `cron`, `toRRule()`, `nextOccurrences()`; `renderOccurrence` draws each next date.
- The `footer` slot is an action zone for the app's own buttons. Events: `input`, `change`.
- `parseRRule`, `formatRRule`, `parseCron`, `formatCron`, `occurrences` and `describeRecurrence` are exported.

Every look is a `--c2-recurrence-editor…` CSS variable; every string is a message token of the `recurrence-editor`
catalog, translated with `addTranslations`. See the API tab of the docs for the full list.
