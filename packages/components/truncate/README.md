# Truncate

`c2-truncate` clamps text to a number of lines and ends it with an ellipsis. It measures whether the text really
overflows and only then offers a Show more / Show less button (`expandable`). It ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/truncate'
```

```html
<c2-truncate expandable style="--c2-truncate__content--line-clamp: 2">Long text…</c2-truncate>
```

| Attribute                   | Description                                                  |
| --------------------------- | ------------------------------------------------------------ |
| `expandable`                | Adds a Show more / Show less button when the text overflows. |
| `expanded`                  | Shows the whole text; set by the button, or by you.          |
| `more-label` / `less-label` | Button labels (default `Show more` / `Show less`).           |

The line count is the CSS variable `--c2-truncate__content--line-clamp` (default `3`). The read-only `truncated`
property, the `truncation-change` event (`detail` is the new value) and the `:state(truncated)` custom state say
whether the text is clamped; `toggle` (a `ToggleEvent`) fires when the button opens or closes it.
