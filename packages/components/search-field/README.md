# Search Field

`c2-search-field` is a search box: a debounced `search` event while typing, Enter to search at once, a clear button (and Escape), a keyboard shortcut with its hint, and recent searches under the field. It ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/search-field'
```

```html
<c2-search-field placeholder="Search issues" shortcut="mod+k" history-key="issues"></c2-search-field>
```

```js
document.querySelector('c2-search-field').addEventListener('search', (event) => {
  // event.detail: { value, trigger: 'input' | 'submit' | 'recent' | 'clear' }
})
```

- Attributes: `value`, `placeholder`, `aria-label`, `name`, `disabled`, `loading`, `debounce` (ms, default 300), `shortcut` (`mod+k`, `/`, `/, mod+k`), `recent` (semicolon-separated), `history-key`, `recent-limit` (default 5), `recent-label`.
- Methods: `focus()`, `blur()`, `select()`, `clear()`, `clearRecent()`.
- Slots: `search-icon`, `clear-icon`, `suffix-icon`, `recent-icon`.
- Events: `search` (`detail: { value, trigger }`, does not bubble), `clear`, `recent-change` (`detail: { recent }`, does not bubble), and `input` / `change` re-dispatched from the inner input.
- States: `:state(focus-within)`, `:state(expanded)`, `:state(loading)`, `:state(disabled)`.
- Theming: `--c2-search-field--*` for the box, plus `__hover`, `__focus`, `__placeholder`, `__disabled`, `__icon`, `__clear-icon`, `__spinner`, `__shortcut`, `__panel`, `__header`, `__option` and `__highlight`.
