import { LitElement, html, nothing, unsafeCSS, type CSSResultGroup, type PropertyValues } from 'lit'
import { query, state } from 'lit/decorators.js'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { disabledByAncestor, redispatchEvent, SlotPresenceController } from '@c2n/core/dom-helper.js'
import { FieldContextConsumer } from '@c2n/core/contexts/field.js'
import { LocalizeController } from '@c2n/core/localize.js'
import { classMap } from 'lit/directives/class-map.js'
import { ifDefined } from 'lit/directives/if-defined.js'
import { live } from 'lit/directives/live.js'
import { numberInputMessages } from './messages.js'
import styles from './number-input.scss?inline'

/** Events fired by {@link NumberInput}, keyed for `addEventListener`. */
export interface NumberInputEventMap {
  input: InputEvent
  change: Event
}

export interface NumberInput {
  addEventListener: TypedAddEventListener<NumberInput, NumberInputEventMap>
  removeEventListener: TypedRemoveEventListener<NumberInput, NumberInputEventMap>
}

/**
 * A form-associated number field backed by a native `<input type="number">`. It keeps native decimal parsing,
 * validation and Arrow Up/Down behavior, replaces browser-specific spinners with themeable decrement/increment
 * controls, and supports prefix/suffix adornments, helper text and an error state.
 *
 * @tag c2-number-input
 *
 * @slot prefix - Currency symbol or other adornment before the value.
 * @slot suffix - Unit or other adornment after the value.
 * @slot decrement-icon - Replaces the minus icon in the decrement control.
 * @slot increment-icon - Replaces the plus icon in the increment control.
 * @slot supporting-text - Rich helper content below the field. `help` and `error-text` are plain-text shortcuts.
 *
 * @event {InputEvent} input - Re-dispatched when typing or stepping changes the value.
 * @event {Event} change - Re-dispatched when a typed value is committed or a step control changes the value.
 *
 * @cssproperty {pixel} [--c2-number-input--min-height=36px]
 * @cssproperty {border} [--c2-number-input--border=1px solid #bcbcc6]
 * @cssproperty {border-radius} [--c2-number-input--border-radius=6px]
 * @cssproperty {color} [--c2-number-input--color=#18181b]
 * @cssproperty {color} [--c2-number-input--background=#ffffff]
 * @cssproperty {font-size} [--c2-number-input--font-size=14px]
 * @cssproperty {font-family} [--c2-number-input--font-family=inherit]
 * @cssproperty {pixel} [--c2-number-input--line-height=20px]
 * @cssproperty {padding} [--c2-number-input__value--padding=6px 10px 6px 12px]
 * @cssproperty {pixel} [--c2-number-input__value--gap=8px]
 * @cssproperty {color} [--c2-number-input__placeholder--color=#71717a]
 * @cssproperty {border} [--c2-number-input__hover--border=1px solid #a1a1aa]
 * @cssproperty {border} [--c2-number-input__focus--border=1px solid #0265dc]
 * @cssproperty {outline} [--c2-number-input__focus--outline=none]
 * @cssproperty {pixel} [--c2-number-input__focus--outline-offset=0px]
 * @cssproperty {border} [--c2-number-input__error--border=1px solid #dc2626]
 * @cssproperty {outline} [--c2-number-input__error__focus--outline=none]
 * @cssproperty {color} [--c2-number-input__read-only--background=#fafafa]
 * @cssproperty {opacity} [--c2-number-input__disabled--opacity=0.38]
 * @cssproperty {pixel} [--c2-number-input__stepper--width=28px]
 * @cssproperty {border} [--c2-number-input__stepper--border-left=1px solid #e4e4e7]
 * @cssproperty {color} [--c2-number-input__stepper--color=#71717a]
 * @cssproperty {color} [--c2-number-input__stepper__hover--color=#18181b]
 * @cssproperty {color} [--c2-number-input__stepper__hover--background=#f4f4f5]
 * @cssproperty {pixel} [--c2-number-input__stepper-icon--size=14px]
 * @cssproperty {color} [--c2-number-input__adornment--color=#71717a]
 * @cssproperty {font-size} [--c2-number-input__adornment--font-size=14px]
 * @cssproperty {pixel} [--c2-number-input__supporting-text--gap=4px]
 * @cssproperty {font-size} [--c2-number-input__supporting-text--font-size=12px]
 * @cssproperty {pixel} [--c2-number-input__supporting-text--line-height=16px]
 * @cssproperty {color} [--c2-number-input__supporting-text--color=#71717a]
 * @cssproperty {color} [--c2-number-input__supporting-text__error--color=#dc2626]
 */
@customElement('c2-number-input')
export class NumberInput extends LitElement {
  static formAssociated = true
  static override styles: CSSResultGroup = unsafeCSS(styles)

  private readonly internals = this.attachInternals()
  private customValidityMessage = ''
  private defaultValue = ''
  private defaultCaptured = false
  @state() private disabledByForm = false
  @state() private focused = false
  /**
   * Whether the steppers carry the field's name. Off for the hydrating render of a server-rendered field, which must
   * match the server's markup (the server sees no enclosing field and no `<label for>`); turned on right after it.
   */
  @state() private namedSteppers = !this.shadowRoot
  /** The text of the field's first `<label for>`, read when the field connects, hydrates or takes the focus. */
  @state() private labelText = ''
  private readonly slotPresence = new SlotPresenceController(this, ['supporting-text'])
  /** Label and description handed down by an enclosing `c2-form-field`, which then draws the supporting line. */
  private readonly field = new FieldContextConsumer(this, { kind: 'text' })
  private readonly msg = new LocalizeController(this, numberInputMessages)
  @query('input') private readonly input?: HTMLInputElement

  /** Current numeric text, or an empty string. Use `valueAsNumber` for a parsed value. */
  @property({ type: String, reflect: true }) value = ''
  /** Minimum valid value. */
  @property({ type: Number }) min?: number
  /** Maximum valid value. */
  @property({ type: Number }) max?: number
  /** Increment used by Arrow keys and the step controls, or `any` to disable step controls. */
  @property({ type: String }) step = '1'
  /** Form field name. */
  @property({ type: String, reflect: true }) name = ''
  /** Browser autocomplete hint. */
  @property({ type: String }) autocomplete = ''
  /** Text shown while the field is empty. */
  @property({ type: String }) placeholder = ''
  /** Requires a number before the form can be submitted. */
  @property({ type: Boolean, reflect: true }) required = false
  /** Prevents editing while keeping the value in form submission. */
  @property({ type: Boolean, reflect: true }) readOnly = false
  /** Prevents interaction and excludes the value from form submission. */
  @property({ type: Boolean, reflect: true }) disabled = false
  /** Hides the decrement and increment controls. */
  @property({ type: Boolean, reflect: true, attribute: 'hide-steppers' }) hideSteppers = false
  /** Applies the visual error state and sets `aria-invalid`. */
  @property({ type: Boolean, reflect: true }) error = false
  /** Helper text shown below the field. */
  @property({ type: String }) help = ''
  /** Message shown below the field while `error` is set. */
  @property({ attribute: 'error-text' }) errorText = ''
  /** Accessible name forwarded to the native number input. */
  @property({ attribute: 'aria-label' }) override ariaLabel: string | null = null

  get form() {
    return this.internals.form
  }
  get labels() {
    return this.internals.labels
  }
  get validity() {
    return this.internals.validity
  }
  get validationMessage() {
    return this.internals.validationMessage
  }
  get willValidate() {
    return this.internals.willValidate
  }
  /** Parsed value, or `NaN` when empty. */
  get valueAsNumber() {
    return this.input?.valueAsNumber ?? Number.NaN
  }

  override connectedCallback() {
    super.connectedCallback()
    if (!this.defaultCaptured) {
      this.defaultValue = this.getAttribute('value') ?? ''
      this.defaultCaptured = true
    }
    this.readLabelText()
    if (!this.namedSteppers) void this.updateComplete.then(() => (this.namedSteppers = true))
  }

  override focus(options?: FocusOptions) {
    this.input?.focus(options)
  }
  /** Selects the numeric text. */
  select() {
    this.input?.select()
  }
  /** Increases the value by `step` a given number of times. */
  stepUp(amount = 1) {
    this.stepBy(Math.max(1, Math.trunc(amount)))
  }
  /** Decreases the value by `step` a given number of times. */
  stepDown(amount = 1) {
    this.stepBy(-Math.max(1, Math.trunc(amount)))
  }
  checkValidity() {
    return this.internals.checkValidity()
  }
  reportValidity() {
    return this.internals.reportValidity()
  }
  setCustomValidity(message: string) {
    this.customValidityMessage = message
    this.input?.setCustomValidity(message)
    this.syncFormState()
  }

  formResetCallback() {
    this.value = this.defaultValue
    this.error = false
  }
  formDisabledCallback(disabled: boolean) {
    this.disabledByForm = disabledByAncestor(this, disabled)
  }
  formStateRestoreCallback(state: string | File | FormData | null) {
    if (typeof state === 'string') this.value = state
  }

  // Whether the field is disabled, by its own `disabled` or by a disabled fieldset or form.
  protected get effectiveDisabled() {
    return this.disabled || this.disabledByForm
  }
  private get steppersDisabled() {
    return this.effectiveDisabled || this.readOnly || this.effectiveStep === 'any'
  }
  // The step the native input uses. A companion element overrides it (`c2-unit-input` takes the unit's own step).
  protected get effectiveStep(): string {
    return this.step
  }
  // What the form submits. A companion element overrides it to add entries (`c2-unit-input` adds the unit).
  protected formValue(): string | FormData {
    return this.value
  }
  // What the browser keeps to restore the field (back navigation, autofill); `formStateRestoreCallback` reads it.
  protected formState(): string | FormData {
    return this.value
  }
  // Ids in the shadow root that also describe the number, for a companion element's own text.
  protected descriptionIds(): string[] {
    return []
  }
  // Content a companion element adds after the number, inside the value area.
  protected renderValueEnd(): unknown {
    return nothing
  }
  // Content a companion element adds at the end of the field, after the step controls.
  protected renderFieldEnd(): unknown {
    return nothing
  }
  private get atMinimum() {
    const value = Number(this.value)
    return this.value !== '' && this.min !== undefined && Number.isFinite(value) && value <= this.min
  }
  private get atMaximum() {
    const value = Number(this.value)
    return this.value !== '' && this.max !== undefined && Number.isFinite(value) && value >= this.max
  }

  private handleInput(event: InputEvent) {
    this.value = (event.target as HTMLInputElement).value
    redispatchEvent(this, event)
  }
  private handleChange(event: Event) {
    this.value = (event.target as HTMLInputElement).value
    redispatchEvent(this, event)
  }
  // Focus moving between controls of the shadow root (the number and a companion's own control) stays inside the field:
  // the host neither loses nor regains focus, so nothing is re-dispatched.
  private movesWithin(event: FocusEvent) {
    return event.relatedTarget instanceof Node && !!this.shadowRoot?.contains(event.relatedTarget)
  }
  // A companion element binds these to its own focusable control too.
  protected handleFocusIn(event: FocusEvent) {
    this.focused = true
    this.readLabelText()
    if (!this.movesWithin(event)) redispatchEvent(this, event)
  }
  protected handleFocusOut(event: FocusEvent) {
    if (this.movesWithin(event)) return
    this.focused = false
    redispatchEvent(this, event)
  }
  // Whether a click on this element of the field belongs to a companion's own control, rather than focusing the number.
  protected ownsClick(_target: HTMLElement): boolean {
    return false
  }
  private keepInputFocus(event: Event) {
    event.preventDefault()
  }
  private forwardFocus(event: Event) {
    const target = event.target as HTMLElement
    if (!target.closest('.stepper') && !this.ownsClick(target)) this.input?.focus()
  }
  private stepBy(amount: number) {
    if (!this.input || this.steppersDisabled) return
    if (amount > 0) this.input.stepUp(amount)
    else this.input.stepDown(-amount)
    this.value = this.input.value
    this.input.focus()
    this.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertReplacementText' }))
    this.dispatchEvent(new Event('change', { bubbles: true, composed: true }))
  }

  protected override updated(changed: PropertyValues<this>) {
    if (changed.has('value') && this.input && this.input.value !== this.value) {
      this.value = this.input.value
      return
    }
    this.syncFormState()
  }

  private syncFormState() {
    if (!this.input) return
    if (this.effectiveDisabled) {
      this.internals.setFormValue(null)
      this.internals.setValidity({})
      return
    }
    this.internals.setFormValue(this.formValue(), this.formState())
    this.input.setCustomValidity(this.customValidityMessage)
    this.internals.setValidity(this.input.validity, this.input.validationMessage, this.input)
  }

  private readLabelText() {
    // `labels` is missing from the server's ElementInternals shim.
    const labels = this.internals.labels as NodeListOf<HTMLLabelElement> | undefined
    this.labelText = labels?.length ? (labels[0].textContent ?? '').replace(/\s+/g, ' ').trim() : ''
  }

  /** The field's name for its steppers: `aria-label`, the enclosing field's label, else a `<label for>`'s text. */
  private fieldName() {
    if (!this.namedSteppers) return ''
    return (this.ariaLabel || this.field.label || this.labelText).trim()
  }

  private renderStepper(direction: 'down' | 'up') {
    const down = direction === 'down'
    const disabled = this.steppersDisabled || (down ? this.atMinimum : this.atMaximum)
    const name = this.fieldName()
    const label = name ? this.msg.t(down ? 'decreaseNamed' : 'increaseNamed', name) : this.msg.t(down ? 'decrease' : 'increase')
    return html`<button
      class="stepper ${direction}"
      type="button"
      tabindex="-1"
      aria-label=${label}
      ?disabled=${disabled}
      @pointerdown=${this.keepInputFocus}
      @click=${() => (down ? this.stepDown() : this.stepUp())}
    >
      <slot name=${down ? 'decrement-icon' : 'increment-icon'}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
          <path d=${down ? 'M5 12h14' : 'M12 5v14M5 12h14'}></path>
        </svg>
      </slot>
    </button>`
  }

  override render() {
    const showError = this.error && !this.effectiveDisabled
    // An enclosing field asks for the invalid look without setting `error`, and then draws the supporting line itself.
    const invalid = (this.error || this.field.invalid) && !this.effectiveDisabled
    const message = showError ? this.errorText : this.help
    const showSupporting = !this.field.managed && (!!message || this.slotPresence.has('supporting-text'))
    return html`
      <div
        class="field ${classMap({ focused: this.focused, error: invalid, 'read-only': this.readOnly, disabled: this.effectiveDisabled })}"
        @click=${this.forwardFocus}
      >
        <div class="value-area">
          <slot name="prefix"></slot>
          <input
            type="number"
            inputmode="decimal"
            aria-label=${ifDefined(this.ariaLabel || this.field.label || undefined)}
            aria-invalid=${invalid ? 'true' : nothing}
            aria-describedby=${this.field.describedBy(...this.descriptionIds(), showSupporting && 'supporting-text')}
            name=${ifDefined(this.name || undefined)}
            autocomplete=${ifDefined(this.autocomplete || undefined)}
            min=${ifDefined(this.min)}
            max=${ifDefined(this.max)}
            step=${this.effectiveStep}
            placeholder=${this.placeholder || nothing}
            ?required=${this.required}
            ?readonly=${this.readOnly}
            ?disabled=${this.effectiveDisabled}
            .value=${live(this.value)}
            @input=${this.handleInput}
            @change=${this.handleChange}
            @focusin=${this.handleFocusIn}
            @focusout=${this.handleFocusOut}
          />
          <slot name="suffix"></slot>
          ${this.renderValueEnd()}
        </div>
        ${this.hideSteppers ? nothing : html`<div class="steppers">${this.renderStepper('up')}${this.renderStepper('down')}</div>`}${this.renderFieldEnd()}
      </div>
      ${
        showSupporting
          ? html`<div id="supporting-text" class="supporting-text ${classMap({ error: showError })}">
              <slot name="supporting-text" @slotchange=${this.slotPresence.handleSlotChange}>${message}</slot>
            </div>`
          : html`<slot name="supporting-text" hidden @slotchange=${this.slotPresence.handleSlotChange}></slot>`
      }
      ${this.field.renderDescription()}
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-number-input': NumberInput
  }
}
