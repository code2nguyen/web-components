# Card Input

`c2-card-input` ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/card-input'
```

```html
<c2-card-input brands="visa;mastercard;amex"></c2-card-input>
```

Card number, expiry date and security code in one field, like Stripe Elements' card element.

- The number is spaced as its brand prints it, the brand shows as a text badge, and focus moves on as each part is
  complete (Luhn-checked). Each part has its `autocomplete` token.
- The number never leaves the element unless asked: `card-change` carries `{ brand, complete, error, last4 }`, and
  `getCardDetails()` returns the card for the payment provider's tokenize call.
- A form control: under a `name` the form receives `name[number]`, `name[expiry]` and `name[cvc]`; `required`, reset
  and `c2-form-field` support.
- Themed through `--c2-card-input*` custom properties; see the API page of the docs site.
