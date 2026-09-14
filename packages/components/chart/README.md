# @c2n/chart

Line, area, bar, sparkline and pie charts as custom elements, from one package.

```bash
npm install @c2n/chart uplot     # line, area, bar, sparkline
npm install @c2n/chart echarts   # pie
```

```html
<c2-line-chart x-field="month" legend="bottom" data='[{ "month": 1, "revenue": 128, "cost": 74 }]'>
  <c2-chart-series field="revenue" label="Revenue"></c2-chart-series>
  <c2-chart-series field="cost" label="Cost"></c2-chart-series>
</c2-line-chart>
```

```js
import '@c2n/chart/line-chart.js' // one tag
import '@c2n/chart' // all of them
```

## Elements

| Tag               | Engine  | For                                             |
| ----------------- | ------- | ----------------------------------------------- |
| `c2-line-chart`   | uPlot   | Time or numeric trends                          |
| `c2-area-chart`   | uPlot   | The same, with the region under the line filled |
| `c2-bar-chart`    | uPlot   | Categorical or time-bucketed values             |
| `c2-sparkline`    | uPlot   | A chromeless trend for a table cell or KPI row  |
| `c2-pie-chart`    | ECharts | Parts of a whole, with a donut mode             |
| `c2-chart-series` | —       | A series definition; renders nothing            |

## Engines

Both libraries are **optional peer dependencies** loaded through a dynamic `import()` on first paint, so
nothing is bundled into the package and a page that only shows a sparkline never downloads ECharts. Install
whichever engines your charts need.

## Data

`data` accepts row objects, a bare `number[]`, columnar `[xs, ys…]`, or an already-normalised frame.
Internally everything becomes one columnar frame of `Float64Array`s, which is the shape uPlot draws
natively and what makes appending O(1).

```js
chart.data = rows // full replace
chart.revision++ // after mutating the array in place
chart.appendPoint(x, [a, b]) // one realtime tick
```

`data` is compared by **identity**, never deep-diffed. A change to `data` or `revision` alone is pushed
straight into the engine — Lit does not render, and the canvas container is not touched — so a streaming
tick costs one engine redraw and nothing else. Anything else counts as presentation and rebuilds the engine
options. Use `max-points` to keep a bounded window.

For a lazy or streaming source, set `dataSource` instead: `getWindow()` is the pull half, and an optional
`subscribe()` feeds ticks straight into the append path.

## Sizing

A canvas has no intrinsic size, so a chart is sized by its host: `--c2-chart--height` (320px, or 32px on a
sparkline) plus whatever width the layout gives it. A `ResizeObserver` keeps the canvas in step, and the
plot box is `contain: strict` so a resize cannot feed back into itself.

## Theming

Every element shares the `--c2-chart__*` namespace, so theming once themes them all. The palette is
`--c2-chart__series-1--color` … `--c2-chart__series-8--color`, wired by `@c2n/theme` to the
`--c2-theme--chart-series-*` tokens, which carry light and dark values.

Because the plot is a canvas, these variables are resolved with `getComputedStyle` and handed to the
engine. They behave like any other CSS variable — including under a dark theme, which the element watches
for — but the marks cannot be reached with `::part()`. The chrome around the plot (legend, tooltip, state
messages) is ordinary DOM and does expose parts.

## Events

`chart-ready`, `chart-error`, `point-click`, `point-hover`, `range-change` and `series-toggle`. The
semantic ones do not bubble: several components fire similarly named events, so a listener belongs on the
element itself. The host also carries `data-chart-ready` once the first frame is drawn, which is the
signal to wait on in a test.
