# Password Field

`c2-password-field` ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/password-field'
```

```html
<!-- Sign in -->
<c2-password-field name="password" placeholder="Password"></c2-password-field>

<!-- Sign up: strength meter and a requirements checklist -->
<c2-password-field name="password" autocomplete="new-password" meter requirements="length;uppercase;number;symbol" minlength="10"></c2-password-field>
```

A password input with a show/hide toggle (`revealed`, `reveal-change`, `hide-toggle`), an optional four-segment strength
meter (`meter`, `strength-labels`, `scorer`, `strength-change`), a requirements checklist (`requirements`: built-in
`length`, `lowercase`, `uppercase`, `number`, `symbol`, or `{ label, pattern | test }` objects from script) and a Caps
Lock warning. It is form-associated and validates `required`, `minlength`, `maxlength` and the requirements.
`scorePassword(value)` is exported for use outside the element.

Styling goes through the `--c2-password-field*` custom properties listed in `custom-elements.json`.
