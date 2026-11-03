# Payment Card

`c2-payment-card` ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/payment-card'
```

```html
<c2-payment-card label="Marketing · Virtual" holder="Ada Lovelace" last4="4242"></c2-payment-card>
```

A company card face that stays masked until the reader asks, then shows each detail with a copy button.

- The full number never sits in an attribute: `reveal-request` asks the app, which sets the `details` property.
- Masks itself again after `hide-after` seconds, when the page is hidden, when frozen, and through `hide()`.
- `frozen`, a `brand` slot for the app's licensed logo, and an `actions` slot.
- Themed through `--c2-payment-card*` custom properties; see the API page of the docs site.
