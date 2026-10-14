# Highlight

`c2-highlight` marks the parts of its text that match a query, the way a search result list, a command palette or a
filtered table shows why a row matched. It ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/highlight'
```

```html
<c2-highlight query="apple">Apple pie, apple tart and pineapple crumble.</c2-highlight>
```

- `query` — the text to mark. Assign an array to the property to mark several terms.
- `match-case`, `ignore-accents`, `whole-word`, `words` — how the query is compared.
- `active-index` — the match drawn as the current one, for a find bar.
- `matchCount`, the `match-change` event and `:state(matched)` report how many matches there are.
- Style the marks with the `--c2-highlight__mark--*` and `--c2-highlight__mark__active--*` variables.

The matcher is exported as `findMatches(text, query, options)`, so a list can filter with the same rules it highlights
with.
