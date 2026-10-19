import { LitElement, html, isServer, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { state } from 'lit/decorators.js'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { SlotPresenceController } from '@c2n/core/dom-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import {
  FIELD_CONNECT_EVENT,
  fieldConsumerOf,
  type FieldConnectEventDetail,
  type FieldContextConsumer,
  type FieldControlKind,
} from '@c2n/core/contexts/field.js'
import { formFieldMessages } from './messages'
import styles from './form-field.scss?inline'

export type FormFieldNecessity = 'required' | 'optional' | 'none'
export type FormFieldValidateOn = 'submit' | 'blur' | 'input'

/** The validity keys in the order a field reports them: the first one that fails is the message shown. */
export const VALIDITY_KEYS = [
  'valueMissing',
  'typeMismatch',
  'patternMismatch',
  'tooShort',
  'tooLong',
  'rangeUnderflow',
  'rangeOverflow',
  'stepMismatch',
  'badInput',
  'customError',
] as const

export type ValidityKey = (typeof VALIDITY_KEYS)[number]

/** What a field reads from the control it wraps: any form-associated `c2-*` control, or a native input. */
export interface FormFieldControl extends HTMLElement {
  validity?: ValidityState
  validationMessage?: string
  setCustomValidity?(message: string): void
  checkValidity?(): boolean
  required?: boolean
  readOnly?: boolean
  readonly?: boolean
  maxLength?: number
  minLength?: number
  min?: unknown
  max?: unknown
  value?: unknown
  type?: string
  name?: string
  updateComplete?: Promise<unknown>
}

/** Defaults a field inherits from the `c2-form` around it. Read by duck type, so this package does not import the form. */
interface FieldDefaults {
  necessity?: FormFieldNecessity
  validateOn?: FormFieldValidateOn
}

let warnedNative = false

/**
 * Label, hint, error, warning and character counter around one form control. Put a single control in the default
 * slot: any form-associated `c2-*` control, or a native `<input>`, `<select>` or `<textarea>`. The field reads
 * `required`, `disabled`, `readOnly`, `maxLength`, `value` and `validity` from the control, so state them once, on
 * the control.
 *
 * A `c2-*` control receives the label and the hint or error as text through the field protocol
 * (`@c2n/core/contexts/field.js`) and puts them on its own focusable element, where the ids share one tree. While
 * a field wraps it, a control that draws its own hint line (`help`, `error-text`) hides it and the field draws it
 * instead. A native control is named by slotted light-DOM `label` and `hint` elements only.
 *
 * Errors follow "reward early, punish late": nothing shows while the field is untouched or being typed in for the
 * first time. An error shows on submit (the control's `invalid` event), on `validate()`, or on blur or input when
 * `validate-on` asks for it, and from then on the field re-checks on every input, so the error clears as soon as the
 * value is fixed. The message is, in order: a server error set by `c2-form`, `error-text`, a slotted `error` element
 * whose `data-match` names the failing validity key, a slotted `error` element without `data-match`, the built-in
 * message for that key, and finally the control's own `validationMessage`.
 *
 * Layout is CSS: `--c2-form-field--direction: row` puts the label beside the control (wrapping under it once the
 * control would be narrower than `--c2-form-field__body--min-width`), and custom properties inherit, so set them once
 * on a `c2-form` or any ancestor.
 *
 * The host exposes custom states: `:state(invalid)` (the control fails a constraint), `:state(user-invalid)` (an
 * error is shown), `:state(warning)`, `:state(required)`, `:state(disabled)` and `:state(read-only)`.
 *
 * @tag c2-form-field
 *
 * @slot default - The control: one form-associated `c2-*` element or a native input, select or textarea.
 * @slot label - Rich label content; replaces `label`.
 * @slot label-action - A link or button at the end of the label row, e.g. "Forgot password?".
 * @slot hint - Rich hint content shown under the control; replaces `hint`.
 * @slot error - Error messages, read as text. Give one `data-match="valueMissing"` (or any other validity key) to show it only for that failure; one without `data-match` is used for any failure.
 *
 * @cssproperty {flex-direction} [--c2-form-field--direction=column] - `row` puts the label beside the control.
 * @cssproperty {pixel} [--c2-form-field--gap=6px] - Space between the label row, the control and the supporting line.
 * @cssproperty {pixel} [--c2-form-field--column-gap=16px] - Space between the label and the control in `row` direction.
 * @cssproperty {grid-column} [--c2-form-field--grid-column=auto] - `1 / -1` spans every column of a `c2-form` grid.
 * @cssproperty {pixel} [--c2-form-field__body--min-width=240px] - In `row` direction, the label moves above the control once the control would be narrower than this.
 *
 * @cssproperty {pixel} [--c2-form-field__label--width=auto] - Label column width in `row` direction.
 * @cssproperty {pixel} [--c2-form-field__label--padding-top=0px] - Aligns the label with the control's text in `row` direction (8px for a 36px control).
 * @cssproperty {color} [--c2-form-field__label--color=#18181b]
 * @cssproperty {font-size} [--c2-form-field__label--font-size=14px]
 * @cssproperty {font-weight} [--c2-form-field__label--font-weight=500]
 * @cssproperty {line-height} [--c2-form-field__label--line-height=20px]
 * @cssproperty {color} [--c2-form-field__required-indicator--color=#dc2626]
 * @cssproperty {color} [--c2-form-field__optional-indicator--color=#71717a]
 * @cssproperty {font-size} [--c2-form-field__optional-indicator--font-size=12px]
 * @cssproperty {color} [--c2-form-field__label-action--color=#0265dc]
 * @cssproperty {font-size} [--c2-form-field__label-action--font-size=12px]
 *
 * @cssproperty {font-size} [--c2-form-field__supporting-text--font-size=12px] - Hint, error, warning and counter.
 * @cssproperty {line-height} [--c2-form-field__supporting-text--line-height=16px]
 * @cssproperty {pixel} [--c2-form-field__supporting-text--indent=0px] - Start padding of the supporting line, e.g. to line it up with a checkbox's text.
 * @cssproperty {color} [--c2-form-field__hint--color=#71717a]
 * @cssproperty {color} [--c2-form-field__error--color=#dc2626]
 * @cssproperty {color} [--c2-form-field__warning--color=#b45309]
 * @cssproperty {pixel} [--c2-form-field__icon--size=14px] - The error and warning icon.
 * @cssproperty {color} [--c2-form-field__icon-glyph--color=#ffffff] - The exclamation mark inside the icon.
 * @cssproperty {color} [--c2-form-field__counter--color=#71717a]
 * @cssproperty {color} [--c2-form-field__counter__near-limit--color=#b45309] - Counter colour once 10% or less of the limit is left.
 *
 * @csspart label-row - The row holding the label, the necessity marker and the label action.
 * @csspart label - The label text.
 * @csspart supporting-text - The line under the control holding the hint, error or warning and the counter.
 * @csspart counter - The character counter.
 */
@customElement('c2-form-field')
export class FormField extends LitElement {
  static override styles = unsafeCSS(styles)

  private readonly internals = this.attachInternals()
  private readonly msg = new LocalizeController(this, formFieldMessages)
  private readonly slots = new SlotPresenceController(this, ['label', 'label-action', 'hint'])

  /** Plain-text label. The `label` slot wins. */
  @property({ type: String }) label = ''

  /** Plain-text hint shown under the control while there is no error or warning. The `hint` slot wins. */
  @property({ type: String }) hint = ''

  /** A custom error. Setting it makes the control invalid (`setCustomValidity`), so a form blocks submit until it is cleared. */
  @property({ attribute: 'error-text' }) errorText = ''

  /** A non-blocking warning, shown when there is no error. The form still submits. */
  @property({ attribute: 'warning-text' }) warningText = ''

  /** Shows `length / maxlength` under the control when the control has a `maxlength`. */
  @property({ type: Boolean, reflect: true }) counter = false

  /**
   * Marker style: `required` puts an asterisk on required fields, `optional` puts "Optional" on fields that are not
   * required, `none` shows neither. Unset, it follows the enclosing `c2-form`, then `required`.
   */
  @property({ type: String }) necessity: FormFieldNecessity | undefined = undefined

  /**
   * When an error first shows: `submit` (default; the control's `invalid` event or `validate()`), `blur` (when focus
   * leaves an edited control) or `input` (on every edit). Unset, it follows the enclosing `c2-form`, then `submit`.
   */
  @property({ attribute: 'validate-on' }) validateOn: FormFieldValidateOn | undefined = undefined

  @state() private control: FormFieldControl | null = null
  @state() private showErrors = false
  @state() private serverError = ''
  @state() private focused = false
  @state() private announcement = ''

  private consumer: FieldContextConsumer | undefined
  private edited = false
  private appliedCustomError = ''
  private announceTimer: ReturnType<typeof setTimeout> | undefined
  private ownerForm: HTMLFormElement | null = null
  /** A declarative shadow root is attached before the element upgrades: the field was rendered on the server. */
  private readonly serverRendered = this.shadowRoot !== null

  constructor() {
    super()
    this.addEventListener(FIELD_CONNECT_EVENT, this.handleConnect)
  }

  /** The wrapped control. */
  get controlElement(): FormFieldControl | null {
    return this.control
  }

  /** True while an error is shown. */
  get invalid(): boolean {
    return this.shownError !== ''
  }

  /** The error text currently shown, or `''`. */
  get errorMessage(): string {
    return this.shownError
  }

  /** Runs validation now and shows the result. Returns true when the control is valid. */
  validate(): boolean {
    this.showErrors = true
    this.requestUpdate()
    return this.currentError() === ''
  }

  /** Clears the shown error, the server error and the interaction state; called by `c2-form` on reset. */
  reset() {
    this.showErrors = false
    this.edited = false
    this.serverError = ''
    this.applyCustomError()
  }

  /**
   * Shows an error from outside the control, typically a server response, and makes the control invalid until the
   * user edits it. An empty string clears it.
   */
  setServerError(message: string) {
    this.serverError = message
    if (message) this.showErrors = true
    this.applyCustomError()
  }

  override connectedCallback(): void {
    super.connectedCallback()
    this.ownerForm = this.closest('form')
    this.ownerForm?.addEventListener('reset', this.handleFormReset)
    // A control that upgraded before this field announced itself to nobody: claim it now.
    this.adoptControl(this.findControl())
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.ownerForm?.removeEventListener('reset', this.handleFormReset)
    this.ownerForm = null
    this.adoptControl(null)
    clearTimeout(this.announceTimer)
  }

  private get defaults(): FieldDefaults {
    // A server render has no tree to search: the client reads the form's defaults once it upgrades.
    if (isServer) return {}
    return (this.closest('c2-form') as FieldDefaults | null) ?? {}
  }

  private get effectiveNecessity(): FormFieldNecessity {
    return this.necessity ?? this.defaults.necessity ?? 'required'
  }

  private get effectiveValidateOn(): FormFieldValidateOn {
    return this.validateOn ?? this.defaults.validateOn ?? 'submit'
  }

  private handleConnect = (event: Event) => {
    const { consumer } = (event as CustomEvent<FieldConnectEventDetail>).detail
    const target = event.composedPath()[0]
    // Only a direct child is this field's control; anything deeper belongs to that control (or a nested field).
    if (target instanceof HTMLElement && target.parentElement === this) {
      event.stopPropagation()
      if (target === this.findControl() && fieldConsumerOf(target) === consumer) this.adoptControl(target)
    }
  }

  private handleFormReset = () => {
    // The form resets its controls after the event: re-read their state on the next frame.
    this.reset()
    requestAnimationFrame(() => this.requestUpdate())
  }

  private findControl(): FormFieldControl | null {
    for (const child of this.children) {
      if (!child.hasAttribute('slot')) return child as FormFieldControl
    }
    return null
  }

  private adoptControl(control: FormFieldControl | null) {
    // The server cannot see the control, so it drew the field without one (no required marker, no counter). The
    // hydrating render must match that: adopt the control once it is done.
    if (this.serverRendered && !this.hasUpdated) {
      void this.updateComplete.then(() => this.adoptControl(this.findControl()))
      return
    }
    // The same element again counts as new once it upgraded into a consumer.
    if (control === this.control && fieldConsumerOf(control) === this.consumer) return
    const previous = this.control
    if (previous && previous !== control) {
      previous.removeEventListener('input', this.handleInput)
      previous.removeEventListener('change', this.handleInput)
      previous.removeEventListener('focusin', this.handleFocusIn)
      previous.removeEventListener('focusout', this.handleFocusOut)
      previous.removeEventListener('invalid', this.handleInvalid)
      if (this.appliedCustomError) previous.setCustomValidity?.('')
      this.consumer?.detach(this)
    }
    this.appliedCustomError = ''
    this.control = control
    this.consumer = fieldConsumerOf(control)
    if (control) {
      control.addEventListener('input', this.handleInput)
      control.addEventListener('change', this.handleInput)
      control.addEventListener('focusin', this.handleFocusIn)
      control.addEventListener('focusout', this.handleFocusOut)
      control.addEventListener('invalid', this.handleInvalid)
      // A custom element that has not upgraded yet announces itself when it does: only warn about a settled one.
      const pending = control.localName.includes('-') && !customElements.get(control.localName)
      if (!this.consumer && !pending && !warnedNative && (this.label || this.hint)) {
        warnedNative = true
        console.warn(
          `c2-form-field: <${control.localName}> does not take part in the field protocol, so the \`label\` and \`hint\` attributes cannot name it for assistive technology. Use the \`label\` and \`hint\` slots, or a c2-* control.`,
        )
      }
      this.applyCustomError()
    }
    this.requestUpdate()
  }

  private handleSlotChange = (event: Event) => {
    this.slots.handleSlotChange(event)
    if (!(event.target as HTMLSlotElement).name) this.adoptControl(this.findControl())
    this.requestUpdate()
  }

  private handleInput = (event: Event) => {
    if (event.type === 'input') this.edited = true
    if (this.serverError) {
      this.serverError = ''
      this.applyCustomError()
    }
    if (this.effectiveValidateOn === 'input' && event.type === 'input') this.showErrors = true
    if (event.type === 'change' && this.kind !== 'text') this.edited = true
    void this.refresh()
    this.scheduleAnnouncement()
  }

  private handleFocusIn = () => {
    this.focused = true
  }

  private handleFocusOut = () => {
    this.focused = false
    if (this.edited && this.effectiveValidateOn !== 'submit') this.showErrors = true
    void this.refresh()
  }

  private handleInvalid = () => {
    this.showErrors = true
    void this.refresh()
  }

  /** The control updates its validity in its own update cycle: wait for it before reading. */
  private async refresh() {
    await this.control?.updateComplete
    this.requestUpdate()
  }

  private applyCustomError() {
    const message = this.serverError || this.errorText || ''
    if (!this.control || message === this.appliedCustomError) return
    this.control.setCustomValidity?.(message)
    this.appliedCustomError = message
    void this.refresh()
  }

  private get kind(): FieldControlKind {
    if (this.consumer) return this.consumer.kind
    const control = this.control
    if (control instanceof HTMLSelectElement) return 'choice'
    if (control instanceof HTMLInputElement && (control.type === 'checkbox' || control.type === 'radio')) return 'check'
    return 'text'
  }

  private get disabled(): boolean {
    return !!this.control?.matches(':disabled')
  }

  private get required(): boolean {
    return !!this.control?.required
  }

  private get readOnly(): boolean {
    return !!(this.control?.readOnly ?? this.control?.readonly)
  }

  private get selfLabelled(): boolean {
    return this.consumer ? this.consumer.selfLabelled : this.kind === 'check'
  }

  private slotted(name: string): Element[] {
    const slot = this.renderRoot?.querySelector<HTMLSlotElement>(`slot[name="${name}"]`)
    return slot ? slot.assignedElements({ flatten: true }) : [...this.children].filter((child) => child.getAttribute('slot') === name)
  }

  private slottedText(name: string): string {
    return this.slotted(name)
      .map((element) => element.textContent?.replace(/\s+/g, ' ').trim() ?? '')
      .filter(Boolean)
      .join(' ')
  }

  private get labelText(): string {
    return this.slottedText('label') || this.label
  }

  private get hintText(): string {
    return this.slottedText('hint') || this.hint
  }

  /** The error the control has now, shown or not; `''` when it is valid. */
  private currentError(): string {
    const control = this.control
    if (!control || this.disabled) return ''
    if (this.serverError) return this.serverError
    if (this.errorText) return this.errorText
    const validity = control.validity
    if (!validity || validity.valid) return ''
    const key = VALIDITY_KEYS.find((name) => validity[name]) ?? 'customError'
    if (key === 'customError') return control.validationMessage ?? ''
    const errors = this.slotted('error')
    const matched = errors.find((element) => (element as HTMLElement).dataset.match === key)
    const generic = errors.find((element) => !(element as HTMLElement).dataset.match)
    const text = (element: Element | undefined) => element?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
    return text(matched) || text(generic) || this.builtInMessage(key) || control.validationMessage || ''
  }

  private builtInMessage(key: Exclude<ValidityKey, 'customError'>): string {
    const control = this.control
    switch (key) {
      case 'valueMissing':
        return this.kind === 'choice' ? this.msg.t('valueMissingChoice') : this.kind === 'check' ? this.msg.t('valueMissingCheck') : this.msg.t('valueMissing')
      case 'typeMismatch':
        return control?.type === 'email'
          ? this.msg.t('typeMismatchEmail')
          : control?.type === 'url'
            ? this.msg.t('typeMismatchUrl')
            : this.msg.t('typeMismatch')
      case 'tooShort':
        return this.msg.t('tooShort', Number(control?.minLength ?? 0))
      case 'tooLong':
        return this.msg.t('tooLong', Number(control?.maxLength ?? 0))
      case 'rangeUnderflow':
        return this.msg.t('rangeUnderflow', String(control?.min ?? ''))
      case 'rangeOverflow':
        return this.msg.t('rangeOverflow', String(control?.max ?? ''))
      default:
        return this.msg.t(key)
    }
  }

  private get shownError(): string {
    if (this.showErrors) return this.currentError()
    // An error the app states itself (`error-text`, a server error) shows at once; constraint failures wait.
    return this.disabled ? '' : this.serverError || this.errorText || ''
  }

  private get shownWarning(): string {
    return this.shownError || this.disabled ? '' : this.warningText
  }

  private get counterState(): { length: number; max: number; near: boolean } | null {
    const max = Number(this.control?.maxLength ?? -1)
    if (!this.counter || !(max > 0)) return null
    const value = this.control?.value
    const length = typeof value === 'string' ? value.length : 0
    return { length, max, near: max - length <= Math.ceil(max * 0.1) }
  }

  /** Announce the remaining characters, politely and only near the limit, once typing pauses. */
  private scheduleAnnouncement() {
    clearTimeout(this.announceTimer)
    this.announceTimer = setTimeout(() => {
      const counter = this.counterState
      this.announcement = counter?.near && this.focused ? this.msg.t('charactersLeft', Math.max(0, counter.max - counter.length)) : ''
    }, 600)
  }

  /** The description the control puts on its focusable element: the visible supporting line, prefixed. */
  private get description(): string {
    const parts: string[] = []
    if (this.selfLabelled && this.labelText) parts.push(this.labelText)
    const error = this.shownError
    const warning = this.shownWarning
    if (error) parts.push(`${this.msg.t('errorPrefix')} ${error}`)
    else if (warning) parts.push(`${this.msg.t('warningPrefix')} ${warning}`)
    else if (this.hintText) parts.push(this.hintText)
    return parts.join(' ')
  }

  protected override updated(changed: PropertyValues<this>): void {
    super.updated(changed)
    if (changed.has('errorText')) this.applyCustomError()
    const error = this.shownError
    this.consumer?.attach(this, {
      label: this.selfLabelled ? '' : this.labelText,
      description: this.description,
      invalid: error !== '',
    })
    if (this.control && !this.consumer) this.linkNativeControl()
    const states: Record<string, boolean> = {
      invalid: this.currentError() !== '',
      'user-invalid': error !== '',
      warning: this.shownWarning !== '',
      required: this.required,
      disabled: this.disabled,
      'read-only': this.readOnly,
      'self-labelled': this.selfLabelled,
    }
    for (const [name, on] of Object.entries(states)) {
      if (on) this.internals.states.add(name)
      else this.internals.states.delete(name)
    }
  }

  /** A native control sits in the light DOM, so it can reference the slotted light-DOM label and hint directly. */
  private linkNativeControl() {
    const control = this.control as (FormFieldControl & { ariaLabelledByElements?: Element[] | null; ariaDescribedByElements?: Element[] | null }) | null
    if (!control || !('ariaLabelledByElements' in control)) return
    const labels = this.slotted('label')
    const hints = this.slotted('hint')
    if (labels.length > 0 && !control.hasAttribute('aria-labelledby')) control.ariaLabelledByElements = labels
    if (hints.length > 0 && !control.hasAttribute('aria-describedby')) control.ariaDescribedByElements = hints
  }

  private focusControl = (event: Event) => {
    if ((event.target as Element).closest?.('[slot="label-action"]')) return
    const control = this.control
    if (!control || this.disabled) return
    if (this.selfLabelled) control.click()
    else control.focus()
  }

  private renderMarker() {
    const necessity = this.effectiveNecessity
    if (necessity === 'required' && this.required) {
      return html`<span class="required" aria-hidden="true">*</span>`
    }
    if (necessity === 'optional' && !this.required) {
      return html`<span class="optional" aria-hidden="true">${this.msg.t('optional')}</span>`
    }
    return nothing
  }

  private renderIcon() {
    return html`<svg class="icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="8" fill="currentColor"></circle>
      <rect class="glyph" x="7.1" y="3.5" width="1.8" height="5.6" rx="0.9"></rect>
      <circle class="glyph" cx="8" cy="11.6" r="1.1"></circle>
    </svg>`
  }

  private renderSupportingText() {
    const error = this.shownError
    const warning = this.shownWarning
    const counter = this.counterState
    const hasHint = !!this.hint || this.slots.has('hint')
    const message = error
      ? html`<span class="message error">${this.renderIcon()}<span>${error}</span></span>`
      : warning
        ? html`<span class="message warning">${this.renderIcon()}<span>${warning}</span></span>`
        : nothing
    const hidden = !error && !warning && !hasHint && !counter
    return html`<div class="supporting-text" part="supporting-text" ?hidden=${hidden}>
      ${message}
      <span class="message hint" ?hidden=${!!error || !!warning}><slot name="hint" @slotchange=${this.handleSlotChange}>${this.hint}</slot></span>
      ${
        counter
          ? html`<span class="counter ${counter.near ? 'near' : ''}" part="counter" aria-hidden="true">${counter.length} / ${counter.max}</span>`
          : nothing
      }
    </div>`
  }

  override render() {
    const hasLabel = !!this.label || this.slots.has('label')
    const hasAction = this.slots.has('label-action')
    const showLabelRow = hasLabel || hasAction
    return html`<div class="field">
      <div class="label-row" part="label-row" ?hidden=${!showLabelRow}>
        <span class="label" part="label" @click=${this.focusControl}
          ><slot name="label" @slotchange=${this.handleSlotChange}>${this.label}</slot>${hasLabel ? this.renderMarker() : nothing}</span
        >
        <span class="label-action"><slot name="label-action" @slotchange=${this.handleSlotChange}></slot></span>
      </div>
      <div class="body">
        <slot @slotchange=${this.handleSlotChange}></slot>
        ${this.renderSupportingText()}
        <slot name="error" hidden @slotchange=${this.handleSlotChange}></slot>
        <span class="live" aria-live="polite">${this.announcement}</span>
      </div>
    </div>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-form-field': FormField
  }
}
