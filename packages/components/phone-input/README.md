# Phone Input

`c2-phone-input` is a phone number field with a searchable country picker (flag and calling code), as-you-type grouping in the country's usual layout, and a value in E.164 (`+33612345678`). It ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/phone-input'
```

```html
<c2-phone-input name="phone" country="FR" preferred-countries="FR;BE;CH" required></c2-phone-input>
```

- `value` is the E.164 number. Setting or typing a value that starts with `+` picks its country; a value without `+` is a national number of the selected country.
- `country` is the ISO code used while there is no value (default: the region of `locale` or the browser, then `US`). `countries` restricts the picker, `preferred-countries` pins a few at the top.
- Form-associated: submits under `name`; `required` and the country's allowed lengths drive `validity`. `valid`, `dialCode` and `nationalNumber` are available from script.
- Events: `input` and `change` from the number field, `country-change` (`{ country, dialCode }`, does not bubble).

See the documentation site for the full API and the `--c2-phone-input*` CSS custom properties.
