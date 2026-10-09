# Confirm Dialog

`c2-confirm-dialog` asks the user to confirm an action and answers with a promise. It ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/confirm-dialog'
```

```html
<c2-confirm-dialog id="delete" destructive heading="Delete project?" message="This cannot be undone." confirm-label="Delete"></c2-confirm-dialog>
```

```js
if (await document.getElementById('delete').show()) deleteProject()
```

Or without markup:

```js
import { confirm } from '@c2n/components/confirm-dialog'

if (await confirm({ heading: 'Delete project?', message: 'This cannot be undone.', confirmLabel: 'Delete', destructive: true })) deleteProject()
```

- `show()` resolves `true` on confirm, `false` on Cancel, Escape or `close()`; a backdrop click does not dismiss it.
- `destructive` colours the confirm button with the error colour and focuses Cancel first.
- `confirmAction` (or `action` in `confirm()`) runs the work from the dialog: the confirm button spins until it settles; a rejection keeps the dialog open and fires `confirm-error`.
- Slots: `heading`, `icon`, and the default slot for the message. Events: `open`, `confirm` (cancelable), `cancel`, `close` (`detail.confirmed`), `confirm-error`.
- Styled through `--c2-confirm-dialog…` variables (buttons, icon, message, width) plus the inner modal's `--c2-modal…` variables.
