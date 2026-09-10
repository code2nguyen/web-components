# @c2n/list-item

`c2-list-item` is a selectable row: on its own a click, Enter or Space toggles `selected`; inside a `c2-list` (or a `c2-select`) the list drives the selected state and the keyboard.

```html
<c2-list-item value="inbox" selected>
  <svg slot="prefix-icon" viewBox="0 0 24 24">…</svg>
  Inbox
  <span slot="description">12 unread</span>
</c2-list-item>

<c2-list-item href="/settings">Settings</c2-list-item>
```

- Attributes: `value`, `label`, `selected`, `disabled`, `href` / `target`; property `data`.
- Slots: default content, `description` (second muted line), `prefix-icon`, `suffix-icon`.
- Accessibility: `role="button"` + `aria-pressed` standalone, `role="option"` + `aria-selected` inside a list, `role="link"` with `href`; a visible focus ring via the `__focus` tokens.
- `selected-change` fires after `selected` changes.
- Theming: `--c2-list-item--*` with `__description`, `__hover`, `__selected`, `__focus`, `__disabled` states and `__icon--size` / `__icon--color`.
