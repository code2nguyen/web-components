import { LitElement, html, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { query, state } from 'lit/decorators.js'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { redispatchEvent, SlotPresenceController } from '@c2n/core/dom-helper.js'
import { classMap } from 'lit/directives/class-map.js'
import { ifDefined } from 'lit/directives/if-defined.js'
import { live } from 'lit/directives/live.js'
import styles from './otp-input.scss?inline'

/** Characters an {@link OtpInput} accepts. */
export type OtpInputMode = 'numeric' | 'alphanumeric'

/** Detail of the `complete` event. */
export interface OtpInputCompleteDetail {
  value: string
}

/** Events fired by {@link OtpInput}, keyed for `addEventListener`. */
export interface OtpInputEventMap {
  input: InputEvent
  change: Event
  complete: CustomEvent<OtpInputCompleteDetail>
}

export interface OtpInput {
  addEventListener: TypedAddEventListener<OtpInput, OtpInputEventMap>
  removeEventListener: TypedRemoveEventListener<OtpInput, OtpInputEventMap>
}

const FILTERS: Record<OtpInputMode, RegExp> = {
  numeric: /[^0-9]/g,
  alphanumeric: /[^0-9a-z]/gi,
}

/**
 * A form-associated one-time-code field that renders one cell per character. A single native input sits over the
 * cells, so typing, deleting, pasting, undo and SMS/password-manager autofill (`autocomplete="one-time-code"`) behave
 * natively, and assistive technology announces one text box rather than a row of fragments. Characters outside `mode`
 * are dropped, and `complete` fires once every cell is filled.
 *
 * @tag c2-otp-input
 *
 * @slot supporting-text - Rich helper content below the cells. `help` and `error-text` are plain-text shortcuts.
 *
 * @event {InputEvent} input - Re-dispatched when typing, deleting or pasting changes the value.
 * @event {Event} change - Re-dispatched when an edited value is committed on blur.
 * @event {CustomEvent<OtpInputCompleteDetail>} complete - Fired when user input fills every cell; `detail.value` is the code.
 *
 * @cssproperty {pixel} [--c2-otp-input--gap=8px]
 * @cssproperty {font-family} [--c2-otp-input--font-family=inherit]
 * @cssproperty {pixel} [--c2-otp-input__cell--width=40px]
 * @cssproperty {pixel} [--c2-otp-input__cell--height=44px]
 * @cssproperty {border} [--c2-otp-input__cell--border=1px solid #bcbcc6]
 * @cssproperty {border-radius} [--c2-otp-input__cell--border-radius=6px]
 * @cssproperty {color} [--c2-otp-input__cell--color=#18181b]
 * @cssproperty {color} [--c2-otp-input__cell--background=#ffffff]
 * @cssproperty {font-size} [--c2-otp-input__cell--font-size=20px]
 * @cssproperty {font-weight} [--c2-otp-input__cell--font-weight=600]
 * @cssproperty {border} [--c2-otp-input__cell__hover--border=1px solid #a1a1aa]
 * @cssproperty {border} [--c2-otp-input__cell__focus--border=1px solid #0265dc]
 * @cssproperty {outline} [--c2-otp-input__cell__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {pixel} [--c2-otp-input__cell__focus--outline-offset=0px]
 * @cssproperty {border} [--c2-otp-input__cell__error--border=1px solid #dc2626]
 * @cssproperty {color} [--c2-otp-input__cell__read-only--background=#fafafa]
 * @cssproperty {color} [--c2-otp-input__placeholder--color=#71717a]
 * @cssproperty {color} [--c2-otp-input__caret--color=#18181b]
 * @cssproperty {pixel} [--c2-otp-input__caret--width=1px]
 * @cssproperty {pixel} [--c2-otp-input__caret--height=20px]
 * @cssproperty {time} [--c2-otp-input__caret--animation-duration=1s]
 * @cssproperty {color} [--c2-otp-input__separator--color=#71717a]
 * @cssproperty {pixel} [--c2-otp-input__separator--width=8px]
 * @cssproperty {pixel} [--c2-otp-input__separator--height=2px]
 * @cssproperty {opacity} [--c2-otp-input__disabled--opacity=0.38]
 * @cssproperty {pixel} [--c2-otp-input__supporting-text--gap=4px]
 * @cssproperty {font-size} [--c2-otp-input__supporting-text--font-size=12px]
 * @cssproperty {pixel} [--c2-otp-input__supporting-text--line-height=16px]
 * @cssproperty {color} [--c2-otp-input__supporting-text--color=#71717a]
 * @cssproperty {color} [--c2-otp-input__supporting-text__error--color=#dc2626]
 */
@customElement('c2-otp-input')
export class OtpInput extends LitElement {
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

  /** Current code. Characters outside `mode` are dropped and the value is cut to `length`. */
  @property({ type: String }) value = ''
  /** Number of cells, i.e. the length of a complete code. */
  @property({ type: Number }) length = 6
  /** Characters accepted: `numeric` (digits, numeric keypad) or `alphanumeric` (letters and digits). */
  @property({ type: String }) mode: OtpInputMode = 'numeric'
  /** Splits the cells into groups of this size with a separator between them, e.g. `3` for `123-456`. `0` disables. */
  @property({ type: Number }) group = 0
  /** Shows a dot instead of each entered character. */
  @property({ type: Boolean, reflect: true }) masked = false
  /** Single character shown in every empty cell. */
  @property({ type: String }) placeholder = ''
  /** Form field name. */
  @property({ type: String }) name = ''
  /** Browser autocomplete hint. `one-time-code` lets iOS/Android offer a code received by SMS. */
  @property({ type: String }) autocomplete = 'one-time-code'
  /** Requires a complete code before the form can be submitted. */
  @property({ type: Boolean, reflect: true }) required = false
  /** Prevents editing while keeping the value in form submission. */
  @property({ type: Boolean, reflect: true }) readOnly = false
  /** Prevents interaction and excludes the value from form submission. */
  @property({ type: Boolean, reflect: true }) disabled = false
  /** Applies the visual error state and sets `aria-invalid`. */
  @property({ type: Boolean, reflect: true }) error = false
  /** Helper text shown below the cells. */
  @property({ type: String }) help = ''
  /** Message shown below the cells while `error` is set. */
  @property({ attribute: 'error-text' }) errorText = ''
  /** Accessible name forwarded to the native input. Defaults to "Verification code". */
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
  /** Whether every cell is filled. */
  get complete() {
    return this.value.length === this.cellCount
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
  /** Clears the code and focuses the first cell. */
  clear() {
    this.value = ''
    this.input?.focus()
  }
  checkValidity() {
    return this.internals.checkValidity()
  }
  reportValidity() {
    return this.internals.reportValidity()
  }
  setCustomValidity(message: string) {
    this.customValidityMessage = message
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

  private get cellCount() {
    return Math.max(1, Math.trunc(this.length) || 1)
  }
  private get effectiveDisabled() {
    return this.disabled || this.disabledByForm
  }
  private sanitize(value: string) {
    return value.replace(FILTERS[this.mode] ?? FILTERS.numeric, '').slice(0, this.cellCount)
  }

  private handleInput(event: InputEvent) {
    const input = event.target as HTMLInputElement
    const next = this.sanitize(input.value)
    // Write the filtered text back at once so a rejected character never flashes into the native input.
    if (input.value !== next) input.value = next
    const changed = next !== this.value
    this.value = next
    this.keepCaretAtEnd()
    if (!changed) {
      // A rejected character left the value as it was: keep the native event from reaching the host's listeners.
      event.stopPropagation()
      return
    }
    redispatchEvent(this, event)
    if (this.complete) this.dispatchEvent(new CustomEvent<OtpInputCompleteDetail>('complete', { detail: { value: next }, bubbles: true, composed: true }))
  }
  private handleChange(event: Event) {
    redispatchEvent(this, event)
  }
  private handleFocusIn(event: FocusEvent) {
    this.focused = true
    this.keepCaretAtEnd()
    redispatchEvent(this, event)
  }
  private handleFocusOut(event: FocusEvent) {
    this.focused = false
    redispatchEvent(this, event)
  }
  /**
   * The cells show the value left to right with the caret after the last character, so the native caret is pinned
   * to the end: arrow keys, clicks and selections would otherwise edit a position no cell is highlighting.
   */
  private keepCaretAtEnd() {
    const input = this.input
    if (!input || this.shadowRoot?.activeElement !== input) return
    const end = input.value.length
    if (input.selectionStart === 0 && input.selectionEnd === end && end > 0) return
    input.setSelectionRange(end, end)
  }
  private handleSelect() {
    this.keepCaretAtEnd()
  }
  private handlePointerUp() {
    // The click placed the caret wherever it landed; move it back once the browser is done.
    requestAnimationFrame(() => this.keepCaretAtEnd())
  }

  protected override willUpdate(changed: PropertyValues<this>) {
    if (changed.has('value') || changed.has('length') || changed.has('mode')) {
      const next = this.sanitize(this.value ?? '')
      if (next !== this.value) this.value = next
    }
  }

  protected override updated() {
    this.syncFormState()
  }

  private syncFormState() {
    if (this.effectiveDisabled) {
      this.internals.setFormValue(null)
      this.internals.setValidity({})
      return
    }
    this.internals.setFormValue(this.value, this.value)
    const anchor = this.input
    if (this.customValidityMessage) this.internals.setValidity({ customError: true }, this.customValidityMessage, anchor)
    else if (this.required && !this.value) this.internals.setValidity({ valueMissing: true }, 'Enter the code.', anchor)
    else if (this.value && !this.complete) this.internals.setValidity({ tooShort: true }, `Enter all ${this.cellCount} characters.`, anchor)
    else this.internals.setValidity({})
  }

  private renderCell(index: number) {
    const char = this.value[index]
    const active = this.focused && !this.readOnly && index === Math.min(this.value.length, this.cellCount - 1)
    const content = char ? (this.masked ? '•' : char) : this.placeholder.slice(0, 1)
    return html`<div class="cell ${classMap({ filled: !!char, active })}">
      ${char ? content : html`<span class="placeholder">${content}</span>`} ${active && !char ? html`<span class="caret"></span>` : nothing}
    </div>`
  }

  override render() {
    const count = this.cellCount
    const showError = this.error && !this.effectiveDisabled
    const message = showError ? this.errorText : this.help
    const showSupporting = !!message || this.slotPresence.has('supporting-text')
    const group = Math.trunc(this.group)
    const cells = []
    for (let index = 0; index < count; index++) {
      if (group > 0 && index > 0 && index % group === 0) {
        cells.push(html`<div class="separator"></div>`)
      }
      cells.push(this.renderCell(index))
    }
    return html`
      <div class="field ${classMap({ focused: this.focused, error: showError, 'read-only': this.readOnly, disabled: this.effectiveDisabled })}">
        <div class="cells" aria-hidden="true">${cells}</div>
        <input
          type="text"
          inputmode=${this.mode === 'numeric' ? 'numeric' : 'text'}
          pattern=${this.mode === 'numeric' ? '[0-9]*' : nothing}
          spellcheck="false"
          autocapitalize="off"
          aria-label=${this.ariaLabel || 'Verification code'}
          aria-invalid=${showError ? 'true' : nothing}
          aria-describedby=${showSupporting ? 'supporting-text' : nothing}
          name=${ifDefined(this.name || undefined)}
          autocomplete=${ifDefined(this.autocomplete || undefined)}
          ?required=${this.required}
          ?readonly=${this.readOnly}
          ?disabled=${this.effectiveDisabled}
          .value=${live(this.value)}
          @input=${this.handleInput}
          @change=${this.handleChange}
          @focusin=${this.handleFocusIn}
          @focusout=${this.handleFocusOut}
          @select=${this.handleSelect}
          @keyup=${this.handleSelect}
          @pointerup=${this.handlePointerUp}
        />
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
    'c2-otp-input': OtpInput
  }
}
