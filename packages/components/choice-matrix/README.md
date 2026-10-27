# Choice Matrix

`c2-choice-matrix` ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/choice-matrix'
```

```html
<c2-choice-matrix name="notify" columns='[{"value":"email","label":"Email"}]' rows='[{"value":"mention","label":"Mentions"}]'></c2-choice-matrix>
```

Rows × columns of checkboxes or radio buttons in one form control: permissions, notification settings, agreement scales.

- `rows` and `columns`: arrays (or JSON attributes) of `{ value, label }`; rows may have a `description` and a `group`.
- `value`: `{ [row]: column[] }`, or `{ [row]: column }` with `type="radio"`; the form receives `name[row]=column`.
- `toggles`: tri-state checkboxes for whole rows, columns and groups (`rows`, `columns`, `both`).
- `required`: at least one choice, or every row answered with `type="radio"`. Works inside `c2-form-field`.
- Themed through `--c2-choice-matrix*` custom properties; see the API page of the docs site.
