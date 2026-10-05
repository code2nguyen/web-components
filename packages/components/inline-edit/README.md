# Inline Edit

`c2-inline-edit` is text that turns into a field when clicked: Enter commits (Ctrl/⌘+Enter with `multiline`), Escape cancels, and any control with a `value` that fires `change` can be the editor. It ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/inline-edit'
// Only for the c2-select editor below:
import '@c2n/components/select'
```

```html
<c2-inline-edit label="Project name" value="Apollo"></c2-inline-edit>

<c2-inline-edit label="Status" value="doing">
  <c2-select slot="editor" aria-label="Status">
    <c2-list-item value="todo">To do</c2-list-item>
    <c2-list-item value="doing">In progress</c2-list-item>
  </c2-select>
</c2-inline-edit>
```

- Attributes: `value`, `placeholder`, `label`, `name`, `multiline`, `activation` (`click` | `dblclick` | `none`), `blur-action` (`commit` | `cancel` | `none`), `controls`, `select-on-edit`, `required`, `maxlength`, `readonly`, `disabled`, `editing`. Property only: `formatValue`.
- Methods: `edit()`, `commit()`, `cancel()`, `focus()`; `draftValue` reads the text being edited.
- Slots: `editor`, `preview`, `edit-icon`, `save-icon`, `cancel-icon`.
- Events: `edit-start` (cancelable), `edit-commit` (cancelable, `detail: { value, previousValue }`), `edit-cancel`, then `input` and `change` once a commit changed `value`.
- States: `:state(editing)`, `:state(empty)`, `:state(invalid)`, `:state(read-only)`, `:state(disabled)`.
- Theming: `--c2-inline-edit--*` for the shared box and font, plus `__hover`, `__focus`, `__placeholder`, `__edit-icon`, `__editor`, `__controls`, `__control` and `__disabled`.
