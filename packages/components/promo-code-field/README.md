# Promo Code Field

`c2-promo-code-field` ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/promo-code-field'
```

```html
<c2-promo-code-field max="2"></c2-promo-code-field>
```

Apply a promo code with checking and refusal states; applied codes stay as removable tokens with their saving.

- `validate` (an async function) asks the app's server and answers `{ code, label }` or `{ error }`.
- `codes`, `max`, `collapsed` and `case-sensitive`; `apply`, `remove` and `reject` events.
- Themed through `--c2-promo-code-field*` custom properties; see the API page of the docs site.
