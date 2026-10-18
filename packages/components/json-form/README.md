# JSON Form

`c2-json-form` renders a form from a [JSON Schema](https://json-schema.org/). The schema describes the data and its
validation; how the form looks is decided in layers, each optional.

```js
import '@c2n/components/json-form'

form.schema = {
  type: 'object',
  required: ['email'],
  properties: {
    name: { type: 'string', title: 'Full name' },
    email: { type: 'string', format: 'email' },
    plan: { type: 'string', enum: ['free', 'pro', 'team'] },
  },
}
form.value = { name: 'Ada' }
form.addEventListener('input', () => console.log(form.value))
```

## Layout

### 1. Nothing: schema order

One field per property, in schema order. The control comes from the property:

| Schema                                             | Control                                                                         |
| -------------------------------------------------- | ------------------------------------------------------------------------------- |
| `string` (`format: email`/`uri` sets the type)     | `c2-text-field`                                                                 |
| `format: password` / `date` / `time` / `date-time` | `c2-password-field` / `c2-date-input` / `c2-time-input` / `c2-date-time-picker` |
| `enum`, or `oneOf` of `const` + `title`            | `c2-radio-group` up to 5 options, `c2-select` above                             |
| `number`, `integer`                                | `c2-number-input`                                                               |
| `boolean`                                          | `c2-checkbox`                                                                   |
| `array` of an enum                                 | `c2-checkbox-group`                                                             |
| `array` of strings                                 | `c2-tag-input`                                                                  |
| `array` of objects                                 | a repeatable group with Add / Remove                                            |
| `object`                                           | a `c2-card` group                                                               |

Labels come from `title` (else the humanised key), hints from `description`, the required marker from `required`.

### 2. `ui-schema`: a layout tree

The [JSON Forms](https://jsonforms.io/docs/uischema/) shape. A `Control` points at the data with a `scope`
(`#/properties/billing/properties/zip`, or the shorthand `billing.zip`).

```json
{
  "type": "Categorization",
  "options": { "variant": "stepper" },
  "elements": [
    {
      "type": "Category",
      "label": "Profile",
      "elements": [
        {
          "type": "GridLayout",
          "options": { "columns": 2 },
          "elements": [
            { "type": "Control", "scope": "#/properties/firstName" },
            { "type": "Control", "scope": "#/properties/lastName" },
            { "type": "Control", "scope": "#/properties/bio", "options": { "span": 2, "widget": "textarea" } }
          ]
        }
      ]
    },
    {
      "type": "Category",
      "label": "Billing",
      "elements": [
        { "type": "Control", "scope": "#/properties/sameAsShipping" },
        {
          "type": "Group",
          "label": "Billing address",
          "rule": { "effect": "HIDE", "condition": { "scope": "#/properties/sameAsShipping", "schema": { "const": true } } },
          "elements": [{ "type": "Control", "scope": "#/properties/billing" }]
        }
      ]
    },
    { "type": "Control", "scope": "*" }
  ]
}
```

| Element            | Renders                                   | Options                                                                                                                                         |
| ------------------ | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `VerticalLayout`   | a column                                  |                                                                                                                                                 |
| `HorizontalLayout` | a row that wraps                          |                                                                                                                                                 |
| `GridLayout`       | a CSS grid, one column under 480px        | `columns` (default 2); `span` on a child                                                                                                        |
| `Group`            | `c2-card`, or `c2-details`                | `label`; `collapsible`, `expanded`                                                                                                              |
| `Categorization`   | `c2-tabs`, or `c2-steps` with Back / Next | `variant: "stepper"`; children are `Category` elements                                                                                          |
| `Label`            | a paragraph                               | `text`                                                                                                                                          |
| `Control`          | the control for `scope`                   | `label` (`false` for none), `widget`, `placeholder`, `multi`, `toggle`, `detail` (layout of an object or list item), `orientation`, `necessity` |

- `{ "type": "Control", "scope": "*" }` stands for every field not placed elsewhere, so a field added to the schema
  still shows up.
- `rule` works on any element: `HIDE`, `SHOW`, `DISABLE`, `ENABLE` while the value at `condition.scope` validates
  against `condition.schema` (`AND`/`OR` combine conditions). Errors of hidden fields do not block the form.
- `options.widget` names a renderer: `text`, `textarea`, `password`, `date`, `time`, `date-time`, `number`,
  `slider` (needs `minimum` and `maximum`), `checkbox`, `switch`, `select`, `radio`, `checkboxes`, `tags`.
- `options.part` adds `part` names, for `c2-json-form::part(<name>)`.

### 3. Your own markup

Put `c2-json-field` elements, with any HTML and CSS around them, inside the form. They replace the generated layout;
the form still owns the value, validation and events.

```html
<c2-json-form>
  <div class="profile-layout">
    <c2-json-field scope="firstName"></c2-json-field>
    <c2-json-field scope="lastName" label="Family name"></c2-json-field>
    <p class="tip">Your name appears on invoices.</p>
  </div>
  <c2-json-field scope="*"></c2-json-field>
</c2-json-form>
```

### 4. Custom renderers

A renderer is a tester (a rank; negative means "not mine") and a render function returning a Lit template or a node.
The highest rank wins; built-ins rank 1 to 3.

```js
import '@c2n/rate'
import { registerRenderer, rankWith, and, isControl, schemaTypeIs, optionIs } from '@c2n/components/json-form'
import { html } from 'lit'

// `{ "type": "integer", "minimum": 1, "maximum": 5 }` with `"options": { "rating": true }` becomes a star rating.
registerRenderer({
  name: 'rating',
  tester: rankWith(10, and(isControl, schemaTypeIs('integer'), optionIs('rating'))),
  render: (ctx) =>
    html`<c2-form-field label=${ctx.label} error-text=${ctx.error}>
      <c2-rate .value=${ctx.value ?? 0} max=${ctx.schema?.maximum ?? 5} @change=${(e) => ctx.setValue(e.target.value, true)}></c2-rate>
    </c2-form-field>`,
})
```

`ctx` carries the value, path, schema, label, hint, error, `disabled`, `options`, `setValue(value, commit)`, and
`renderElements` / `renderDetail` for layouts. Set the form's `renderers` property instead for one form only.

### 5. Styling

Everything renders in the form's shadow root. Spacing and colours are `--c2-json-form__*` variables, and the
components' own variables (`--c2-form-field__*`, `--c2-card__*`, …) inherit, so set them on the form. `::part(field)`,
`::part(field-<key>)`, `::part(group)` and the `options.part` names reach the rendered elements.

## Validation

The built-in validator covers types, `required`, `enum`/`const`, string length, `pattern`, the common `format`s, number
ranges, array bounds, `allOf`/`anyOf`/`oneOf`/`not`, `if`/`then`/`else`, `dependentRequired` and local `$ref`s. It does
not generate code, so it runs under a strict CSP. For full JSON Schema, plug in Ajv:

```js
import Ajv from 'ajv'
import { fromAjvErrors } from '@c2n/components/json-form'

const ajv = new Ajv({ allErrors: true })
form.validator = (schema, value) => {
  const validate = ajv.compile(schema)
  return validate(value) ? [] : fromAjvErrors(validate.errors)
}
```

A field shows its error once committed (`change`); `reportValidity()` or a submit attempt shows every error and focuses
the first, switching tab or step if needed. `checkValidity()` checks silently and `errors` lists them. Inside a `<form>`
the element submits its value as JSON under `name`, blocks submit while invalid and resets with the form. Error and
interface messages are translatable under the `json-form` catalog.
