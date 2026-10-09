# Query Input

`c2-query-input` is a `key:value` query field, the search bar of Datadog, GitHub and Sentry. Each standalone `key:value` term is a `c2-chip`: click it to switch it off and on (an off chip stays visible but is left out of the query), and use its cross to remove it. The text is coloured as it is typed, the keys listed in `fields` are suggested while a word is typed, and their values right after `key:`. Enter fires `search` with the query and its parsed terms. It ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/query-input'
```

```html
<c2-query-input
  placeholder="service:web -status:>=500"
  fields='[{"key":"service","values":["web","api"]},{"key":"status","values":["ok","error"]}]'
></c2-query-input>
```

```js
const field = document.querySelector('c2-query-input')
field.addEventListener('search', (event) => {
  // event.detail: { value, terms: [{ key, value, negated, comparator, quoted, start, end }], trigger }
  runQuery(event.detail.terms)
})
```

- **Syntax:** `key:value`, `-key:value` / `!key:value` (negated), `key:>=500` (comparators `>`, `>=`, `<`, `<=`, `=`), `"quoted phrase"`, `key:"quoted value"`, `AND` / `OR` / `NOT` and parentheses. `tokenizeQuery`, `parseQuery` and `splitQueryFilters` are exported for use outside the element.
- **Attributes:** `value`, `placeholder`, `aria-label`, `name` (form-associated), `disabled`, `fields` (JSON), `suggestion-limit`, `fields-label`.
- **Chips:** a term becomes a chip when its value is picked, on Enter, on blur and when `value` is set; terms joined by `AND`/`OR`, after `NOT` or in parentheses stay text. Backspace at the start of the text edits the last chip. `filters` lists every chip with `active`.
- **Events:** `input`, `change`, `search` (Enter, a chip switched or removed, or cleared), `suggest` (the key or value the caret is completing changed, for values fetched on demand), `clear`.
- **Slots:** `search-icon`, `clear-icon`, `suffix-icon`.
- **States:** `:state(focus-within)`, `:state(expanded)`, `:state(invalid)` (unknown key or unterminated quote), `:state(disabled)`.

Styling is through `--c2-query-input…` custom properties: the box, the chips (`__filter--*`), the token colours (`__key--color`, `__value--color`, `__comparator--color`, `__operator--color`, `__negation--color`, `__invalid--color`, …) and the suggestions panel. The full list is in `custom-elements.json` and on the docs site.
