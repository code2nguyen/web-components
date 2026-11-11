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

## Find bar

`c2-find-bar` is the find bar that drives them: a query field with a "2 of 7" count, previous and next, match case and
whole word toggles, an optional replace row and Escape to close. Point `for` at one `c2-highlight` or at an element
holding several; it sets their query and steps `active-index` through the matches across all of them.

```js
import '@c2n/components/highlight' // c2-highlight and c2-find-bar
```

```html
<c2-find-bar for="results" replace></c2-find-bar>
<ul id="results">
  <li><c2-highlight>Invoice #1042 sent</c2-highlight></li>
  <li><c2-highlight>Payment received for invoice #1039</c2-highlight></li>
</ul>
```

The bar never edits text: `replace` fires with the query, the replacement and the highlight holding the current match,
and the application changes its own text. `close` fires on Escape and the close button; hide the bar there.
