# Money Input

A form-associated currency amount field: groups digits as you type, follows the locale's separators and symbol position, and stores the amount as an integer count of minor units.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/money-input'
```

```html
<c2-money-input name="amount" currency="EUR" locale="de-DE" value="123456" aria-label="Betrag"></c2-money-input>
<!-- shows 1.234,56 € and submits amount=123456 -->

<c2-money-input name="payout" currency-name="currency" currencies="USD;EUR;GBP" value="250000" aria-label="Payout"></c2-money-input>
```
