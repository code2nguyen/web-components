import { LitElement, html, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { query, state } from 'lit/decorators.js'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { redispatchEvent, SlotPresenceController } from '@c2n/core/dom-helper.js'
import { classMap } from 'lit/directives/class-map.js'
import { ifDefined } from 'lit/directives/if-defined.js'
import { live } from 'lit/directives/live.js'
import styles from './time-input.scss?inline'

/** Events fired by {@link TimeInput}, keyed for `addEventListener`. */
export interface TimeInputEventMap {
  input: InputEvent
  change: Event
}

export interface TimeInput {
  addEventListener: TypedAddEventListener<TimeInput, TimeInputEventMap>
  removeEventListener: TypedRemoveEventListener<TimeInput, TimeInputEventMap>
}

/**
 * A form-associated time-of-day field backed by a native `<input type="time">`. Values, `min` and `max` are 24-hour
 * strings (`HH:mm`, or `HH:mm:ss` when `step` is below 60 seconds); the browser displays them in the user's locale
 * (12- or 24-hour). The native picker and keyboard editing remain available while the component adds a consistent
 * field, clock affordance, helper text, error state and theming surface.
 *
 * @tag c2-time-input
 *
 * @slot clock-icon - Replaces the clock icon at the end of the field.
 * @slot supporting-text - Rich helper content below the field. `help` and `error-text` are plain-text shortcuts.
 *
 * @event {InputEvent} input - Re-dispatched from the inner time input whenever the value changes.
 * @event {Event} change - Re-dispatched from the inner time input when the value is committed.
 *
 * @cssproperty {pixel} [--c2-time-input--min-height=36px]
 * @cssproperty {pixel} [--c2-time-input--gap=8px]
 * @cssproperty {padding} [--c2-time-input--padding=6px 8px 6px 12px]
 * @cssproperty {border} [--c2-time-input--border=1px solid #bcbcc6]
 * @cssproperty {border-radius} [--c2-time-input--border-radius=6px]
 * @cssproperty {color} [--c2-time-input--color=#18181b]
 * @cssproperty {color} [--c2-time-input--background=#ffffff]
 * @cssproperty {font-size} [--c2-time-input--font-size=14px]
 * @cssproperty {font-family} [--c2-time-input--font-family=inherit]
 * @cssproperty {pixel} [--c2-time-input--line-height=20px]
 * @cssproperty {border} [--c2-time-input__hover--border=1px solid #a1a1aa]
 * @cssproperty {border} [--c2-time-input__focus--border=1px solid #0265dc]
 * @cssproperty {outline} [--c2-time-input__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {pixel} [--c2-time-input__focus--outline-offset=0px]
 * @cssproperty {border} [--c2-time-input__error--border=1px solid #dc2626]
 * @cssproperty {outline} [--c2-time-input__error__focus--outline=2px solid rgba(220, 38, 38, 0.25)]
 * @cssproperty {color} [--c2-time-input__read-only--background=#fafafa]
 * @cssproperty {opacity} [--c2-time-input__disabled--opacity=0.38]
 * @cssproperty {pixel} [--c2-time-input__clock-icon--size=18px]
 * @cssproperty {color} [--c2-time-input__clock-icon--color=#71717a]
 * @cssproperty {color} [--c2-time-input__clock-icon__hover--color=#18181b]
 * @cssproperty {pixel} [--c2-time-input__supporting-text--gap=4px]
 * @cssproperty {font-size} [--c2-time-input__supporting-text--font-size=12px]
 * @cssproperty {pixel} [--c2-time-input__supporting-text--line-height=16px]
 * @cssproperty {color} [--c2-time-input__supporting-text--color=#71717a]
 * @cssproperty {color} [--c2-time-input__supporting-text__error--color=#dc2626]
 */
@customElement('c2-time-input')
export class TimeInput extends LitElement {
  static formAssociated = true
  static override styles = unsafeCSS(styles)

  private readonly internals = this.attachInternals()
  private customValidityMessage = ''
  private defaultValue = ''
  private defaultCaptured = false
  @state() private disabledByForm = false
  @state() private focused = false
  private readonly slotPresence = new SlotPresenceController(this, ['supporting-text'])
  @query('input') private readonly input?: HTMLInputElement

  /** Current time as a 24-hour `HH:mm` or `HH:mm:ss` string, or an empty string. */
  @property({ type: String, reflect: true }) value = ''
  /** Earliest valid time as `HH:mm`. When `min` is later than `max` the range wraps past midnight. */
  @property({ type: String }) min = ''
  /** Latest valid time as `HH:mm`. */
  @property({ type: String }) max = ''
  /** Granularity in seconds between valid times. Below 60 the field also shows seconds. */
  @property({ type: Number }) step = 60
  /** Form field name. */
  @property({ type: String }) name = ''
  /** Browser autocomplete hint. */
  @property({ type: String }) autocomplete = ''
  /** Requires a time before the form can be submitted. */
  @property({ type: Boolean, reflect: true }) required = false
  /** Prevents editing while keeping the value in form submission. */
  @property({ type: Boolean, reflect: true }) readOnly = false
  /** Prevents interaction and excludes the value from form submission. */
  @property({ type: Boolean, reflect: true }) disabled = false
  /** Applies the visual error state and sets `aria-invalid`. */
  @property({ type: Boolean, reflect: true }) error = false
  /** Helper text shown below the field. */
  @property({ type: String }) help = ''
  /** Message shown below the field while `error` is set. */
  @property({ attribute: 'error-text' }) errorText = ''
  /** Accessible name forwarded to the native time input. */
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
  /** Current time as milliseconds since midnight, or `NaN` when empty. */
  get valueAsNumber() {
    return this.input?.valueAsNumber ?? NaN
  }

  override connectedCallback() {
    super.connectedCallback()
    if (!this.defaultCaptured) {
      this.defaultValue = this.getAttribute('value') ?? ''
      this.defaultCaptured = true
    }
  }

  override focus(options?: FocusOptions) {
    this.input?.focus(options)
  }

  /** Opens the browser time picker when supported. Must be called from a user gesture. */
  showPicker() {
    this.input?.showPicker()
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
    this.disabledByForm = disabled && !this.hasAttribute('disabled')
  }
  formStateRestoreCallback(state: string | File | FormData | null) {
    if (typeof state === 'string') this.value = state
  }

  private get effectiveDisabled() {
    return this.disabled || this.disabledByForm
  }

  private handleInput(event: InputEvent) {
    this.value = (event.target as HTMLInputElement).value
    redispatchEvent(this, event)
  }
  private handleChange(event: Event) {
    this.value = (event.target as HTMLInputElement).value
    redispatchEvent(this, event)
  }
  private handleFocusIn(event: FocusEvent) {
    this.focused = true
    redispatchEvent(this, event)
  }
  private handleFocusOut(event: FocusEvent) {
    this.focused = false
    redispatchEvent(this, event)
  }
  private openPicker(event: Event) {
    event.stopPropagation()
    if (this.effectiveDisabled || this.readOnly) return
    // Not every engine ships a time picker; keyboard editing still works when showPicker() refuses.
    try {
      this.showPicker()
    } catch {
      this.input?.focus()
    }
  }
  private forwardFocus(event: Event) {
    if (event.target !== this.input) this.input?.focus()
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
    this.internals.setFormValue(this.value, this.value)
    this.input.setCustomValidity(this.customValidityMessage)
    this.internals.setValidity(this.input.validity, this.input.validationMessage, this.input)
  }

  override render() {
    const showError = this.error && !this.effectiveDisabled
    const message = showError ? this.errorText : this.help
    const showSupporting = !!message || this.slotPresence.has('supporting-text')
    return html`
      <div
        class="field ${classMap({ focused: this.focused, error: showError, 'read-only': this.readOnly, disabled: this.effectiveDisabled })}"
        @click=${this.forwardFocus}
      >
        <input
          type="time"
          aria-label=${ifDefined(this.ariaLabel || undefined)}
          aria-invalid=${showError ? 'true' : nothing}
          aria-describedby=${showSupporting ? 'supporting-text' : nothing}
          name=${ifDefined(this.name || undefined)}
          autocomplete=${ifDefined(this.autocomplete || undefined)}
          min=${ifDefined(this.min || undefined)}
          max=${ifDefined(this.max || undefined)}
          step=${this.step}
          ?required=${this.required}
          ?readonly=${this.readOnly}
          ?disabled=${this.effectiveDisabled}
          .value=${live(this.value)}
          @input=${this.handleInput}
          @change=${this.handleChange}
          @focusin=${this.handleFocusIn}
          @focusout=${this.handleFocusOut}
        />
        <button
          class="clock-button"
          type="button"
          tabindex="-1"
          aria-label="Open time picker"
          ?disabled=${this.effectiveDisabled || this.readOnly}
          @click=${this.openPicker}
        >
          <slot name="clock-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="9"></circle>
              <path d="M12 7v5l3 2"></path>
            </svg>
          </slot>
        </button>
      </div>
      ${
        showSupporting
          ? html`<div id="supporting-text" class="supporting-text ${classMap({ error: showError })}">
              <slot name="supporting-text" @slotchange=${this.slotPresence.handleSlotChange}>${message}</slot>
            </div>`
          : html`<slot name="supporting-text" hidden @slotchange=${this.slotPresence.handleSlotChange}></slot>`
      }
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-time-input': TimeInput
  }
}
