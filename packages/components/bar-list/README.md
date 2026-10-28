# Bar List

`c2-bar-list` ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/bar-list'
```

```html
<c2-bar-list items='[{"label":"Search","value":4620},{"label":"Direct","value":2710}]'></c2-bar-list>
```

A ranked list whose rows carry their own bar, like the top pages and referrers of Vercel Analytics and Plausible: each
row's background is a bar as long as its share of the largest value, with the label on it and the value at the end.

- `items`: an array (or JSON attribute) of `{ label, value, href, icon }`.
- `sort` (largest first by default), `max-items` (with a "Show all" button), `max` (a shared scale).
- `value-format`: `Intl.NumberFormat` options; `valueFormatter` for anything else.
- `diverging`: bars grow right or left from a centre line for positive and negative changes.
- `interactive`: rows without an `href` fire `item-select`.
- Themed through `--c2-bar-list*` custom properties; see the API page of the docs site.
