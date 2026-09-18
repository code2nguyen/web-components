# @c2n/dashboard

A grid of resizable panes: `c2-dashboard` owns the tracks, `c2-dash-card` owns one pane of them.

A pane draws a handle on every edge it shares with a neighbour. Dragging one resizes the **track**, not the pane, so
everything on either side of it stays aligned; the first drag switches that track to pixels and the `fr` tracks
around it give up the space in proportion to their weight, down to the minimums. A handle is a window splitter: it
is in the tab order, and the arrow keys move it 10px a step, 1px with Shift.

A pane has no surface of its own — put a `c2-card`, or any markup, in it.

```bash
npm install @c2n/dashboard
```

## Markup

```html
<script type="module">
  import '@c2n/dashboard'
</script>

<c2-dashboard columns="320px 1fr" rows="1fr 1fr" storage-key="trading-desk" style="height: 480px">
  <c2-dash-card col="1" row="1" row-span="2" min-width="240">
    <span slot="header">Watchlist</span>
    <c2-card>…</c2-card>
  </c2-dash-card>

  <c2-dash-card col="2" row="1" min-height="120" expand-full>
    <span slot="header">Price</span>
    <c2-line-chart></c2-line-chart>
  </c2-dash-card>

  <c2-dash-card col="2" row="2">
    <span slot="header">Orders</span>
    <c2-table></c2-table>
  </c2-dash-card>
</c2-dashboard>
```

`columns` and `rows` take a track count (`columns="3"`) or an explicit list (`columns="320px 1fr"`). The grid needs a
height whenever its rows use `fr`, since the row tracks divide the host's height.

## Layout

```js
const grid = document.querySelector('c2-dashboard')

// The sizes at the end of every gesture — also what `storage-key` writes to localStorage.
grid.addEventListener('layout-change', (event) => {
  console.log(event.detail.columns, event.detail.rows)
})

// Placement chosen at runtime, keyed by each card's `card-id`; every field wins over the card's own attributes.
grid.layout = {
  watchlist: { col: 1, row: 1, rowSpan: 2 },
  orders: { visible: false },
}

grid.reset() // back to the authored tracks, and the stored ones are forgotten
```

## Expanding

`expand-width`, `expand-height` and `expand-full` add controls that grow a pane over the whole row, column or grid.
They move into the header row when the `header` or `actions` slot is filled, and float over the top-right corner
when neither is. The state is the `expanded` property (`none` | `width` | `height` | `full`), so an app can drive it
from its own button, and `expand-change` reports it.

The controls are not a closed set. `actions` puts your own buttons at the end of the header row, `controls` puts
them inside the built-in group immediately before the expand buttons, `footer` adds a status row under the content,
and every built-in icon is a slot whose fallback is the default drawing:

```html
<c2-dash-card col="2" row="1" expand-full>
  <span slot="header">Price</span>
  <c2-badge slot="actions" tone="success">Live</c2-badge>
  <c2-icon-button slot="controls" aria-label="Order settings">…</c2-icon-button>
  <c2-feather-maximize slot="expand-full-icon"></c2-feather-maximize>
  <c2-feather-minimize slot="collapse-full-icon"></c2-feather-minimize>
  <c2-line-chart></c2-line-chart>
  <span slot="footer">updated 14:32</span>
</c2-dash-card>
```

An expanded pane covers its neighbours, so give it a background:

```css
c2-dash-card {
  --c2-dash-card--background: #ffffff;
  --c2-dash-card__expanded--background: #ffffff;
}
```

## Theming

Everything visible is a CSS custom property — the gutter (`--c2-dashboard--gap`), the pane surface
(`--c2-dash-card--background`, `--c2-dash-card--border`, `--c2-dash-card--border-radius`), the header row
(`--c2-dash-card__header--*`), the expand controls (`--c2-dash-card__control--*`) and the handles
(`--c2-dash-card__handle--size`, `--c2-dash-card__handle__hover--background`). See the component page for the
complete table.
