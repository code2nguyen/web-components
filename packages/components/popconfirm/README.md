# Popconfirm

`c2-popconfirm` is a small "Are you sure?" popup anchored to the button that asked for it, styled like `c2-tooltip`: a compact dark bubble with an arrow pointing at the trigger (`--c2-popconfirm__arrow--size: 0px` removes it). It ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/popconfirm'
```

```html
<c2-popconfirm heading="Delete this task?" confirm-label="Delete">
  <button slot="trigger">Delete task</button>
  This cannot be undone.
</c2-popconfirm>
```

| Attribute                        | Description                                                                 |
| -------------------------------- | --------------------------------------------------------------------------- |
| `heading`                        | The question. The `heading` slot overrides it.                              |
| `confirm-label` / `cancel-label` | Button labels (default `OK` / `Cancel`).                                    |
| `placement`                      | Preferred side of the trigger (default `top`); flips when there is no room. |
| `open`                           | Visible state; set it to open or close the popup from code.                 |
| `disabled`                       | Keeps the trigger from opening the popup.                                   |
| `pending`                        | Shows OK as busy and ignores it while the confirmed action runs.            |

Every opening a user starts ends in one `confirm` (OK) or one `cancel` (Cancel, Escape, a click outside, focus moving
away) event. `confirm` is cancelable: call `preventDefault()` to keep the popup open, set `pending`, then set `open` to
`false` when the action is done. `show` and `hide` fire on every opening and closing. Slots: `trigger`, `heading`, the
default slot (description) and `icon`.
