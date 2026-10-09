# State Timeline

`c2-state-timeline` draws one band per series, coloured by the discrete state it was in over time: service health,
CI runs by branch, a host's power state. It ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/state-timeline'
```

```html
<c2-state-timeline
  aria-label="Service health"
  end="2026-10-08T12:00:00Z"
  states='[{"value":"ok","label":"Operational","tone":"success","baseline":true},{"value":"down","label":"Outage","tone":"danger"}]'
  series='[{"label":"API","segments":[{"start":"2026-10-08T09:00:00Z","state":"ok"},{"start":"2026-10-08T10:15:00Z","state":"down"},{"start":"2026-10-08T10:35:00Z","state":"ok"}]}]'
></c2-state-timeline>
```

- `series` — the bands: `{ id?, label, segments: [{ start, end?, state }] }`. A segment without an `end` lasts until
  the next one starts; the last one runs to the end of the timeline. A `null` state is a stretch with no data.
- `states` — `{ value, label?, tone?, baseline? }` per value, in legend order. `tone` is `primary`, `success`, `warning`,
  `danger`, `neutral` or a chart palette slot `1`–`8`; unlisted values get the next free palette colour. The `baseline`
  state is a pale, unlabelled wash; the others are solid, labelled fills, and each band ends with its time outside the
  baseline.
- `markers` — `{ time, label }` pins above the bands (deploys, incidents); the `heading` slot titles the header row.
- `start` / `end` — the visible range (milliseconds or ISO strings); the span of the data by default.
- `hide-axis`, `hide-legend`, `hide-summary`, `locale`, and the `renderTooltip` property, which receives the hovered
  moment with every band's state at that time.
- Events: `segment-click` (click, Enter or Space) and `segment-hover`.

Every visual detail is a `--c2-state-timeline__*` custom property; see the API page of the docs site.
