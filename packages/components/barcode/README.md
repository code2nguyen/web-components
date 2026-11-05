# Barcode

`c2-barcode` ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/barcode'
```

```html
<c2-barcode format="ean13" value="400638133393"></c2-barcode>
```

A 1D or 2D barcode drawn as SVG, encoded in the browser with no dependency.

- `format` is `code128` (the default), `ean13`, `ean8`, `upca`, `code39` or `datamatrix`; EAN and UPC check digits are added or verified.
- The value prints under a 1D code in the split each standard uses; `hide-text` leaves it out.
- A value the format cannot take draws a dashed frame and fires `barcode-error`.
- Module size, height, quiet zone and colours are `--c2-barcode*` custom properties; see the API page of the docs site.
