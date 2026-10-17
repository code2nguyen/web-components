import { LitElement, html, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { query, state } from 'lit/decorators.js'
import { property, jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import { formMessages } from './messages'
import styles from './form.scss?inline'

export type FormValidateOn = 'submit' | 'blur' | 'input'
export type FormNecessity = 'required' | 'optional' | 'none'
export type FormErrorSummary = 'auto' | 'always' | 'none'

/** A form's values as a plain object; a name that appears more than once becomes an array. */
export type FormValues = Record<string, FormDataEntryValue | FormDataEntryValue[]>

/** Messages keyed by control `name`; an empty, `null` or `undefined` entry means that control has no error. */
export type FormErrors = Record<string, string | null | undefined>

/** Cross-field and async checks, run once every control passes its own constraints. Return `{}` when valid. */
export type FormValidator = (values: FormValues, form: HTMLFormElement) => FormErrors | Promise<FormErrors>

export interface FormFieldError {
  name: string
  message: string
  control: HTMLElement | null
}

export interface ValidSubmitEventDetail {
  formData: FormData
  values: FormValues
  submitter: HTMLElement | null
  /**
   * Keeps the form in `:state(submitting)`, with the submitter `running`, until the promise settles. It resolves:
   * the current values become the new pristine state. It rejects with a `{ name: message }` object: those errors
   * show on their fields, as with `setErrors`.
   */
  waitUntil(promise: Promise<unknown>): void
}

export interface InvalidSubmitEventDetail {
  errors: FormFieldError[]
}

export interface DirtyChangeEventDetail {
  dirty: boolean
}

/** Events fired by {@link Form}, keyed for `addEventListener`. */
export interface FormEventMap {
  'valid-submit': CustomEvent<ValidSubmitEventDetail>
  'invalid-submit': CustomEvent<InvalidSubmitEventDetail>
  'dirty-change': CustomEvent<DirtyChangeEventDetail>
}

export interface Form {
  addEventListener: TypedAddEventListener<Form, FormEventMap>
  removeEventListener: TypedRemoveEventListener<Form, FormEventMap>
}

/** What the form needs from a `c2-form-field`, read by duck type so this package does not import it. */
interface FieldLike extends HTMLElement {
  controlElement: (HTMLElement & { name?: string }) | null
  errorMessage: string
  validate(): boolean
  reset(): void
  setServerError(message: string): void
  requestUpdate?(): void
}

type Submittable = HTMLElement & { running?: boolean; disabled?: boolean; type?: string }

const SUBMITTERS = 'button:not([type]), button[type="submit"], input[type="submit"], input[type="image"], c2-button[type="submit"]'

/**
 * Form container around a native `<form>`: validation timing, an error summary, server errors, dirty tracking and
 * an async submit. Put one `<form>` in the default slot and wrap its controls in `c2-form-field`.
 *
 * The native form stays in charge of its controls: `FormData`, reset, `requestSubmit`, `<fieldset disabled>` and
 * framework bindings work as they do without this element. On a submit attempt (a submit button, `submit()`), it
 * suppresses the browser's validation bubbles, shows every field's error, and either focuses the error summary (two
 * or more errors) or the one invalid control, then fires `invalid-submit`. When every control is valid it runs
 * `validator`, then fires `valid-submit` instead of submitting the page; `waitUntil` keeps the form busy while the
 * app saves.
 *
 * Server errors (`errors`, `setErrors`, or a rejected `waitUntil`) show on the field whose control has that `name`
 * and clear when the user edits it. `necessity` and `validate-on` are the defaults of every `c2-form-field` inside.
 *
 * The form is laid out as a grid of its children: `--c2-form--columns: repeat(auto-fill, minmax(220px, 1fr))` gives
 * several columns, and `--c2-form-field--grid-column: 1 / -1` on a field spans them all. Put the buttons in a row
 * container of their own.
 *
 * The host exposes custom states: `:state(dirty)`, `:state(submitting)`, `:state(submitted)` (a submit was
 * attempted) and `:state(invalid)` (the last attempt found errors).
 *
 * @tag c2-form
 *
 * @slot default - The native `<form>`.
 * @slot error-summary-heading - Replaces the summary heading ("There are 2 problems with this form").
 *
 * @event {CustomEvent<ValidSubmitEventDetail>} valid-submit - Every control is valid and `validator` passed. Detail: `{ formData, values, submitter, waitUntil(promise) }`. The page does not navigate.
 * @event {CustomEvent<InvalidSubmitEventDetail>} invalid-submit - A submit attempt found errors. Detail: `{ errors: { name, message, control }[] }`.
 * @event {CustomEvent<DirtyChangeEventDetail>} dirty-change - The values started or stopped differing from the pristine state. Detail: `{ dirty }`.
 *
 * @cssproperty {display} [--c2-form--display=grid] - `block` leaves the form's own layout alone.
 * @cssproperty {grid-template-columns} [--c2-form--columns=minmax(0, 1fr)] - Columns of the form's grid.
 * @cssproperty {pixel} [--c2-form--gap=18px] - Space between the form's rows.
 * @cssproperty {pixel} [--c2-form--column-gap=16px] - Space between the form's columns.
 * @cssproperty {pixel} [--c2-form__summary--margin-bottom=18px]
 * @cssproperty {padding} [--c2-form__summary--padding=14px 16px]
 * @cssproperty {border} [--c2-form__summary--border=1px solid #dc2626]
 * @cssproperty {border-radius} [--c2-form__summary--border-radius=8px]
 * @cssproperty {color} [--c2-form__summary--background=#ffffff]
 * @cssproperty {color} [--c2-form__summary--color=#18181b] - Text of the summary entries.
 * @cssproperty {color} [--c2-form__summary-heading--color=#dc2626]
 * @cssproperty {font-size} [--c2-form__summary-heading--font-size=14px]
 * @cssproperty {font-weight} [--c2-form__summary-heading--font-weight=600]
 * @cssproperty {color} [--c2-form__summary-link--color=#dc2626]
 * @cssproperty {font-size} [--c2-form__summary-link--font-size=14px]
 * @cssproperty {outline} [--c2-form__summary__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 *
 * @csspart summary - The error summary.
 * @csspart summary-heading - The summary heading.
 * @csspart summary-link - Each entry of the summary.
 */
@customElement('c2-form')
export class Form extends LitElement {
  static override styles = unsafeCSS(styles)

  private readonly internals = this.attachInternals()
  private readonly msg = new LocalizeController(this, formMessages)

  /** When an error first shows, for every field inside: `submit`, `blur` or `input`. A field's own `validate-on` wins. */
  @property({ attribute: 'validate-on' }) validateOn: FormValidateOn = 'submit'

  /** Marker style of every field inside: `required` (asterisk), `optional` ("Optional") or `none`. A field's own `necessity` wins. */
  @property({ type: String }) necessity: FormNecessity = 'required'

  /** `auto`: a summary above the form for two or more errors, focus on the control for one. `always`: a summary for one too. `none`: never. */
  @property({ attribute: 'error-summary' }) errorSummary: FormErrorSummary = 'auto'

  /** Server errors keyed by control `name`, e.g. `{"email": "Already registered"}`. Each one clears when its control is edited. */
  @property({ converter: jsonPropertyConverter }) errors: FormErrors = {}

  /** Asks before the page unloads while the form has unsaved changes. */
  @property({ type: Boolean, attribute: 'warn-unsaved' }) warnUnsaved = false

  /** Cross-field and async checks, run once every control passes its own constraints. */
  @property({ attribute: false }) validator: FormValidator | undefined = undefined

  @state() private summary: FormFieldError[] = []
  @state() private busy = false

  @query('.summary') private readonly summaryElement?: HTMLElement | null

  private formElement: HTMLFormElement | null = null
  private pristine = ''
  private wasDirty = false
  private submitIntent = false
  private lastSubmitter: HTMLElement | null = null
  private failureScheduled = false
  private invalidFieldList: FormFieldError[] = []
  private serverErrorNames = new Set<string>()
  private dirtyTimer: ReturnType<typeof setTimeout> | undefined

  /** The slotted native form. */
  get form(): HTMLFormElement | null {
    return this.formElement
  }

  /** The current values as a plain object; a name that appears more than once becomes an array. */
  get values(): FormValues {
    return this.formElement ? toValues(new FormData(this.formElement)) : {}
  }

  /** True while the values differ from the pristine state (the authored values, or the last `markPristine()`). */
  get dirty(): boolean {
    return this.formElement ? serialize(this.formElement) !== this.pristine : false
  }

  /** True while a `waitUntil` promise is pending. */
  get submitting(): boolean {
    return this.busy
  }

  /** The errors found by the last submit attempt or `validate()`. */
  get invalidFields(): readonly FormFieldError[] {
    return this.invalidFieldList
  }

  /** Submits the form as a submit button would: validation always runs. */
  submit() {
    if (!this.formElement) return
    this.submitIntent = true
    this.formElement.requestSubmit()
    this.submitIntent = false
  }

  /** Resets the form to its authored values and clears every error and the summary. */
  reset() {
    this.formElement?.reset()
  }

  /** Shows errors keyed by control `name` on their fields, as if the server had returned them. `{}` clears them. */
  setErrors(errors: FormErrors) {
    this.errors = { ...errors }
  }

  /** Runs every check without submitting and shows the result. Resolves to true when the form is valid. */
  async validate(): Promise<boolean> {
    const errors = this.collectErrors()
    if (errors.length === 0 && this.validator && this.formElement) {
      const extra = await this.validator(this.values, this.formElement)
      this.applyServerErrors(extra, false)
      errors.push(...this.collectErrors())
    }
    this.invalidFieldList = errors
    this.syncStates()
    return errors.length === 0
  }

  /** Takes the current values as the new pristine state, e.g. after a save the app did itself. */
  markPristine() {
    if (!this.formElement) return
    this.pristine = serialize(this.formElement)
    this.checkDirty()
  }

  override connectedCallback(): void {
    super.connectedCallback()
    window.addEventListener('beforeunload', this.handleBeforeUnload)
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    window.removeEventListener('beforeunload', this.handleBeforeUnload)
    this.attachForm(null)
  }

  protected override updated(changed: PropertyValues<this>): void {
    super.updated(changed)
    if (changed.has('errors')) this.applyServerErrors(this.errors ?? {}, true)
    if (changed.has('necessity') || changed.has('validateOn')) {
      for (const field of this.fields()) field.requestUpdate?.()
    }
  }

  private handleSlotChange = (event: Event) => {
    const slot = event.target as HTMLSlotElement
    const form = slot.assignedElements({ flatten: true }).find((element): element is HTMLFormElement => element instanceof HTMLFormElement) ?? null
    this.attachForm(form)
  }

  private attachForm(form: HTMLFormElement | null) {
    if (form === this.formElement) return
    const previous = this.formElement
    if (previous) {
      previous.removeEventListener('invalid', this.handleInvalid, true)
      previous.removeEventListener('submit', this.handleSubmit, true)
      previous.removeEventListener('reset', this.handleReset)
      previous.removeEventListener('click', this.handleClick, true)
      previous.removeEventListener('keydown', this.handleKeydown, true)
      previous.removeEventListener('input', this.scheduleDirtyCheck, true)
      previous.removeEventListener('change', this.scheduleDirtyCheck, true)
    }
    this.formElement = form
    if (!form) return
    form.addEventListener('invalid', this.handleInvalid, true)
    form.addEventListener('submit', this.handleSubmit, true)
    form.addEventListener('reset', this.handleReset)
    form.addEventListener('click', this.handleClick, true)
    form.addEventListener('keydown', this.handleKeydown, true)
    form.addEventListener('input', this.scheduleDirtyCheck, true)
    form.addEventListener('change', this.scheduleDirtyCheck, true)
    // Controls settle their form values in their own first update: take the pristine state after that.
    void this.settleControls().then(() => {
      if (this.formElement !== form) return
      this.pristine = serialize(form)
      this.wasDirty = false
      this.applyServerErrors(this.errors ?? {}, true)
      this.syncStates()
    })
  }

  private async settleControls() {
    const form = this.formElement
    if (!form) return
    await Promise.all(
      [...form.elements, ...form.querySelectorAll('c2-form-field')].map(
        (element) => (element as Element & { updateComplete?: Promise<unknown> }).updateComplete,
      ),
    )
  }

  private fields(): FieldLike[] {
    return this.formElement ? [...this.formElement.querySelectorAll<FieldLike>('c2-form-field')] : []
  }

  private fieldFor(name: string): FieldLike | undefined {
    return this.fields().find((field) => field.controlElement?.name === name || field.controlElement?.getAttribute('name') === name)
  }

  /** A click on a submit button is a submit attempt: remember it, and which button it was. */
  private handleClick = (event: Event) => {
    const submitter = event.composedPath().find((node): node is HTMLElement => node instanceof HTMLElement && node.matches(SUBMITTERS))
    if (!submitter || (submitter as Submittable).disabled) return
    this.lastSubmitter = submitter
    this.markIntent()
  }

  /** Enter in a single-line input submits implicitly. */
  private handleKeydown = (event: KeyboardEvent) => {
    if (event.key !== 'Enter' || event.isComposing) return
    const target = event.composedPath()[0]
    if (target instanceof HTMLInputElement) {
      this.lastSubmitter = null
      this.markIntent()
    }
  }

  private markIntent() {
    this.submitIntent = true
    setTimeout(() => (this.submitIntent = false))
  }

  /** The browser fires `invalid` on every control that fails, before it would submit: one batch per attempt. */
  private handleInvalid = (event: Event) => {
    if (!this.submitIntent) return
    // No browser bubble: the fields show the errors.
    event.preventDefault()
    if (this.failureScheduled) return
    this.failureScheduled = true
    queueMicrotask(() => {
      this.failureScheduled = false
      void this.fail(this.collectErrors())
    })
  }

  private handleSubmit = (event: SubmitEvent) => {
    event.preventDefault()
    if (this.busy) return
    const submitter = (event.submitter as HTMLElement | null) ?? this.lastSubmitter
    this.lastSubmitter = null
    void this.runSubmit(submitter)
  }

  private async runSubmit(submitter: HTMLElement | null) {
    const form = this.formElement
    if (!form) return
    this.internals.states.add('submitted')
    if (this.validator) {
      const extra = await this.validator(this.values, form)
      this.applyServerErrors(extra ?? {}, false)
      const errors = this.collectErrors()
      if (errors.length > 0) return this.fail(errors)
    }
    this.summary = []
    this.invalidFieldList = []
    this.syncStates()
    const formData = new FormData(form)
    let pending: Promise<unknown> | undefined
    const detail: ValidSubmitEventDetail = {
      formData,
      values: toValues(formData),
      submitter,
      waitUntil: (promise) => {
        pending = promise
      },
    }
    this.dispatchEvent(new CustomEvent<ValidSubmitEventDetail>('valid-submit', { detail }))
    if (pending) await this.waitFor(pending, submitter)
  }

  private async waitFor(promise: Promise<unknown>, submitter: HTMLElement | null) {
    const target = submitter as Submittable | null
    const isC2Button = target?.localName === 'c2-button'
    this.busy = true
    this.syncStates()
    if (target) {
      if (isC2Button) target.running = true
      else target.disabled = true
    }
    try {
      await promise
      this.markPristine()
    } catch (reason) {
      if (isErrorMap(reason)) {
        this.applyServerErrors(reason, false)
        await this.fail(this.collectErrors())
      } else {
        throw reason
      }
    } finally {
      this.busy = false
      if (target) {
        if (isC2Button) target.running = false
        else target.disabled = false
      }
      this.syncStates()
    }
  }

  /** Every field's error, shown, plus controls outside a field that fail their constraints. */
  private collectErrors(): FormFieldError[] {
    const form = this.formElement
    if (!form) return []
    const errors: FormFieldError[] = []
    const covered = new Set<Element>()
    for (const field of this.fields()) {
      const control = field.controlElement
      if (control) covered.add(control)
      if (!field.validate()) {
        errors.push({ name: control?.name || control?.getAttribute('name') || '', message: field.errorMessage, control })
      }
    }
    for (const element of form.elements) {
      const control = element as HTMLElement & { name?: string; validity?: ValidityState; validationMessage?: string; willValidate?: boolean }
      if (covered.has(control) || control.willValidate === false || !control.validity || control.validity.valid) continue
      errors.push({ name: control.name ?? '', message: control.validationMessage ?? '', control })
    }
    // A server error for a name that no field shows still belongs in the summary.
    for (const [name, message] of Object.entries(this.errors ?? {})) {
      if (message && !this.fieldFor(name) && !errors.some((error) => error.name === name)) errors.push({ name, message, control: null })
    }
    return errors
  }

  private async fail(errors: FormFieldError[]) {
    this.invalidFieldList = errors
    this.internals.states.add('submitted')
    const summarize = this.errorSummary === 'always' ? errors.length > 0 : this.errorSummary === 'auto' ? errors.length > 1 : false
    this.summary = summarize ? errors : []
    this.syncStates()
    await this.updateComplete
    if (summarize) {
      this.summaryElement?.focus()
      this.summaryElement?.scrollIntoView?.({ block: 'nearest' })
    } else {
      const first = errors.find((error) => error.control)?.control
      first?.focus()
      first?.scrollIntoView?.({ block: 'nearest' })
    }
    this.dispatchEvent(new CustomEvent<InvalidSubmitEventDetail>('invalid-submit', { detail: { errors } }))
  }

  /**
   * Hands server errors to their fields. `replace` clears the fields an earlier call set and this one does not name
   * (the `errors` property is the whole set); a validator's result only adds.
   */
  private applyServerErrors(errors: FormErrors, replace: boolean) {
    if (replace) {
      for (const name of this.serverErrorNames) {
        if (!errors[name]) this.fieldFor(name)?.setServerError('')
      }
      this.serverErrorNames.clear()
    }
    for (const [name, message] of Object.entries(errors)) {
      if (!message) continue
      this.fieldFor(name)?.setServerError(message)
      this.serverErrorNames.add(name)
    }
  }

  private handleReset = () => {
    this.summary = []
    this.invalidFieldList = []
    this.serverErrorNames.clear()
    this.internals.states.delete('submitted')
    // Controls reset after the event: re-read the values once they have.
    setTimeout(() => {
      this.syncStates()
      this.checkDirty()
    })
  }

  private scheduleDirtyCheck = () => {
    if (this.summary.length > 0) this.refreshSummary()
    clearTimeout(this.dirtyTimer)
    // Controls publish their form value in their own update: read it once that has run.
    this.dirtyTimer = setTimeout(() => this.checkDirty())
  }

  /** While the summary shows, entries leave it as their fields are fixed. */
  private refreshSummary() {
    setTimeout(() => {
      const remaining = this.summary.filter((error) => {
        const field = error.control?.closest('c2-form-field') as FieldLike | null
        return field ? field.errorMessage !== '' : !!error.control && !(error.control as HTMLElement & { validity?: ValidityState }).validity?.valid
      })
      if (remaining.length !== this.summary.length) this.summary = remaining
    })
  }

  private checkDirty() {
    const dirty = this.dirty
    this.syncStates()
    if (dirty === this.wasDirty) return
    this.wasDirty = dirty
    this.dispatchEvent(new CustomEvent<DirtyChangeEventDetail>('dirty-change', { detail: { dirty } }))
  }

  private handleBeforeUnload = (event: BeforeUnloadEvent) => {
    if (!this.warnUnsaved || !this.dirty) return
    event.preventDefault()
    event.returnValue = ''
  }

  private syncStates() {
    const states: Record<string, boolean> = {
      dirty: this.dirty,
      submitting: this.busy,
      invalid: this.invalidFieldList.length > 0,
    }
    for (const [name, on] of Object.entries(states)) {
      if (on) this.internals.states.add(name)
      else this.internals.states.delete(name)
    }
  }

  private focusError(event: Event, error: FormFieldError) {
    event.preventDefault()
    error.control?.focus()
    error.control?.scrollIntoView?.({ block: 'center' })
  }

  private renderSummary() {
    if (this.summary.length === 0) return nothing
    return html`<div class="summary" part="summary" role="alert" tabindex="-1">
      <div class="summary-heading" part="summary-heading"><slot name="error-summary-heading">${this.msg.t('summaryHeading', this.summary.length)}</slot></div>
      <ul class="summary-list">
        ${this.summary.map(
          (error) =>
            html`<li>
              ${
                error.control
                  ? html`<a class="summary-link" part="summary-link" href="#" @click=${(event: Event) => this.focusError(event, error)}>${error.message}</a>`
                  : html`<span class="summary-link" part="summary-link">${error.message}</span>`
              }
            </li>`,
        )}
      </ul>
    </div>`
  }

  override render() {
    return html`${this.renderSummary()}<slot @slotchange=${this.handleSlotChange}></slot>`
  }
}

function toValues(formData: FormData): FormValues {
  const values: FormValues = {}
  for (const [name, value] of formData) {
    const existing = values[name]
    if (existing === undefined) values[name] = value
    else if (Array.isArray(existing)) existing.push(value)
    else values[name] = [existing, value]
  }
  return values
}

function serialize(form: HTMLFormElement): string {
  return JSON.stringify(
    [...new FormData(form)].map(([name, value]) => [name, typeof value === 'string' ? value : `${value.name}:${value.size}:${value.lastModified}`]),
  )
}

function isErrorMap(value: unknown): value is FormErrors {
  return (
    !!value &&
    typeof value === 'object' &&
    !(value instanceof Error) &&
    Object.values(value).every((message) => typeof message === 'string' || message === null || message === undefined)
  )
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-form': Form
  }
}
