# @c2n/rate

`<c2-rate>` is an accessible, form-associated star rating input with pointer preview, keyboard control and optional half-star values.

```bash
npm install @c2n/rate
```

```html
<c2-rate name="score" aria-label="Product rating" value="3.5" allow-half required></c2-rate>
```

```js
import '@c2n/rate'

document.querySelector('c2-rate').addEventListener('rate-change', (event) => {
  console.log(event.detail.value)
})
```

Use `readonly` to display a score without interaction, `disabled` to exclude it from form submission, and `clearable` to let users reset the rating by selecting the current value again.
