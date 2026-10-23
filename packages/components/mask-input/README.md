# Mask Input

`c2-mask-input` is a text input that fits what is typed to a pattern: postcodes, IBANs, tax IDs, card expiry dates. It ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/mask-input'
```

```html
<c2-mask-input mask="AA99 XXXX XXXX XXXX ?XXXX XXXX XXXX XXXX XX" name="iban" placeholder="IBAN"></c2-mask-input>
<c2-mask-input mask="99/99" placeholder="MM/YY" include-literals></c2-mask-input>
```

Mask characters: `9` digit, `a` letter, `A` upper-case letter, `*` letter or digit, `X` upper-case letter or digit. Any other character is a literal; `\` escapes a mask character, `?` makes the rest of the mask optional and `[` `]` wrap an optional group anywhere in the mask (`A[A]9[X] 9AA`, a UK postcode; `\[` is a literal bracket). `tokens` adds characters of your own from script.

`value` holds the typed characters only (or the formatted text with `include-literals`), and the form submits the same. An incomplete value is invalid; `complete` fires when the last required position is filled. `formatMask(text, mask)` and `unmask(text, mask)` are exported for use outside the field.

The full API (attributes, slots, events and CSS custom properties) is in the generated `custom-elements.json` and on the docs site.
