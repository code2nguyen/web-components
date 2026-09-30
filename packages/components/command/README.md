# @c2n/command

`c2-command` is a searchable list of commands — a search field above `c2-command-item` rows — and the core of a ⌘K
palette. Put it in a `c2-modal` for a palette, or inline in a page or a popover.

```html
<c2-command>
  <c2-command-group heading="Suggestions">
    <c2-command-item value="calendar">Calendar</c2-command-item>
    <c2-command-item value="emoji" keywords="smiley face">Search emoji</c2-command-item>
  </c2-command-group>
  <c2-command-separator></c2-command-separator>
  <c2-command-group heading="Settings">
    <c2-command-item value="profile">Profile<kbd slot="shortcut">⌘P</kbd></c2-command-item>
  </c2-command-group>
  <span slot="empty">No results found.</span>
</c2-command>
```

- Typing filters the rows: every word of the query must appear in a row's label, `value` or `keywords`. Groups with no
  match hide with their heading, separators hide while a query is typed, and the `empty` slot shows when nothing
  matches. `manual-filter` turns filtering off for rows the app loads itself (read `query` on `input`).
- Focus stays in the search field. Arrow Up/Down move the highlight over enabled matching rows (`loop` wraps), the
  pointer highlights the row under it, and Enter or a click activates a row.
- `command-select` fires on the palette with `detail.value` and `detail.data`. It is cancelable: a row with `href`
  navigates unless the event was cancelled. It does not bubble, so listen on the element.
- `query`, `placeholder`, `label`, `manual-filter`, `loop`, plus `clear()`, `activate()`, `items`, `visibleItems` and
  `activeItem`.
- Slots: `prefix-icon` (a magnifier by default), `suffix`, `empty`, `footer`. Rows take `description`, `prefix-icon`,
  `suffix-icon` and `shortcut`.
- Theming: `--c2-command--*` (surface), `--c2-command__field--*`, `--c2-command__list--*`, `--c2-command-item--*`,
  `--c2-command-group__heading--*` and `--c2-command-separator--*`. See the docs site for the full list.
