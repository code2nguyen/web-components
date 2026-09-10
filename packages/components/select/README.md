# @c2n/select

`c2-select` is a dropdown: a themeable trigger button plus a popover holding a `c2-list` of `c2-list-item` options.

```html
<c2-select placeholder="Select a country" value="FR">
  <c2-list-item value="US">United States</c2-list-item>
  <c2-list-item value="FR">France</c2-list-item>
</c2-select>
```

- The options are the `c2-list-item` children (`value`, optional `label` for a short trigger text, `disabled`).
- `multiple`, `required`, `disabled`, `readonly`, `fit-size`, `open`.
- `selection-change` fires with `detail.value` (array of selected values) and `detail.data`.
- Theming: `--c2-select__button--*` (trigger), `--c2-select__list--*` (dropdown), `--c2-list-item--*` (options). See the docs site for the full list.
