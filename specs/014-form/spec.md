# Feature: `c2-form-field` and `c2-form` — field wrapper and form container

**Status**: Implemented in `packages/components/form-field`, `packages/components/form` and `@c2n/core/contexts/field.js` (v1 scope below).
**Roadmap**: rows 1 and 2 (section A), `c2-form` and `c2-form-field`, P1, wave 1. Accepted on 2026-10-17 with every
recommendation in [Decisions](#decisions).
**Related**: `c2-label` (stays for standalone use), `c2-fieldset` (row 3, reuses the field's error line),
`c2-save-bar` (row 78, listens to `dirty-change`), `json-form` (WIP, schema-driven, out of scope here).

## Problem

The Account Form example (`apps/examples/basic-form-html`) shows what every app does today. Each field is a
`div.field` holding a `c2-label` and a control. Validation is hand-written: the script clears `error`/`errorText` on
three fields, checks each rule in order, stops at the first failure and reports it in a toast. The select, checkbox
and switch cannot show an error at all, so the terms checkbox falls back to a warning toast.

Across the library:

- 32 `c2-*` controls are form-associated (`FormData`, reset and native validity work), not counting `c2-button`,
  `c2-map-chart`, `c2-questionnaire` and the single `c2-radio`.
- 11 of them draw their own hint and error line (`help`, `error`, `error-text`, `supporting-text` slot): text-field,
  textarea, number-input, money-input, mask-input, date-input, time-input, date-time-picker, otp-input,
  password-field, code-editor. Each re-implements it.
- The others have no error line: select, checkbox, radio group, switch, slider, rate, tag-input, phone-input, upload,
  autocomplete, cascader, and more.
- Nothing collects errors across a form, shows a summary, maps server errors onto fields or tracks unsaved changes.

## Research

Checked on 2026-10-17. Browser support is from MDN's browser-compat-data; design-system API names are from their docs
and should be re-checked before they are quoted in public documentation.

| System                               | Pattern                                                                                  | What c2n takes                                                    |
| ------------------------------------ | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| React Spectrum / React Aria          | `validationErrors` keyed by `name`, cleared on edit; `necessityIndicator`; cascades      | `errors` on `c2-form`, `necessity`                                |
| Radix Form, Base UI Field            | One message per `ValidityState` key (`Message match="valueMissing"`)                     | Slotted error messages with `data-match`                          |
| Ark UI / Chakra Field                | The root generates ids and wires `aria-describedby`; ErrorText renders only when invalid | The field owns all wiring; authors write no ids                   |
| Polaris Labelled + ContextualSaveBar | `action` beside the label; Save/Discard bar while dirty                                  | `label-action` slot; `dirty-change` for a later `c2-save-bar`     |
| GOV.UK                               | Focused error summary linking to each field; hidden "Error:" prefix on inline errors     | The built-in summary and the hidden prefix                        |
| Carbon                               | `warn` / `warnText`, a non-blocking warning                                              | `warning-text`                                                    |
| Vaadin FormLayout                    | Columns from the container width; labels beside the field when there is room             | Layout as CSS variables, no breakpoint attribute                  |
| Ant Design Form                      | `validateTrigger`, `scrollToFirstError`, message templates                               | `validate-on`; focus and scroll to the summary or the first error |
| Web Awesome                          | `:state(user-invalid)`                                                                   | Custom states only, never `data-*` written on the host            |
| Material Web                         | The field draws its own label and supporting text in its shadow root                     | Confirms the text-copy wiring below                               |

Validation timing, from GOV.UK, NN/g and Smashing Magazine: "reward early, punish late". Validate on submit first;
after that, re-validate an invalid field on every input so the error clears as soon as it is fixed; never show an
error on an untouched empty field; keep the submit button enabled; announce once, through a focused summary, not a
live region per field.

### Accessibility platform status

- IDREFs (`for`, `aria-labelledby`, `aria-describedby`) resolve inside one tree only. A label outside a control's
  shadow root cannot point at the focusable element inside it.
- Element reflection (`ariaLabelledByElements`, `ariaDescribedByElements`): Chrome 135, Firefox 136, Safari 16.4
  (Baseline April 2025). A reference may point at the same tree or a shadow-including _ancestor_ tree, never into a
  nested shadow root, so it cannot reach text inside the field's own shadow root.
- Reference Target (`shadowrootreferencetarget`): shipped in Chrome 152; behind a preference in Firefox 144 and
  Safari 26. Progressive enhancement only.
- `:user-invalid` does not apply to a form-associated custom element; `internals.states` (Baseline 2024) does.
- `invalid` does not bubble, so a container listens in the capture phase. `preventDefault()` on it suppresses the
  browser's validation bubble. `form.requestSubmit()` validates; `form.submit()` does not.

## Decisions

All six were accepted as recommended on 2026-10-17. Two changed while building:

1. **Two packages**, `@c2n/form-field` and `@c2n/form`. A field is useful without a form (a filter bar, a settings
   panel that saves on change, React Hook Form or Angular forms). `c2-form` reads fields by duck type and does not
   import `@c2n/form-field`.
2. **Every control in one PR** (changed from "five first"): all 32 controls take part in the protocol, covered by one
   matrix test in `packages/components/form-field/test/form-field.controls.spec.ts`.
3. **The controls keep `help` / `error` / `error-text`** for standalone use and hide their own line while a field is
   attached. No breaking change; a later major may deprecate them.
4. **`warning-text`** on the field: a non-blocking warning state.
5. **Built-in validation messages** per validity key in `messages.ts`, not the browser's (which follow the browser's
   language rather than `lang`, and differ between engines).
6. **No new button state** (changed): `c2-button` already has `running` (spinner, `aria-busy`, clicks ignored).
   `c2-form` sets it on a `c2-button` submitter while `waitUntil` is pending, and `disabled` on a native one.

## Usage

```html
<c2-form necessity="required">
  <form>
    <c2-form-field label="Full name">
      <c2-text-field name="fullName" required></c2-text-field>
    </c2-form-field>

    <c2-form-field label="Email" hint="We'll send a confirmation link.">
      <c2-text-field name="email" type="email" required></c2-text-field>
      <span slot="error" data-match="typeMismatch">Enter an email address like name@example.com.</span>
    </c2-form-field>

    <c2-form-field label="Handle" counter>
      <a slot="label-action" href="/help/handles">What's this?</a>
      <c2-text-field name="handle" maxlength="20"></c2-text-field>
    </c2-form-field>

    <c2-form-field>
      <c2-checkbox name="terms" required>I agree to the terms of service</c2-checkbox>
    </c2-form-field>

    <div class="actions"><c2-button type="submit">Save changes</c2-button></div>
  </form>
</c2-form>
```

```ts
form.addEventListener('valid-submit', (event) => event.detail.waitUntil(api.saveAccount(event.detail.values)))
```

## `c2-form-field`

Wraps exactly one control: the first child without a `slot`. It reads `required`, `disabled` (`:disabled`, so a
disabled fieldset counts), `readOnly`/`readonly`, `maxLength`, `value` and `validity` from the control, so the author
states them once, on the control.

### Behaviour

- Error text, in order: a server error (`setServerError`, set by `c2-form`) → `error-text` → a slotted `error` element
  whose `data-match` names the first failing validity key → a slotted `error` element with no `data-match` → the
  built-in message for that key → the control's `validationMessage`. Slotted errors are read as text.
- `error-text` and a server error make the control invalid through `setCustomValidity`, so a form blocks submit, and
  show at once. A server error clears when the user edits the control.
- Constraint failures wait for a trigger: the control's `invalid` event (a submit, `checkValidity()`), `validate()`,
  blur after an edit (`validate-on="blur"`) or every edit (`validate-on="input"`). From then on the field re-checks on
  every input, so the error clears as soon as the value is fixed. A form reset clears the shown error.
- Checkbox and switch (`selfLabelled`): the control's own text stays its name; the field draws no label row unless it
  has a label, which then joins the description. `--c2-form-field__supporting-text--indent` lines the error up with
  the box's text.
- Native `<input>`, `<select>`, `<textarea>`: named and described only by slotted light-DOM `label`/`hint` elements,
  linked with `ariaLabelledByElements` / `ariaDescribedByElements`. The attribute shortcuts render in the field's shadow
  root, which a native control cannot reference; the field warns once.
- A control that upgrades after the field announces itself (`c2-field-connect`) and is claimed then.

### Properties and attributes

| Property         | Attribute      | Type                                 | Default   | Purpose                                                                 |
| ---------------- | -------------- | ------------------------------------ | --------- | ----------------------------------------------------------------------- |
| `label`          | `label`        | `string`                             | `''`      | Plain-text label; the `label` slot wins                                 |
| `hint`           | `hint`         | `string`                             | `''`      | Plain-text hint; the `hint` slot wins                                   |
| `errorText`      | `error-text`   | `string`                             | `''`      | Custom error; makes the control invalid through `setCustomValidity`     |
| `warningText`    | `warning-text` | `string`                             | `''`      | Non-blocking warning, shown when there is no error                      |
| `counter`        | `counter`      | `boolean`                            | `false`   | Show `length / maxlength` when the control has a `maxlength`            |
| `necessity`      | `necessity`    | `'required' \| 'optional' \| 'none'` | inherited | Marker style; falls back to the enclosing `c2-form`, then `required`    |
| `validateOn`     | `validate-on`  | `'submit' \| 'blur' \| 'input'`      | inherited | When validation first shows; falls back to the `c2-form`, then `submit` |
| `controlElement` | —              | `HTMLElement \| null`                | —         | Read-only, the wrapped control                                          |
| `invalid`        | —              | `boolean`                            | —         | Read-only, an error is shown                                            |
| `errorMessage`   | —              | `string`                             | —         | Read-only, the text shown                                               |

`necessity="required"` puts an asterisk on required fields; `optional` puts "Optional" on fields that are not
required; `none` shows neither. Both markers are `aria-hidden`: the control already exposes `aria-required`.

Methods: `validate(): boolean`, `reset()`, `setServerError(message)`.

### Slots, states, parts and variables

Slots: default (the control), `label`, `label-action`, `hint`, `error` (any number; `data-match` filters).

Custom states: `invalid` (the control fails a constraint), `user-invalid` (an error is shown), `warning`, `required`,
`disabled`, `read-only`, `self-labelled`. Parts: `label-row`, `label`, `supporting-text`, `counter`.

Layout is CSS, and custom properties inherit, so setting them on a `c2-form` or any ancestor applies to every field
inside it: `--c2-form-field--direction` (`column`; `row` puts the label beside the control), `--c2-form-field--gap`,
`--c2-form-field--column-gap`, `--c2-form-field--grid-column` (`1 / -1` spans a `c2-form` grid),
`--c2-form-field__body--min-width` (`240px`: in `row` direction the label wraps above the control once the control
would be narrower), `--c2-form-field__label--{width,padding-top,color,font-size,font-weight,line-height}`, the marker,
label-action, supporting-text, hint, error, warning, icon and counter colours and sizes. The defaults reuse existing
literals so `@c2n/theme` maps them; the full list is on the API tab.

The counter is announced politely only once 10% or less of the limit is left, after typing pauses.

## `c2-form`

Wraps a native `<form>` (the first `<form>` in its default slot). A custom element cannot own form-associated
controls, and Safari does not support customized built-ins (`is="…"`), so the native form stays: `FormData`, reset,
`requestSubmit`, `<fieldset disabled>` and framework bindings keep working unchanged. It writes no attribute on itself
or the form (no `novalidate`).

### Behaviour

- A submit attempt is a click on a submit button (native or `c2-button[type=submit]`), Enter in a single-line input,
  or `submit()`. During one, the capture-phase `invalid` listener calls `preventDefault()` (no browser bubbles) and
  the form shows every field's error. An `invalid` event outside an attempt (`reportValidity()` from app code) is left
  alone.
- With errors: a summary above the form when two or more fail (`error-summary="auto"`), focused, `role="alert"`, each
  entry focusing its control and leaving the summary as it is fixed; with one error, focus goes to that control.
  `invalid-submit` follows.
- Without errors: the native submit is prevented (no navigation), `validator` runs, and its errors show as server
  errors; otherwise `valid-submit` fires.
- `waitUntil(promise)`: `:state(submitting)` and the submitter `running` while pending. Resolving takes the values as
  the new pristine state; rejecting with `{ name: message }` shows those errors and focuses as on a failed submit; any
  other rejection is rethrown.
- Server errors (`errors`, `setErrors`) show on the field whose control has that `name`; a name without a field still
  appears in the summary.
- Dirty tracking against a `FormData` snapshot taken once the controls settle, and on `markPristine()`.
- `necessity` and `validate-on` are the defaults of every field inside.

### Properties and attributes

| Property        | Attribute       | Type                                                         | Default      | Purpose                                                        |
| --------------- | --------------- | ------------------------------------------------------------ | ------------ | -------------------------------------------------------------- |
| `validateOn`    | `validate-on`   | `'submit' \| 'blur' \| 'input'`                              | `'submit'`   | Default timing for every field                                 |
| `necessity`     | `necessity`     | `'required' \| 'optional' \| 'none'`                         | `'required'` | Default marker style for every field                           |
| `errorSummary`  | `error-summary` | `'auto' \| 'always' \| 'none'`                               | `'auto'`     | `auto`: summary for 2+ errors; `always`: also for one          |
| `errors`        | `errors`        | `Record<string, string>`                                     | `{}`         | Server errors by control `name` (JSON converter)               |
| `warnUnsaved`   | `warn-unsaved`  | `boolean`                                                    | `false`      | Prompt before unload while dirty                               |
| `validator`     | —               | `(values, form) => Record<string, string> \| Promise<…>`     | `undefined`  | Cross-field and async checks, run after native validity passes |
| `form`          | —               | `HTMLFormElement \| null`                                    | —            | Read-only                                                      |
| `values`        | —               | `Record<string, FormDataEntryValue \| FormDataEntryValue[]>` | —            | Read-only; repeated names become arrays                        |
| `dirty`         | —               | `boolean`                                                    | —            | Read-only                                                      |
| `submitting`    | —               | `boolean`                                                    | —            | Read-only                                                      |
| `invalidFields` | —               | `readonly { name, message, control }[]`                      | —            | Read-only, as of the last attempt or `validate()`              |

The cross-field callback is `validator`, not `validate`, because `validate()` is the method.

Methods: `submit()`, `reset()`, `setErrors(map)`, `validate(): Promise<boolean>`, `markPristine()`.

### Events

| Event            | Detail                                                | Bubbles | Notes                                                                   |
| ---------------- | ----------------------------------------------------- | ------- | ----------------------------------------------------------------------- |
| `valid-submit`   | `{ formData, values, submitter, waitUntil(promise) }` | no      | Native `submit` still fires on the `<form>`, with its default prevented |
| `invalid-submit` | `{ errors: { name, message, control }[] }`            | no      | After the summary or the first control has focus                        |
| `dirty-change`   | `{ dirty }`                                           | no      | Only when the value of `dirty` changes                                  |

Declared in `FormEventMap` with `TypedAddEventListener`.

### Slots, states, parts and variables

Slots: default (the `<form>`), `error-summary-heading` (replaces "There are {0} problems with this form").
Custom states: `dirty`, `submitting`, `submitted`, `invalid`. Parts: `summary`, `summary-heading`, `summary-link`.

The form is laid out by `::slotted(form)`: `--c2-form--display` (`grid`; `block` leaves it alone),
`--c2-form--columns` (`minmax(0, 1fr)`, any `grid-template-columns` value), `--c2-form--gap`, `--c2-form--column-gap`.
Buttons go in a row container of their own. The summary: `--c2-form__summary--{margin-bottom,padding,border,
border-radius,background,color}`, `--c2-form__summary-heading--{color,font-size,font-weight}`,
`--c2-form__summary-link--{color,font-size}`, `--c2-form__summary__focus--outline`. Its background is the surface
(`#ffffff`), because red text on a red tint measured 4.4:1.

## Field context protocol (`@c2n/core/contexts/field.js`)

Same shape as `contexts/pager.js`: a connect event plus a controller, so `@c2n/form-field` and the controls never
import each other. It does not use `@lit/context`, because a field that upgrades after its control would miss the
control's request; instead the field also finds an already-upgraded consumer through `fieldConsumerOf(element)`.

```ts
export const FIELD_CONNECT_EVENT = 'c2-field-connect'
export type FieldControlKind = 'text' | 'choice' | 'check'
export interface FieldState {
  label: string // accessible name for the focusable element; '' for a self-labelled control
  description: string // hint, or the shown error/warning with its "Error:"/"Warning:" prefix
  invalid: boolean // an error is shown
}
export class FieldContextConsumer {
  constructor(host, options?: { kind?: FieldControlKind; selfLabelled?: boolean })
  readonly managed: boolean
  readonly label: string
  readonly description: string
  readonly invalid: boolean
  describedBy(...ownIds): string | typeof nothing
  renderDescription(): TemplateResult | typeof nothing // hidden span, id c2-field-description
}
```

A control puts `label` on its focusable element as the fallback name, `describedBy()` as its `aria-describedby`, the
hidden description in the same shadow root, `aria-invalid` and its error look while `invalid`, and hides its own
hint/error line while `managed`. Nothing is written on the host or on light-DOM children, which keeps SSR hydration
clean. A control whose role sits on its host through `ElementInternals` (`c2-button-group`) sets
`internals.ariaLabel` and `internals.ariaDescribedByElements` instead.

### Coverage and known gaps

All 32 controls take part. Where the reports from wiring them found limits:

- `c2-upload` compact: the focusable element is inside `c2-button`'s shadow root, and `c2-button` takes no
  description, so the field's hint and error do not reach it (the dropzone variant is fully wired).
- `c2-radio-group` and `c2-checkbox-group` have no red look of their own; the error line and `aria-invalid` carry the
  state. While a field wraps them their own `description` slot is hidden.
- `c2-date-selector`'s group takes no `aria-invalid` (not allowed on `role="group"`); the description carries the error.
- `c2-tag-input` with its text input hidden (limit reached, read-only) has no focusable element for the description.
- `c2-inline-edit`'s read view and a slotted custom `editor` get no description; `c2-key-value-editor` describes its
  group rather than each input.

## Accessibility

- The control stays the only focusable element; the field is neither a landmark nor a group.
- Inline errors are not live regions. On a failed submit, focus moves to the summary (`role="alert"`) or to the one
  invalid control, so the result is announced once.
- Every inline error has a hidden "Error: " prefix (`errorPrefix`) and an icon, so it does not rely on colour.
- Built-in text lives in each package's `src/messages.ts` (`form-field`, `form` catalogs), translatable with
  `addTranslations`.

## Tests

`packages/components/form-field/test/form-field.spec.ts` (21 tests: naming and description, slots, label click,
timing modes, `data-match`, `error-text`, server errors, warning, necessity, counter and its announcement, select,
checkbox, switch, leaving the field, a late upgrade, reset, no attributes written, axe),
`form-field.controls.spec.ts` (every control's focusable element named and described, error description, released
when it leaves the field; `c2-button-group` through internals) and `packages/components/form/test/form.spec.ts` (14:
summary and focus, summary links, single error, `error-summary` modes, `valid-submit` values without navigation,
`waitUntil` resolve and reject, server errors, `validator`, dirty tracking and reset, inherited defaults, `submit()`,
no attributes written, axe).

## Later

- `c2-fieldset` (roadmap row 3) for radio and checkbox groups, on the same error line.
- `c2-save-bar` (roadmap row 78) on `dirty-change`.
- Reference Target once Firefox and Safari ship it; a description input on `c2-button` for the compact upload.
- Async per-field validators (cross-field and async checks live on `c2-form.validator`).
- Multi-step forms (use `c2-steps` with one `c2-form` per step).

Out of scope: schema-driven forms (`json-form`) and blocks such as a login or checkout form, which belong in the
planned blocks collection.
