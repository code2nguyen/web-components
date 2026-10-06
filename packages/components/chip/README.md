# Chip

`c2-chip` is a compact pill for a filter, a choice or an entered value. A plain chip is a read-only label; `selectable` makes it a toggle button and `removable` adds a remove button. It ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/chip'
```

```html
<c2-chip selectable selected value="open">Open</c2-chip> <c2-chip removable value="status">Status: Active</c2-chip>
```

```js
document.addEventListener('remove', (event) => {
  // event.detail: { value } — the chip never removes itself, so drop it from your list here.
  event.target.remove()
})
```

- Attributes: `selectable`, `selected`, `removable`, `disabled`, `value`, `remove-label` (default `Remove`, followed by the chip's text).
- Slots: default (label), `prefix`, `selected-icon`, `remove-icon`.
- Events: `change` (a selectable chip was toggled; read `selected`), `remove` (`detail: { value }`, from the remove button, Backspace or Delete).
- Parts: `chip`, `action`, `remove-button`.
- Theming: `--c2-chip__container--*` with `__hover`, `__selected`, `__focus` and `__disabled` states, `--c2-chip__icon--*`, `--c2-chip__selected-icon--display` and `--c2-chip__remove-button--*`.
