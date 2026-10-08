# Query Input

`c2-query-input` is a one-line `key:value` query field, the search bar of Datadog, GitHub and Sentry: the query is coloured as it is typed, the keys listed in `fields` are suggested while a word is typed, and their values right after `key:`. Enter fires `search` with the query and its parsed terms. It ships in the single `@c2n/components` package.

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

- **Syntax:** `key:value`, `-key:value` / `!key:value` (negated), `key:>=500` (comparators `>`, `>=`, `<`, `<=`, `=`), `"quoted phrase"`, `key:"quoted value"`, `AND` / `OR` / `NOT` and parentheses. `tokenizeQuery` and `parseQuery` are exported for use outside the element.
- **Attributes:** `value`, `placeholder`, `aria-label`, `name` (form-associated), `disabled`, `fields` (JSON), `suggestion-limit`, `fields-label`.
- **Events:** `input`, `change`, `search` (Enter, or cleared), `suggest` (the key or value the caret is completing changed, for values fetched on demand), `clear`.
- **Slots:** `search-icon`, `clear-icon`, `suffix-icon`.
- **States:** `:state(focus-within)`, `:state(expanded)`, `:state(invalid)` (unknown key or unterminated quote), `:state(disabled)`.

Styling is through `--c2-query-input…` custom properties: the box, the token colours (`__key--color`, `__value--color`, `__comparator--color`, `__operator--color`, `__negation--color`, `__invalid--color`, …) and the suggestions panel. The full list is in `custom-elements.json` and on the docs site.
