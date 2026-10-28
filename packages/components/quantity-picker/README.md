# Quantity Picker

`c2-quantity-picker` and `c2-quantity` ship in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/quantity-picker'
```

```html
<c2-quantity-picker label="Guests" max-total="6">
  <c2-quantity name="adults" value="2" min="1" one="adult" other="adults">Adults</c2-quantity>
  <c2-quantity name="children" one="child" other="children">Children</c2-quantity>
</c2-quantity-picker>
```

Several labelled counters behind one summary ("2 adults, 1 child"), with limits per counter and in total.

- Each `c2-quantity` has `min`, `max`, `step` and the `one`/`other` nouns of the summary.
- `max-total`, `inline`, `placeholder` and a `summary` function; `values` and `total` to read.
- Themed through `--c2-quantity-picker*` and `--c2-quantity*` custom properties; see the API page of the docs site.
