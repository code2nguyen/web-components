# Order Book

`c2-order-book` ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/order-book'
```

```html
<c2-order-book base="BTC" quote="USD" groups="0.5;1;10" bids="[[64210.25, 0.41], [64209.75, 0.18]]" asks="[[64210.75, 2.94], [64211.25, 1.66]]"></c2-order-book>
```

Live bids and asks with depth bars, price grouping and a spread row, for a trading screen.

- `bids` / `asks` take a snapshot (`{ price, size }` or `[price, size]`); `applyDelta()` patches it from a stream.
- `layout="stacked"` or `"split"`, `depth` levels a side, `group` / `groups` price steps, `last-price`, `own-prices`.
- Levels flash when their size changes; `price-select` fires on a click or Enter.
- Themed through `--c2-order-book*` custom properties; see the API page of the docs site.
