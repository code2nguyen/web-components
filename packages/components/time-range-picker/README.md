# Time Range Picker

`c2-time-range-picker` ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/time-range-picker'
```

```html
<c2-time-range-picker nav from="now-6h" refresh-intervals="10s 30s 1m 5m"></c2-time-range-picker>
```

The time range control of a dashboard: searchable quick ranges, an absolute range typed or picked on a calendar,
recently used ranges and the time zone in its popup; `nav` adds shift and zoom-out buttons and `refresh-intervals` an
auto-refresh control. `from` and `to` take Grafana-style expressions (`now-15m`, `now/d`, `now-1d/d`), dates
(`2026-10-20`) or wall clocks read in `time-zone` (`2026-10-20T09:00`), so a range round-trips through a URL as written.

- `change` — a range was applied; `detail` is `{ from, to, timeZone }`.
- `refresh` — the refresh button or an auto-refresh tick; `detail` is the resolved `{ from: Date, to: Date }`.
- `refresh-interval-change` — an auto-refresh interval was chosen; `detail.value` is empty when off.

`resolve()`, `fromDate` and `toDate` give the instants; `resolveTime` and `resolveRange` are exported for code that reads
a range from a URL. The full API, with every `--c2-time-range-picker__*` variable, is on the docs site.
