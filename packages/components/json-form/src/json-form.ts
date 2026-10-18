import { LitElement, html, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { state } from 'lit/decorators.js'
import { property, jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import { createState, renderUiElement, type CategoryStep, type EngineHost } from './engine'
import { jsonFormMessages } from './messages'
import type { JsonFormRenderer } from './registry'
import { applyDefaults, generateLayout, isUnder, placedPaths, schemaAt, scopeToPath, setAt, toPointer, type DataPath } from './schema'
import type { JsonFormError, JsonFormValidator, JsonSchema, UiElement } from './types'
import { validateSchema } from './validate'
import './renderers'
import './json-field'
import styles from './json-form.scss?inline'

/** What `c2-json-field` needs from its form. */
export interface JsonFieldLike extends HTMLElement {
  scope: string
  requestUpdate(): void
}

/** Events fired by {@link JsonForm}, keyed for `addEventListener`. */
export interface JsonFormEventMap {
  input: Event
  change: Event
}

export interface JsonForm {
  addEventListener: TypedAddEventListener<JsonForm, JsonFormEventMap>
  removeEventListener: TypedRemoveEventListener<JsonForm, JsonFormEventMap>
}

/**
 * A form generated from a JSON Schema. The schema describes the data and how it is validated; how the form looks is
 * decided in three layers, each optional:
 *
 * - **Nothing**: one field per property, in schema order, each control picked from the property's `type`, `format`
 *   and `enum` (text field, number input, checkbox, select or radio group, date input, tag input…). Objects become
 *   groups, arrays of objects repeatable groups.
 * - **`ui-schema`**: a layout tree in the JSON Forms shape. `VerticalLayout`, `HorizontalLayout`, `GridLayout`
 *   (`options.columns`, default 2; a child takes one column unless it sets `options.span`), `Group` (`options.collapsible`), `Categorization` (tabs, or
 *   `options.variant: "stepper"`) and `Label` hold `Control`s, each pointing at the data with a `scope`
 *   (`#/properties/name`). A `rule` shows, hides, enables or disables any element from the data; `options.widget`
 *   picks another control. `{ "type": "Control", "scope": "*" }` stands for every field not placed elsewhere.
 * - **Markup**: put `c2-json-field` elements (with any HTML around them) inside the form and they replace the
 *   generated layout, each rendering the field its `scope` names.
 *
 * A new kind of control or layout is a renderer: `registerRenderer({ name, tester, render })` for every form, or the
 * form's `renderers` property for one. The highest tester rank wins.
 *
 * Validation runs on every change with the built-in validator (or `validator`). A field shows its error once it is
 * committed (`change`), or for every field after `reportValidity()` or a submit attempt. Errors of fields a rule hides
 * are ignored. Inside a `<form>`, the element is a form control: it submits its value as JSON under `name`, blocks
 * submit while invalid and resets with the form.
 *
 * The value is a plain object. An emptied text field removes its key, so `required` reports it.
 *
 * @tag c2-json-form
 *
 * @slot - `c2-json-field` elements and any markup around them. When present, they replace the generated layout.
 *
 * @event {Event} input - Fired on every edit, after `value` is updated.
 * @event {Event} change - Fired when an edit is committed (a text field loses focus, a checkbox toggles, an item is added).
 *
 * @cssproperty {pixel} [--c2-json-form--gap=16px] - Space between the elements of a layout.
 * @cssproperty {pixel} [--c2-json-form__horizontal__item--min-width=200px] - A horizontal layout wraps a child narrower than this onto the next row.
 * @cssproperty {pixel} [--c2-json-form__grid--column-gap=16px]
 * @cssproperty {pixel} [--c2-json-form__grid--row-gap=16px]
 * @cssproperty {pixel} [--c2-json-form__grid--preferred-width=480px] - The width a grid asks for when the form is sized to its content; narrower than 480px, it stacks into one column.
 * @cssproperty {color} [--c2-json-form__label--color=#71717a] - Text of a `Label` element.
 * @cssproperty {font-size} [--c2-json-form__label--font-size=14px]
 * @cssproperty {color} [--c2-json-form__group-label--color=#18181b]
 * @cssproperty {font-size} [--c2-json-form__group-label--font-size=14px]
 * @cssproperty {font-weight} [--c2-json-form__group-label--font-weight=600]
 * @cssproperty {color} [--c2-json-form__group-error--color=#dc2626] - An error about a whole group or list, such as `minItems`.
 * @cssproperty {font-size} [--c2-json-form__group-error--font-size=12px]
 * @cssproperty {border} [--c2-json-form__array-item--border-bottom=1px solid #e4e4e7] - Separates the items of a list.
 * @cssproperty {pixel} [--c2-json-form__array-item--padding-bottom=16px]
 * @cssproperty {color} [--c2-json-form__array-item-header--color=#71717a]
 * @cssproperty {font-size} [--c2-json-form__array-item-header--font-size=12px]
 * @cssproperty {font-family} [--c2-json-form__step-label--font-family=system-ui, sans-serif] - The stepper's step names.
 * @cssproperty {pixel} [--c2-json-form__slider--margin-top=24px] - Room above a slider for the value it shows over its thumb.
 *
 * @csspart field - Every `c2-form-field`; `field-<key>` names one by its property, e.g. `::part(field-email)`.
 * @csspart group - An object, a list or a `Group` (`group-<key>` for a property).
 * @csspart group-label - A group's heading.
 * @csspart group-error - An error about a whole group or list.
 * @csspart layout - A vertical, horizontal or grid layout.
 * @csspart label - A `Label` element.
 * @csspart categorization - The tabs or the stepper of a `Categorization`.
 * @csspart stepper-actions - The Back and Next buttons of a stepper.
 * @csspart array-item - One item of a list. Every element also carries the names in its `options.part`.
 * @csspart array-item-header - The row above a list item holding its number and its Remove button.
 * @csspart array-actions - The row holding the Add button.
 *
 * @internalcomponent c2-form-field
 */
@customElement('c2-json-form')
export class JsonForm extends LitElement {
  static formAssociated = true
  static override styles = unsafeCSS(styles)
  static override shadowRootOptions: ShadowRootInit = { ...LitElement.shadowRootOptions, delegatesFocus: true }

  private readonly internals = this.attachInternals()
  private readonly msg = new LocalizeController(this, jsonFormMessages)

  /** The JSON Schema of the value. A JSON string is parsed. */
  @property({ converter: jsonPropertyConverter }) schema: JsonSchema = {}

  /** The layout: a UI schema element tree. Without it, one field per property in schema order. A JSON string is parsed. */
  @property({ attribute: 'ui-schema', converter: jsonPropertyConverter }) uiSchema: UiElement | undefined = undefined

  /** Submitted as JSON under this name by an enclosing `<form>`. */
  @property({ type: String, reflect: true }) name = ''

  /** Disables every control; the value is not submitted and does not block a form while disabled. */
  @property({ type: Boolean, reflect: true }) disabled = false

  /** Every control is read-only. */
  @property({ type: Boolean }) readonly = false

  /** Replaces the built-in validator, e.g. Ajv through `fromAjvErrors`. */
  @property({ attribute: false }) validator: JsonFormValidator | undefined = undefined

  /** Renderers for this form only, on top of the ones registered with `registerRenderer`. */
  @property({ attribute: false }) renderers: JsonFormRenderer[] = []

  private _data: unknown = undefined
  private appValue: unknown = undefined
  private defaultsPending = true
  private allErrors: JsonFormError[] = []
  private readonly touched = new Set<string>()
  private readonly hiddenPaths = new Set<string>()
  private readonly categoryOf = new Map<string, readonly CategoryStep[]>()
  private readonly categorySelection = new Map<string, number>()
  private readonly fields = new Set<JsonFieldLike>()
  private parentDisabled = false
  /** A declarative shadow root is attached before the element upgrades: the form was rendered on the server. */
  private readonly serverRendered = this.shadowRoot !== null
  @state() private submitted = false
  @state() private templated = false

  /** The data the form edits. Defaults from the schema are filled in where the value has none. */
  @property({ converter: jsonPropertyConverter })
  get value(): unknown {
    return this._data
  }

  set value(next: unknown) {
    const old = this._data
    this._data = next
    this.appValue = next
    this.defaultsPending = true
    this.requestUpdate('value', old)
  }

  /** Every current validation error, except those of fields a rule hides. */
  get errors(): JsonFormError[] {
    return this.allErrors.filter((error) => ![...this.hiddenPaths].some((hidden) => isUnder(error.path, hidden)))
  }

  get form(): HTMLFormElement | null {
    return this.internals.form
  }

  get validity(): ValidityState {
    return this.internals.validity
  }

  get validationMessage(): string {
    return this.internals.validationMessage
  }

  get willValidate(): boolean {
    return this.internals.willValidate
  }

  /** True when the value is valid. Shows nothing. */
  checkValidity(): boolean {
    this.computeErrors()
    return this.errors.length === 0
  }

  /** Shows every field's error, focuses the first invalid field and returns true when the value is valid. */
  reportValidity(): boolean {
    this.computeErrors()
    this.submitted = true
    const valid = this.errors.length === 0
    if (!valid) void this.focusFirstError()
    return valid
  }

  /** Puts back the last value the application set and hides every error. */
  reset() {
    this.touched.clear()
    this.submitted = false
    this.value = this.appValue === undefined ? undefined : structuredClone(this.appValue)
  }

  formResetCallback() {
    this.reset()
  }

  formDisabledCallback(disabled: boolean) {
    this.parentDisabled = disabled
    this.requestUpdate()
  }

  override connectedCallback() {
    super.connectedCallback()
    this.addEventListener('invalid', this.handleInvalid)
    this.templated = this.hasTemplate()
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    this.removeEventListener('invalid', this.handleInvalid)
  }

  // The engine's view of the form -----------------------------------------------------------------------------------

  private readonly engine: EngineHost = createEngine(this)

  /** @internal */
  setValueAt(path: DataPath, next: unknown, commit: boolean) {
    this._data = setAt(this._data, path, next)
    if (commit) this.touched.add(toPointer(path))
    this.computeErrors()
    this.requestUpdate()
    this.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
    if (commit) this.dispatchEvent(new Event('change', { bubbles: true }))
  }

  /** @internal */
  errorFor(path: DataPath, deep: boolean): string {
    const pointer = toPointer(path)
    const error = this.errors.find((candidate) => (deep ? isUnder(candidate.path, pointer) : candidate.path === pointer) && this.isShown(candidate))
    return error ? this.messageFor(error) : ''
  }

  /** @internal */
  recordHidden(pointer: string) {
    this.hiddenPaths.add(pointer)
  }

  /** @internal */
  recordCategory(pointer: string, steps: readonly CategoryStep[]) {
    if (steps.length) this.categoryOf.set(pointer, steps)
  }

  // Categorization, for the tabs and stepper renderers ---------------------------------------------------------------

  /** @internal */
  selectedCategory(key: string): number {
    return this.categorySelection.get(key) ?? 0
  }

  /** @internal */
  selectCategory(key: string, index: number) {
    this.categorySelection.set(key, index)
    this.requestUpdate()
  }

  /** @internal Shows the errors of one category; true when it has none. */
  checkCategory(key: string, index: number): boolean {
    const pointers = this.pointersIn(key, index)
    for (const pointer of pointers) this.touched.add(pointer)
    this.requestUpdate()
    return !this.errors.some((error) => pointers.some((pointer) => isUnder(error.path, pointer)))
  }

  /** @internal */
  categoryHasErrors(key: string, index: number): boolean {
    const pointers = this.pointersIn(key, index)
    return this.errors.some((error) => this.isShown(error) && pointers.some((pointer) => isUnder(error.path, pointer)))
  }

  private pointersIn(key: string, index: number): string[] {
    return [...this.categoryOf].filter(([, steps]) => steps.some((step) => step.key === key && step.index === index)).map(([pointer]) => pointer)
  }

  // c2-json-field ---------------------------------------------------------------------------------------------------

  /** @internal */
  connectField(field: JsonFieldLike) {
    this.fields.add(field)
    this.requestUpdate()
  }

  /** @internal */
  disconnectField(field: JsonFieldLike) {
    this.fields.delete(field)
    this.requestUpdate()
  }

  /** @internal Renders the field a `c2-json-field` names. */
  renderField(element: UiElement, idPrefix: string): unknown {
    const placed = [...this.fields].filter((other) => other.scope !== '*').map((other) => scopeToPath(other.scope))
    return renderUiElement(this.engine, element, createState(idPrefix, placed))
  }

  // Lifecycle -------------------------------------------------------------------------------------------------------

  protected override willUpdate(changed: PropertyValues<this>) {
    if (changed.has('schema') || this.defaultsPending) {
      this._data = applyDefaults(this.schema ?? {}, this._data)
      this.defaultsPending = false
    }
    this.computeErrors()
  }

  protected override render() {
    this.hiddenPaths.clear()
    this.categoryOf.clear()
    const schema = this.schema ?? {}
    const layout = this.uiSchema ?? generateLayout(schema, schema)
    // The server cannot see the light DOM, so it drew the generated layout. The hydrating render draws it again to
    // match, and `updated` drops it once the form knows its markup replaces it.
    const generated = !this.templated || (this.serverRendered && !this.hasUpdated)
    return html`${generated ? renderUiElement(this.engine, layout, createState('jf', placedPaths(layout))) : nothing}<slot
        @slotchange=${this.handleSlotChange}
      ></slot>`
  }

  protected override firstUpdated() {
    if (this.serverRendered && this.templated) this.requestUpdate()
  }

  protected override updated() {
    for (const field of this.fields) field.requestUpdate()
    this.internals.setFormValue(this._data === undefined ? null : JSON.stringify(this._data))
    const first = this.errors[0]
    if (first && !(this.disabled || this.parentDisabled)) {
      const anchor = this.controlFor(first.path) ?? undefined
      this.internals.setValidity({ customError: true }, this.messageFor(first), anchor)
    } else {
      this.internals.setValidity({})
    }
  }

  // Internals -------------------------------------------------------------------------------------------------------

  private computeErrors() {
    if (this.defaultsPending) {
      this._data = applyDefaults(this.schema ?? {}, this._data)
      this.defaultsPending = false
    }
    const validator = this.validator ?? ((schema: JsonSchema, value: unknown) => validateSchema(schema, value))
    this.allErrors = validator(this.schema ?? {}, this._data)
  }

  private isShown(error: JsonFormError): boolean {
    return this.submitted || [...this.touched].some((pointer) => isUnder(error.path, pointer))
  }

  private messageFor(error: JsonFormError): string {
    if (error.message) return error.message
    const path = error.path
      .split('/')
      .slice(1)
      .map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'))
    const schema = schemaAt(
      this.schema ?? {},
      path.map((segment) => (/^\d+$/.test(segment) ? Number(segment) : segment)),
    )
    const limit = Number(error.params?.limit)
    switch (error.keyword) {
      case 'required':
        return schema?.enum || schema?.oneOf || schema?.type === 'boolean' || schema?.type === 'array' ? this.msg.t('requiredChoice') : this.msg.t('required')
      case 'format': {
        const format = String(error.params?.format ?? schema?.format ?? '')
        if (format === 'email') return this.msg.t('formatEmail')
        if (format === 'uri' || format === 'url') return this.msg.t('formatUri')
        if (format === 'date' || format === 'date-time') return this.msg.t('formatDate')
        if (format === 'time') return this.msg.t('formatTime')
        return this.msg.t('invalid')
      }
      case 'pattern':
        return this.msg.t('pattern')
      case 'enum':
        return this.msg.t('enum')
      case 'uniqueItems':
        return this.msg.t('uniqueItems')
      case 'minLength':
      case 'maxLength':
      case 'minimum':
      case 'maximum':
      case 'exclusiveMinimum':
      case 'exclusiveMaximum':
      case 'multipleOf':
      case 'minItems':
      case 'maxItems':
        return Number.isFinite(limit) ? this.msg.t(error.keyword, limit) : this.msg.t('invalid')
      default:
        return this.msg.t('invalid')
    }
  }

  /** The control showing `pointer`: in this form's shadow root, or in a `c2-json-field`'s. */
  private controlFor(pointer: string): HTMLElement | null {
    const roots = [this.renderRoot, ...[...this.fields].map((field) => field.shadowRoot)]
    for (const root of roots) {
      const field = root?.querySelector<HTMLElement & { controlElement?: HTMLElement | null }>(`c2-form-field[data-json-path="${CSS.escape(pointer)}"]`)
      if (field) return field.controlElement ?? field
    }
    return null
  }

  private async focusFirstError() {
    const first = this.errors[0]
    if (!first) return
    // Open the tab or step holding the field first.
    const steps = [...this.categoryOf].find(([pointer]) => isUnder(first.path, pointer))?.[1] ?? []
    for (const step of steps) this.categorySelection.set(step.key, step.index)
    this.requestUpdate()
    await this.updateComplete
    for (const field of this.fields) await (field as JsonFieldLike & { updateComplete?: Promise<unknown> }).updateComplete
    const control = this.controlFor(first.path) ?? this.controlFor(first.path.slice(0, first.path.lastIndexOf('/')))
    control?.focus()
  }

  private hasTemplate(): boolean {
    return [...this.children].some((child) => !child.hasAttribute('slot'))
  }

  private handleSlotChange = () => {
    this.templated = this.hasTemplate()
  }

  private handleInvalid = () => {
    this.submitted = true
    void this.focusFirstError()
  }
}

/** Adapts the form to what the renderers see, so none of it becomes public API on the element. */
function createEngine(form: JsonForm): EngineHost {
  const internal = form as unknown as {
    _data: unknown
    disabled: boolean
    parentDisabled: boolean
    msg: LocalizeController<(typeof jsonFormMessages)['en']>
  }
  return {
    host: form,
    get rootSchema() {
      return form.schema ?? {}
    },
    get data() {
      return internal._data
    },
    get renderers() {
      return form.renderers
    },
    get formDisabled() {
      return internal.disabled || internal.parentDisabled
    },
    get formReadOnly() {
      return form.readonly
    },
    t: (key, ...args) => internal.msg.t(key, ...args),
    setValueAt: (path, value, commit) => form.setValueAt(path, value, commit),
    errorFor: (path, deep) => form.errorFor(path, deep),
    matches: (schema, value) => validateSchema(schema, value, form.schema ?? {}).length === 0,
    hidePath: (pointer) => form.recordHidden(pointer),
    recordCategory: (pointer, steps) => form.recordCategory(pointer, steps),
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-json-form': JsonForm
  }
}
