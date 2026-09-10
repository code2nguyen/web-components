# @c2n/text-field

`c2-text-field` is a single-line input in a themeable field: icon slots, an optional clear button, helper and error text, and a character counter.

```html
<c2-text-field type="email" placeholder="you@example.com" help="We never share it." clearable>
  <svg slot="prefix-icon" viewBox="0 0 24 24">…</svg>
</c2-text-field>
```

- Attributes: `type`, `name`, `autocomplete`, `placeholder`, `value`, `maxlength`, `minlength`, `pattern`, `required`, `disabled`, `readonly`, `error`, `error-text`, `help`, `clearable`.
- Slots: `prefix-icon`, `suffix-icon`, `clear-icon`, `help-icon`, `supporting-text`.
- Events: `input`, `change` (re-dispatched from the inner input), `clear`.
- Theming: `--c2-text-field--*` with `__hover`, `__focus`, `__error`, `__read-only`, `__disabled` states, plus `__icon`, `__clear-icon`, `__help-icon` and `__supporting-text` parts. Pair with `c2-label` for a caption.
