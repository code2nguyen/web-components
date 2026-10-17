# Feature: `c2-form-field` and `c2-form` — field wrapper and form container

**Status**: Accepted, not started.
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

- 34 `c2-*` controls are form-associated (`FormData`, reset and native validity work).
- 11 of them draw their own hint and error line (`help`, `error`, `error-text`, `supporting-text` slot): text-field,
  textarea, number-input, money-input, mask-input, date-input, time-input, date-time-picker, otp-input,
  password-field, code-editor. Each re-implements it.
- The other 23 have no error line: select, checkbox, radio, switch, slider, rate, tag-input, phone-input, upload,
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

All six were accepted as recommended on 2026-10-17.

1. **Two packages**, `@c2n/form-field` and `@c2n/form`. A field is useful without a form (a filter bar, a settings
   panel that saves on change, React Hook Form or Angular forms).
2. **The protocol ships with five controls first** (text-field, textarea, select, checkbox, switch). The other 29
   follow in groups of five to eight, each with its own tests.
3. **The controls keep `help` / `error` / `error-text`** for standalone use and hide their own line while a field is
   attached. No breaking change; a later major may deprecate them.
4. **`warning-text`** on the field: a non-blocking warning state.
5. **Built-in validation messages** per validity key in `messages.ts`, not the browser's (which follow the browser's
   language rather than `lang`, and differ between engines).
6. **`c2-button` gets a busy state** (`:state(busy)` plus a spinner) as a prerequisite, set by the form on its
   submitters while a submit is pending.

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

    <c2-button type="submit">Save changes</c2-button>
  </form>
</c2-form>
```

```ts
form.addEventListener('valid-submit', (event) => event.detail.waitUntil(api.saveAccount(event.detail.values)))
```

## `c2-form-field`

Wraps exactly one control: the first element in the default slot. It reads `required`, `disabled`, `readOnly`,
`maxLength`, `value` and `validity` from the control, so the author states them once, on the control.

### Scope

**In v1**

- Label, necessity marker, `label-action` slot, hint, error, warning, counter.
- Error text, in order of precedence: a server error from `c2-form` → `error-text` → a slotted `error` element whose
  `data-match` names the first failing validity key → a slotted `error` element with no `data-match` → the built-in
  message for that key → the control's `validationMessage`.
- `error-text` makes the field invalid by calling `setCustomValidity` on the control, so a form blocks submit.
- Timing (`validate-on`): `submit` (default), `blur` or `input`. Once an error is shown, the field re-validates on
  every `input`, whatever the mode.
- Checkbox and switch: the control's own slotted text is the label, so the field draws no label row and indents its
  hint/error line to that text (`--c2-form-field__supporting-text--indent`).
- Native `<input>`, `<select>`, `<textarea>`: supported only through slotted light-DOM `label`/`hint`/`error`
  elements, linked with `ariaLabelledByElements` / `ariaDescribedByElements`. The `label`/`hint`/`error-text`
  attribute shortcuts render in the field's shadow root, which a native control cannot reference; the field warns
  once when they are used with one.

**Later (not v1)**

- `c2-fieldset` (roadmap row 3) for radio groups and checkbox lists.
- Reference Target, once Firefox and Safari ship it.
- Async per-field validators (cross-field and async checks live on `c2-form.validate` in v1).

### Properties and attributes

| Property       | Attribute      | Type                                 | Default   | Purpose                                                                 |
| -------------- | -------------- | ------------------------------------ | --------- | ----------------------------------------------------------------------- |
| `label`        | `label`        | `string`                             | `''`      | Plain-text label; the `label` slot wins                                 |
| `hint`         | `hint`         | `string`                             | `''`      | Plain-text hint; the `hint` slot wins                                   |
| `errorText`    | `error-text`   | `string`                             | `''`      | Custom error; makes the control invalid through `setCustomValidity`     |
| `warningText`  | `warning-text` | `string`                             | `''`      | Non-blocking warning, shown when there is no error                      |
| `counter`      | `counter`      | `boolean`                            | `false`   | Show `length / maxlength` when the control has a `maxlength`            |
| `necessity`    | `necessity`    | `'required' \| 'optional' \| 'none'` | inherited | Marker style; falls back to the enclosing `c2-form`, then `required`    |
| `validateOn`   | `validate-on`  | `'submit' \| 'blur' \| 'input'`      | inherited | When validation first shows; falls back to the `c2-form`, then `submit` |
| `control`      | —              | `HTMLElement \| null`                | —         | Read-only, the wrapped control                                          |
| `invalid`      | —              | `boolean`                            | —         | Read-only, an error is currently shown                                  |
| `errorMessage` | —              | `string`                             | —         | Read-only, the text currently shown                                     |

`necessity="required"` puts an asterisk on required fields; `optional` puts "Optional" on fields that are not
required; `none` shows neither. Both markers are `aria-hidden`: the control already exposes `aria-required`.

Methods: `validate(): boolean` runs validation and shows the result now; `reset()` clears the shown error and the
interaction state (called by `c2-form` on form reset).

### Events

None of its own. The control's `input` / `change` / `invalid` pass through unchanged.

### Slots, states and variables

Slots: default (the control), `label`, `label-action`, `hint`, `error` (any number; `data-match` filters),
`warning`.

Custom states: `invalid`, `user-invalid` (invalid and shown), `warning`, `required`, `disabled`, `read-only`.

Layout is presentation, so it is CSS, not attributes. Custom properties inherit, so setting them on a `c2-form` or
any ancestor applies to every field inside it:

| Variable                                      | Default   | Purpose                                                  |
| --------------------------------------------- | --------- | -------------------------------------------------------- |
| `--c2-form-field--direction`                  | `column`  | `row` puts the label beside the control                  |
| `--c2-form-field--gap`                        | `6px`     | Space between the label row, control and supporting line |
| `--c2-form-field--grid-column`                | `auto`    | `1 / -1` spans every column of a `c2-form` grid          |
| `--c2-form-field__label--width`               | `auto`    | Label column width in `row` direction                    |
| `--c2-form-field__label--color`               | `#18181b` |                                                          |
| `--c2-form-field__label--font-size`           | `14px`    |                                                          |
| `--c2-form-field__label--font-weight`         | `500`     |                                                          |
| `--c2-form-field__required-indicator--color`  | `#dc2626` |                                                          |
| `--c2-form-field__supporting-text--font-size` | `12px`    | Hint, error, warning and counter                         |
| `--c2-form-field__supporting-text--indent`    | `0px`     | Set by checkbox/switch layouts                           |
| `--c2-form-field__hint--color`                | `#71717a` |                                                          |
| `--c2-form-field__error--color`               | `#dc2626` |                                                          |
| `--c2-form-field__warning--color`             | `#b45309` |                                                          |
| `--c2-form-field__counter__near-limit--color` | `#b45309` | Counter colour when 10% or less of the limit is left     |

The defaults reuse existing literals (12/14px, 500, `#dc2626`, `#71717a`) so `@c2n/theme` maps them without new
overrides; the warning colour needs an `overrides.ts` entry (there is no warning token). `row` direction falls back
to `column` when the field is narrower than `--c2-form-field--row-min-width` (`480px`, container query).

## `c2-form`

Wraps a native `<form>` (the first `<form>` in its default slot). A custom element cannot own form-associated
controls, and Safari does not support customized built-ins (`is="…"`), so the native form stays: `FormData`, reset,
`requestSubmit`, `<fieldset disabled>` and framework bindings keep working unchanged.

### Scope

**In v1**

- Capture-phase `invalid` listener with `preventDefault()` (no browser bubbles), and a `submit` listener that
  validates every field, runs `validate`, and either fires `valid-submit` or blocks the submit and fires
  `invalid-submit`.
- Error summary above the form when two or more fields fail (`error-summary="auto"`), focused with `role="alert"`;
  each entry focuses its control. With one failure, focus goes to that control instead.
- Server errors (`errors`, `setErrors`, or a rejected `waitUntil` promise), each cleared when its field is edited.
- Dirty tracking against a `FormData` snapshot taken on connect, after reset and on `markPristine()`.
- `valid-submit` with `waitUntil(promise)`: `:state(submitting)` and the busy state on the submitter while pending.
- `warn-unsaved`: `beforeunload` prompt while dirty.
- Field defaults: `necessity` and `validate-on` flow to every `c2-form-field` through the field context.

**Later (not v1)**

- Multi-step forms (use `c2-steps` with one `c2-form` per step for now).
- A "page title prefix" on error (GOV.UK's `Error: ` in `document.title`): app-level, documented as a recipe.

### Properties and attributes

| Property        | Attribute       | Type                                                         | Default      | Purpose                                                          |
| --------------- | --------------- | ------------------------------------------------------------ | ------------ | ---------------------------------------------------------------- |
| `validateOn`    | `validate-on`   | `'submit' \| 'blur' \| 'input'`                              | `'submit'`   | Default timing for every field                                   |
| `necessity`     | `necessity`     | `'required' \| 'optional' \| 'none'`                         | `'required'` | Default marker style for every field                             |
| `errorSummary`  | `error-summary` | `'auto' \| 'always' \| 'none'`                               | `'auto'`     | `auto`: summary for 2+ errors; `always`: also for one            |
| `errors`        | `errors`        | `Record<string, string>`                                     | `{}`         | Server errors by control `name` (JSON converter, `fromProperty`) |
| `warnUnsaved`   | `warn-unsaved`  | `boolean`                                                    | `false`      | Prompt before unload while dirty                                 |
| `validate`      | —               | `(values) => Record<string, string> \| Promise<…>`           | `undefined`  | Cross-field and async checks, run after native validity passes   |
| `form`          | —               | `HTMLFormElement \| null`                                    | —            | Read-only                                                        |
| `values`        | —               | `Record<string, FormDataEntryValue \| FormDataEntryValue[]>` | —            | Read-only; repeated names become arrays                          |
| `dirty`         | —               | `boolean`                                                    | —            | Read-only                                                        |
| `submitting`    | —               | `boolean`                                                    | —            | Read-only                                                        |
| `invalidFields` | —               | `readonly { name, message, control }[]`                      | —            | Read-only, as of the last validation                             |

Methods: `submit(submitter?)` (calls `requestSubmit`, so validation always runs), `reset()`, `setErrors(map)`,
`validate(): Promise<boolean>`, `markPristine()`.

### Events

| Event            | Detail                                                | Bubbles | Notes                                                                                  |
| ---------------- | ----------------------------------------------------- | ------- | -------------------------------------------------------------------------------------- |
| `valid-submit`   | `{ formData, values, submitter, waitUntil(promise) }` | no      | Native `submit` is prevented. A promise rejecting with `{ field: message }` shows them |
| `invalid-submit` | `{ errors: { name, message, control }[] }`            | no      | After the summary or the first control has focus                                       |
| `dirty-change`   | `{ dirty }`                                           | no      | Only on a change of value                                                              |

Declared in `FormEventMap` with `TypedAddEventListener`. The native `submit` and `reset` still fire on the `<form>`.

### Slots, states and variables

Slots: default (the `<form>`), `error-summary-heading` (replaces "There are {0} problems with this form").

Custom states: `dirty`, `submitting`, `submitted` (a submit was attempted), `invalid`.

Variables: `--c2-form--gap` (`18px`), `--c2-form--column-min-width` (`none`: one column; a length turns the form's
fields into `repeat(auto-fill, minmax(<length>, 1fr))`), `--c2-form__summary--{background,border,border-radius,color,padding}`
(`#fef2f2`, `1px solid #dc2626`, `8px`, `#dc2626`, `14px 16px`).

The grid needs the fields to be direct grid items. The `<form>` is the grid container, laid out by `::slotted(form)`
from the variables above, so `c2-form` writes nothing on it.

## Field context protocol (`@c2n/core/contexts/field.js`)

Follows `contexts/pager.js`: an `@lit/context` context plus a connect event, so `@c2n/form-field` and the controls
never import each other.

```ts
export const FIELD_CONNECT_EVENT = 'c2-field-connect'

export interface FieldContext {
  /** Text the control puts on its focusable element as its accessible name; empty when the control's own slotted text names it. */
  label: string
  /** Hint, then the error or warning, joined, with the hidden "Error:" prefix. */
  description: string
  invalid: boolean
  /** True while the field draws the hint/error line, so the control hides its own `supporting-text` line. */
  managed: boolean
  /** Light-DOM elements for element reflection, when the author slotted them. */
  labelElements: readonly Element[]
  descriptionElements: readonly Element[]
}

export const fieldContext = createContext<FieldContext | undefined>(Symbol('c2-field'))
```

A control opts in with `new FieldContextConsumer(this, () => this.focusTarget)`. The consumer applies the context to
the focusable element inside the control's shadow root: `aria-label` (or `ariaLabelledByElements` for slotted light-DOM
labels), `aria-describedby` pointing at a visually hidden `<span>` in the same shadow root that holds `description`,
`aria-invalid`, and the `managed` flag. Nothing is written on the host or on light-DOM children, which keeps SSR
hydration clean. `c2-select`'s existing label copy moves onto the consumer.

PR 1 wires text-field, textarea, select, checkbox and switch. The remaining 29 controls follow in groups, each with a
test that its focusable element is named and described.

## Accessibility

- The field never is a landmark or a group; the control stays the only focusable element.
- Inline errors are not live regions. On a failed submit, focus moves to the summary (`role="alert"`) or to the one
  invalid control, so the result is announced once.
- Every inline error is preceded by a visually hidden "Error: " (`errorPrefix` message), and has an icon, so it does
  not rely on colour.
- The counter is announced politely only once 10% or less of the limit is left ("12 characters left"), throttled.
- Summary links call `control.focus()` and scroll the field into view; no ids are needed.
- Built-in text (validation messages per key, `errorPrefix`, `optional`, `charactersLeft`, summary heading) lives in
  each package's `src/messages.ts`, translatable with `addTranslations`.

## Prerequisite: `c2-button` busy state

`c2-button` has no loading state. Add `:state(busy)` with a `busy-indicator` slot (default: a spinner) and `aria-busy`
through `internals`, set from a `busy` property. `c2-form` sets it on the submitter while `waitUntil` is pending and
disables its other submitters. Ships in PR 2.

## Tests

`packages/components/form-field/test/form-field.spec.ts`, `packages/components/form/test/form.spec.ts`, Chromium,
Firefox and WebKit:

- Field: label/hint/error from attributes and slots, `data-match` per validity key, precedence order, `error-text`
  blocking a form, warning not blocking, counter and its announcement threshold, necessity markers inherited and
  overridden, each `validate-on` mode, the re-validate-on-input rule, checkbox/switch layout, native control with
  slotted text, the warning for attribute shortcuts on a native control, `row` direction falling back to `column`.
- Protocol: for each wired control, the focusable element's accessible name and description (`toHaveHostAria` is not
  enough: assert on the inner element), `aria-invalid`, the control's own line hidden while managed and back after
  the field is removed.
- Form: no browser bubbles, summary for 2+ errors and focus for one, `error-summary` modes, summary links, server
  errors from each source and cleared on edit, `validate` sync and async, `valid-submit` / `invalid-submit` details,
  `waitUntil` resolving and rejecting, busy submitter, dirty tracking through edits, reset and `markPristine`,
  `warn-unsaved`, `requestSubmit` from a `c2-button` submitter.
- No attribute written on any host or light-DOM child; axe scans of a valid form, a form after a failed submit, and
  each field state.

## Plan

1. **PR 1, field context**: the protocol in `@c2n/core`, `c2-form-field`, five wired controls, docs page, gallery,
   tests.
2. **PR 2, `c2-form`**: validation, summary, server errors, dirty tracking, `valid-submit`, the `c2-button` busy
   state; convert `apps/examples/basic-form-html`; check the events in the React, Vue and Angular examples.
3. **PR 3 onward, coverage**: the remaining 29 controls in groups; `c2-fieldset` (row 3); `c2-save-bar` (row 78) on
   `dirty-change`; Reference Target when Firefox and Safari ship it.

Out of scope: schema-driven forms (`json-form`), wizards, and blocks such as a login or checkout form, which belong in
the planned blocks collection.
