# @c2n/json-viewer

A collapsible, searchable JSON tree. Every line can copy its path (JSONPath or JSON Pointer) or its value. It ships in the single `@c2n/components` package.

## Installation

```bash
npm install @c2n/components
```

## Usage

```html
<c2-json-viewer label="Order" data='{"id":"ord_8421","items":[{"sku":"KB-01","qty":1}]}'></c2-json-viewer>
```

```ts
import '@c2n/components/json-viewer'

const viewer = document.querySelector('c2-json-viewer')!
viewer.data = await (await fetch('/api/order/8421')).json()
viewer.search = 'sku' // highlight matches and open the branches leading to them
viewer.filter = true // hide the lines that lead to no match
await viewer.updateComplete
console.log(viewer.searchMatches) // ['$.items[0].sku']
viewer.addEventListener('copied', (event) => console.log(event.detail.kind, event.detail.text))
```

## API

- `data`: any JSON value. As an attribute it is parsed as JSON; a circular reference shows as `[Circular]`.
- `expand-depth` (default `2`): how many levels start open. Re-applied when `data` changes.
- `search`, `filter`: case-insensitive highlight of keys and values; `filter` also hides lines that lead to no match.
- `sort-keys`: alphabetical object keys.
- `path-format`: `jsonpath` (`$.items[0].sku`, default) or `pointer` (`/items/0/sku`).
- `page-size` (default `100`): children shown per branch before a "show more" line.
- `label`: accessible name of the tree (default `JSON`).
- `expandAll()`, `collapseAll()`; read-only `searchMatches`.
- Events: `copied` (`{ text, kind: 'path' | 'value', path }`), `copy-error`, `expansion-change` (`{ path, segments, expanded }`, does not bubble).
- Keyboard: arrows walk/open/close, Page Up/Down, Home/End, Enter/Space toggle, `*` opens all siblings, `C` (or Ctrl/Cmd + C) copies the focused value, `P` its path.

Only the lines in view are rendered, so very large documents stay fast; each line is one row high and long values are truncated (full text in the tooltip and in "copy value"). Treat `data` as immutable: assign a new value instead of mutating it, since each object's keys are cached.

Every colour, size and spacing is a `--c2-json-viewer…` CSS custom property; see the API page of the docs.
