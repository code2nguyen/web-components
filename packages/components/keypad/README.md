# Keypad

`c2-keypad` is a phone-style numeric keypad. With `display="amount"` it types an amount, formatted for the language and an optional `currency`. With `display="pin"` it fills `length` dots and fires `complete`. With `display="none"` and `for` set to a field's id, it types into that field. The bottom left key is the decimal point, or the `start` slot (a biometric button) when there is none. It is a form control and takes part in `c2-form-field`.

It ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/keypad'
```

```html
<c2-keypad label="Amount to send" currency="USD"></c2-keypad> <c2-keypad display="pin" length="6"></c2-keypad>
```

- Attributes: `display` (`amount` | `pin` | `none`), `value`, `length`, `decimals`, `max-length`, `currency`, `for`, `name`, `required`, `disabled`, `label`. Method: `clear()`.
- Events: `input` and `change` per key that changes the value; `complete` (`detail.value`) when a PIN is full.
- Slot: `start`, the bottom left key when there is no decimal key.
- Styling: `--c2-keypad--width` and the key, display and dot variables listed on the API tab.
