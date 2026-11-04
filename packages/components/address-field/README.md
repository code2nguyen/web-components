# Address Field

`c2-address-field` ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/address-field'
```

```html
<c2-address-field name="shipping"></c2-address-field>
```

A postal address input with the parts, order and labels of each country.

- About 40 country formats, with labels, required parts, postal-code patterns and region lists; a general format for the rest.
- A form control: the form receives `name[line1]`, `name[city]`, … and `name[country]`; each part shows its own message.
- An optional `provider` suggests addresses on the first line; `@c2n/components/address-field/providers/google.js` and `/providers/mapbox.js` wrap Google Places and Mapbox.
- `formatAddress()` prints an address in the country's postal order.
- Gaps and wrapping are `--c2-address-field*` custom properties; see the API page of the docs site.
