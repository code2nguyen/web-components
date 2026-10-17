# Diff Viewer

`c2-diff-viewer` shows a read-only line diff of two texts, for reviewing a change before it is applied: a
configuration, a generated file, a document revision. It ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/diff-viewer'
```

```html
<c2-diff-viewer line-numbers original-label="Current" modified-label="Proposed"></c2-diff-viewer>
```

```js
const viewer = document.querySelector('c2-diff-viewer')
viewer.original = currentYaml
viewer.modified = proposedYaml
```

- `original`, `modified` — the two texts (attributes or properties). The diff is computed in the element: Myers on
  lines, then on the words of each changed line pair.
- `mode` — `unified` (default) or `split`; split draws unified while narrower than `--c2-diff-viewer--split-min-width`.
- `context` — unchanged lines kept around each change (default 3); longer runs fold into a row that opens on click
  (`fold-expand` event, `expandAll()` method). A negative value shows every line.
- `line-numbers`, `original-label`, `modified-label`, `label` (accessible name).
- `stats` (`{ additions, deletions }`), `diff` (every line) and `:state(changed)` report the result.
- Style the rows with the `--c2-diff-viewer__line__added--*`, `__line__removed--*`, `__word__*`, `__fold--*` variables.

No syntax highlighting and no editing. `diffLines(original, modified)` is exported for use outside the element.
