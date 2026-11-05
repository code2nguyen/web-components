# Change Review

`c2-change-review` reviews a proposed edit hunk by hunk: accept or reject each change, then take the resulting text. It
ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/change-review'
```

```html
<c2-change-review label="Suggested edit" file-name="src/invoice.ts" original="…" modified="…">
  <c2-button slot="actions">Apply</c2-button>
</c2-change-review>
```

- **Hunks:** the element diffs `original` and `modified` by line and word and groups each run of changed lines into a
  hunk, with `context` unchanged lines around it (3 by default).
- **Decisions:** each hunk has Accept and Reject; a decided hunk collapses to the text it keeps, with an Undo. The
  sticky bar shows "Hunk 2 of 5 · 3 left", moves between hunks and has Accept all / Reject all for the open ones.
- **Result:** `decisions` holds one `'accepted' | 'rejected' | null` per hunk and can be set to restore a review;
  `result` is the text they produce, an open hunk keeping its `undecided` side (`original` by default).
- **Events:** `review-change` (`{ decisions, result, index }`) after every decision, and `review-complete` once the
  last open hunk is decided, when the bar becomes a summary with Start over and the `actions` slot.
- **Keyboard:** Alt+ArrowDown and Alt+ArrowUp move between hunks, Ctrl+Enter (⌘Enter) accepts, Ctrl+Backspace
  (⌘Backspace) rejects.
- **Exports:** `reviewHunks(original, modified, context)` and `applyDecisions(review, decisions, undecided)`.

Style it through the `--c2-change-review…` variables listed on the API tab of the docs.
