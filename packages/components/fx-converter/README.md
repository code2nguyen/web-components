# FX Converter

`c2-fx-converter` ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/fx-converter'
```

```html
<c2-fx-converter from="EUR" to="USD" currencies="EUR;USD;GBP" amount="100000" rate="1.0842" fee="413"></c2-fx-converter>
```

Two linked amount and currency fields: type what you send or what arrives, with the fee, a swap and a guaranteed rate.

- Amounts are integers in minor units, as in `c2-money-input`; only `rate` is a float.
- `fixed` says which side was typed; the other is computed and rounded to its currency's minor unit.
- `rate-expires` counts a guaranteed rate down; `swap`, `currency-change`, `rate-expire` and `rate-refresh` ask the app for a new quote.
- Themed through `--c2-fx-converter*` custom properties; see the API page of the docs site.
