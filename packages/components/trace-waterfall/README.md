# Trace Waterfall

`c2-trace-waterfall` ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/trace-waterfall'
```

```html
<c2-trace-waterfall
  label="Checkout trace"
  spans='[{"id":"a","name":"POST /checkout","service":"web","start":0,"duration":842},
          {"id":"b","parentId":"a","name":"SELECT cart_items","service":"postgres","start":56,"duration":71},
          {"id":"c","parentId":"a","name":"payments.charge","service":"payments","start":182,"duration":512,"status":"error"}]'
></c2-trace-waterfall>
```

The spans of one distributed trace as a tree, each with a duration bar on a shared time axis.

- `spans` — `{ id, parentId?, name, service?, start, duration | end, status? }[]`, as a property or a JSON attribute. A span whose parent is missing is drawn as a root.
- `time-unit` — unit of the times: `ms` (default), `s`, `us` or `ns` (OpenTelemetry `startTimeUnixNano`, numeric strings accepted). Absolute and relative times both work; the axis starts at the earliest span.
- `selected` — `id` of the selected span. Clicking a span (or Enter/Space) selects it and fires `selection-change` with `{ id, span }`.
- `search` — highlights spans whose name or service contains the text, dims the rest and opens the spans above each match.
- `expandAll()` / `collapseAll()`; `expansion-change` fires with `{ id, expanded }` when the user toggles a span.
- Bars are coloured per service through `--c2-trace-waterfall__series-1--color` … `__series-8--color` (the `@c2n/theme` chart series tokens); failed spans use `--c2-trace-waterfall__bar__error--background`.

See the docs site for the full list of CSS custom properties and parts.
