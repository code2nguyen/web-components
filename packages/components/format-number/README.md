# Format Number

`c2-format-number` ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/format-number'
```

```html
<c2-format-number type="currency" currency="EUR" value="1234.5"></c2-format-number>
<c2-format-number notation="compact" value="1234567"></c2-format-number>
<c2-format-number type="bytes" value="1536000"></c2-format-number>
<c2-format-number>—</c2-format-number>
```

Formats a number with `Intl.NumberFormat` in the element's locale: grouping and decimals, currency, percent, units, compact notation and byte sizes scaled to the largest unit that fits. A shortened display (compact, bytes) carries the full figure as its hover title.

| Attribute                                                                   | Description                                                                                           |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `value`                                                                     | Number, or a numeric string in markup.                                                                |
| `type`                                                                      | `decimal` (default), `currency`, `percent`, `unit` or `bytes`.                                        |
| `notation`                                                                  | `standard` (default), `compact`, `scientific` or `engineering`; `compact-display` `short`/`long`.     |
| `currency`, `currency-display`, `currency-sign`                             | ISO 4217 code (`USD` default), `symbol`/`narrowSymbol`/`code`/`name`, `standard`/`accounting`.        |
| `unit`, `unit-display`                                                      | An `Intl` unit (`celsius`, `kilometer-per-hour`), or `byte`/`bit` for bytes; `short`/`narrow`/`long`. |
| `binary`                                                                    | Bytes in steps of 1024 instead of 1000.                                                               |
| `sign-display`                                                              | `auto`, `always`, `exceptZero`, `negative` or `never`.                                                |
| `no-grouping`                                                               | Drop the thousands separators.                                                                        |
| `minimum-integer-digits`, `{minimum,maximum}-{fraction,significant}-digits` | Digit limits, as in `Intl.NumberFormat`.                                                              |
| `locale`                                                                    | BCP 47 locale. Empty uses the nearest `lang` attribute, then the browser's language.                  |

The default slot is shown while `value` is unset or not a number. Style it with `--c2-format-number--{color,font-size,font-weight,font-variant-numeric,white-space}`, `--c2-format-number__{negative,positive}--color` and `--c2-format-number__unit--{color,font-size,font-weight}`; `formatNumber(value, options)` is exported for use outside the element.
