# @c2n/list

Vertical list of `c2-list-item` rows with single or multiple selection, built with Lit.

```bash
npm install @c2n/list @c2n/list-item
```

```html
<script type="module">
  import '@c2n/list'
  import '@c2n/list-item'
</script>

<c2-list value="design" multiple>
  <h6>Folders</h6>
  <c2-list-item value="inbox">Inbox</c2-list-item>
  <c2-list-item value="design">Design</c2-list-item>
  <hr />
  <c2-list-item value="archive">Archive</c2-list-item>
</c2-list>
```

- **Selection**: the list owns it. `value` is `;`-separated in the attribute and an array in the property; the matching rows are marked selected through context. `multiple` allows several rows, `required` keeps at least one, `disabled` freezes the list. `selection-change` carries `detail.value` and `detail.data` (each row's `data` property).
- **Keyboard**: the list is a `listbox` with a roving `tabindex`. Arrow Up/Down, Home/End move between enabled rows, Enter and Space select, typing jumps to the next matching row.
- **Structure**: `<hr>` dividers and `<h1>`–`<h6>` group headings can sit between rows; they are styled by the `__divider` and `__heading` tokens and ignored by selection.
- **Layout**: `--c2-list--max-height` makes a long list scroll; a list with zero vertical padding passes its corner radius to the first and last row.

Theming: `--c2-list--*` for the container plus `--c2-list__divider--*` and `--c2-list__heading--*`; the rows are themed with `--c2-list-item--*`, which inherit through the list. The full list is in `custom-elements.json` and on the docs site.
