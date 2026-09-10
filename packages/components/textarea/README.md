# @c2n/textarea

Multiline Lit input with native resizing, helper and error text, character counting, and CSS custom properties.

```sh
npm install @c2n/textarea
```

```js
import '@c2n/textarea'
```

```html
<c2-textarea label="Message" name="message" rows="4" maxlength="500" placeholder="Write a message…"></c2-textarea>
```

Read `value` on `input` or `change`; set the property to update text. Use `disabled`, `readonly`, `required`, `minlength`, `maxlength`, and `resize="none|vertical|horizontal|both"`. `help` and the `supporting-text` slot provide guidance; `error` with `error-text` displays feedback. Call `focus()`, `blur()`, `select()`, `setSelectionRange()`, `reset()`, `checkValidity()`, `reportValidity()`, or `setCustomValidity()` as needed. Await `updateComplete` after property changes before calling native methods.

This component does not automatically participate in enclosing form submission or reset. Read its value and reset it explicitly in your form handlers.
