import { LitElement, html, nothing, svg, unsafeCSS, type PropertyValues } from 'lit'
import { state } from 'lit/decorators.js'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import { FieldContextConsumer } from '@c2n/core/contexts/field.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { keypadMessages } from './messages'
import styles from './keypad.scss?inline'

export { keypadMessages } from './messages'

/** What the keypad shows above its keys: the typed `amount`, `pin` dots, or `none`. */
export type KeypadDisplay = 'amount' | 'pin' | 'none'

/** Events fired by {@link Keypad}, keyed for `addEventListener`. */
export interface KeypadEventMap {
  input: Event
  change: Event
  complete: CustomEvent<{ value: string }>
}

export interface Keypad {
  addEventListener: TypedAddEventListener<Keypad, KeypadEventMap>
  removeEventListener: TypedRemoveEventListener<Keypad, KeypadEventMap>
}

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9']

const deleteIcon = svg`<path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"></path><line x1="18" y1="9" x2="12" y2="15"></line><line x1="12" y1="9" x2="18" y2="15"></line>`

/**
 * A numeric keypad, like the amount screen of Revolut or Cash App and the passcode screen of a banking app: big keys
 * for 0 to 9 and Delete, laid out as on a phone, driving a display above them.
 *
 * - `display="amount"` (the default) shows what is typed as an amount, grouped and formatted for the language, in
 *   `currency` when one is set. The bottom left key is the decimal point, and `decimals` limits the digits after it
 *   (`0` removes the key).
 * - `display="pin"` shows a dot per digit of a code `length` digits long and fires `complete` once it is full.
 * - `display="none"` shows no display: point `for` at the `id` of a field (an `<input>`, a `c2-text-field`) and the
 *   keypad types into it.
 *
 * Without a decimal key, the bottom left cell holds the `start` slot: a fingerprint or face ID button on a passcode
 * screen. The keys also follow a hardware keyboard while focus is on one of them: the digits, the decimal point and
 * Backspace.
 *
 * `value` is the text typed (`"1250.5"`). It is a form control: under a `name` the form receives it, `required` asks
 * for a value, a PIN must be complete, and it takes part in `c2-form-field`. `clear()` empties it.
 *
 * @tag c2-keypad
 *
 * @slot start - The bottom left key when there is no decimal key: a biometric button on a passcode screen.
 *
 * @event {Event} input - Fired when a key changes the value. Read `value`.
 * @event {Event} change - Fired with `input` after each key that changes the value. Not fired for programmatic changes.
 * @event {CustomEvent<{ value: string }>} complete - With `display="pin"`, fired when the last digit of the code is typed.
 *
 * @csspart display - The amount or the dots above the keys.
 * @csspart dot - One dot of a PIN.
 * @csspart keys - The grid of keys.
 * @csspart key - Every key.
 * @csspart delete - The Delete key.
 *
 * @cssproperty {pixel} [--c2-keypad--width=280px] - Width of the keypad; the keys share it in three columns.
 * @cssproperty {pixel} [--c2-keypad__keys--gap=8px] - Space between the keys.
 * @cssproperty {pixel} [--c2-keypad__key--height=64px]
 * @cssproperty {background} [--c2-keypad__key--background=#f4f4f5]
 * @cssproperty {background} [--c2-keypad__key__hover--background=#e4e4e7]
 * @cssproperty {background} [--c2-keypad__key__active--background=#d4d4d8] - While a key is pressed.
 * @cssproperty {color} [--c2-keypad__key--color=#18181b]
 * @cssproperty {border} [--c2-keypad__key--border=none]
 * @cssproperty {border-radius} [--c2-keypad__key--border-radius=14px]
 * @cssproperty {font-size} [--c2-keypad__key--font-size=24px]
 * @cssproperty {font-weight} [--c2-keypad__key--font-weight=500]
 * @cssproperty {outline} [--c2-keypad__key__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {pixel} [--c2-keypad__display--gap=24px] - Space between the display and the keys.
 * @cssproperty {color} [--c2-keypad__display--color=#18181b]
 * @cssproperty {color} [--c2-keypad__display__empty--color=#71717a] - The zero an empty amount shows.
 * @cssproperty {color} [--c2-keypad__display__error--color=#dc2626] - While an enclosing `c2-form-field` shows an error.
 * @cssproperty {font-size} [--c2-keypad__display--font-size=40px]
 * @cssproperty {font-weight} [--c2-keypad__display--font-weight=600]
 * @cssproperty {pixel} [--c2-keypad__dot--size=14px]
 * @cssproperty {pixel} [--c2-keypad__dot--gap=16px]
 * @cssproperty {border} [--c2-keypad__dot--border=2px solid #71717a] - An empty dot.
 * @cssproperty {color} [--c2-keypad__dot__filled--color=#18181b] - A dot that holds a digit.
 * @cssproperty {opacity} [--c2-keypad__disabled--opacity=0.38]
 */
@customElement('c2-keypad')
export class Keypad extends LitElement {
  static formAssociated = true

  static override styles = unsafeCSS(styles)

  /** What shows above the keys: `amount`, `pin` dots, or `none`. */
  @property({ reflect: true }) display: KeypadDisplay = 'amount'

  /** The text typed: digits, and with an amount one decimal point. Kept to what the keys could have typed. */
  @property() value = ''

  /** How many digits a PIN has (`display="pin"`). */
  @property({ type: Number }) length = 4

  /** Digits allowed after the decimal point of an amount; `0` removes the decimal key. */
  @property({ type: Number }) decimals = 2

  /** The most characters an amount takes, the decimal point included. */
  @property({ type: Number, attribute: 'max-length' }) maxLength = 12

  /** ISO 4217 code of the currency the amount is shown in (`USD`, `EUR`); empty shows a plain number. */
  @property() currency = ''

  /** The `id` of a field, in the same document or shadow root, that the keypad types into. */
  @property() for = ''

  /** Form field name: the form receives `value`. */
  @property({ reflect: true }) name = ''

  /** Asks for a value: an empty keypad is invalid. */
  @property({ type: Boolean, reflect: true }) required = false

  /** Turns the keys off; as for a disabled form control, the value is not submitted. */
  @property({ type: Boolean, reflect: true }) disabled = false

  /** The accessible name of the keypad. Inside a `c2-form-field`, the field's label names it. */
  @property() label = ''

  @state() private disabledByForm = false

  private readonly internals = this.attachInternals()
  private readonly msg = new LocalizeController(this, keypadMessages)
  private readonly field = new FieldContextConsumer(this, { kind: 'text' })
  private defaultValue: string | undefined
  private customValidityMessage = ''

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
    this.value = this.defaultValue ?? ''
  }

  formDisabledCallback(disabled: boolean) {
    this.disabledByForm = disabled && !this.hasAttribute('disabled')
  }

  formStateRestoreCallback(state: string | File | FormData | null) {
    if (typeof state === 'string') this.value = state
  }

  /** Empties the keypad. Fires no event. */
  clear(): void {
    this.value = ''
  }

  override focus(options?: FocusOptions) {
    this.renderRoot.querySelector<HTMLElement>('.key')?.focus(options)
  }

  private get isPin() {
    return this.display === 'pin'
  }

  private get pinLength() {
    return Number.isFinite(this.length) && this.length > 0 ? Math.floor(this.length) : 4
  }

  private get decimalPlaces() {
    return !this.isPin && Number.isFinite(this.decimals) && this.decimals > 0 ? Math.floor(this.decimals) : 0
  }

  private get effectiveDisabled() {
    return this.disabled || this.disabledByForm
  }

  protected override willUpdate(changed: PropertyValues<this>) {
    if (changed.has('value') || changed.has('display') || changed.has('length') || changed.has('decimals') || changed.has('maxLength')) {
      const value = this.sanitize(this.value)
      if (value !== this.value) this.value = value
    }
    if (this.defaultValue === undefined) this.defaultValue = this.value
  }

  protected override updated() {
    this.syncFormState()
  }

  /** The value the keys could have typed: digits, one point with an amount, within the lengths. */
  private sanitize(raw: unknown): string {
    const text = typeof raw === 'string' ? raw : raw == null ? '' : String(raw)
    if (this.isPin) return text.replace(/\D/g, '').slice(0, this.pinLength)
    let value = ''
    for (const char of text) value = this.apply(value, char === ',' ? '.' : char)
    return value
  }

  /** The value after one key; unchanged when the key cannot apply. */
  private apply(value: string, key: string): string {
    if (key === 'Backspace') return value.slice(0, -1)
    if (this.isPin) return /^\d$/.test(key) && value.length < this.pinLength ? value + key : value
    if (key === '.') {
      if (!this.decimalPlaces || value.includes('.') || value.length + (value ? 1 : 2) > this.maxLength) return value
      return `${value || '0'}.`
    }
    if (!/^\d$/.test(key)) return value
    const point = value.indexOf('.')
    if (point >= 0 && value.length - point - 1 >= this.decimalPlaces) return value
    if (value.length >= this.maxLength) return value
    // No leading zeros: "0" then "5" is "5".
    if (value === '0') return key
    return value + key
  }

  private press(key: string) {
    if (this.effectiveDisabled) return
    const next = this.apply(this.value, key)
    if (next === this.value) return
    this.value = next
    this.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
    this.dispatchEvent(new Event('change', { bubbles: true, composed: true }))
    this.typeIntoTarget(next)
    if (this.isPin && next.length === this.pinLength) {
      this.dispatchEvent(new CustomEvent('complete', { detail: { value: next }, bubbles: true, composed: true }))
    }
  }

  /** Writes the value into the `for` field as typing would: its value, then its own `input` and `change`. */
  private typeIntoTarget(value: string) {
    if (!this.for) return
    const root = this.getRootNode() as Document | ShadowRoot
    const target = root.getElementById?.(this.for) as (HTMLElement & { value?: unknown }) | null
    if (!target || !('value' in target)) return
    target.value = value
    target.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
    target.dispatchEvent(new Event('change', { bubbles: true }))
  }

  private syncFormState() {
    const value = this.value
    this.internals.setFormValue(this.effectiveDisabled || !this.name || !value ? null : value, value)
    if (this.effectiveDisabled) {
      this.internals.setValidity({})
      return
    }
    const anchor = this.renderRoot?.querySelector<HTMLElement>('.key') ?? undefined
    if (this.customValidityMessage) this.internals.setValidity({ customError: true }, this.customValidityMessage, anchor)
    else if (this.required && !value) this.internals.setValidity({ valueMissing: true }, this.msg.t('required'), anchor)
    else if (this.isPin && value && value.length < this.pinLength)
      this.internals.setValidity({ tooShort: true }, this.msg.t('incomplete', this.pinLength), anchor)
    else this.internals.setValidity({})
  }

  private handleKeydown(event: KeyboardEvent) {
    if (event.ctrlKey || event.metaKey || event.altKey) return
    let key: string | undefined
    if (/^\d$/.test(event.key)) key = event.key
    else if (event.key === '.' || event.key === ',' || event.key === 'Decimal') key = '.'
    else if (event.key === 'Backspace' || event.key === 'Delete') key = 'Backspace'
    if (!key) return
    event.preventDefault()
    this.press(key)
  }

  private decimalSeparator(): string {
    return new Intl.NumberFormat(this.msg.locale).formatToParts(1.5).find((part) => part.type === 'decimal')?.value ?? '.'
  }

  /** The amount as it reads: grouped, in the currency, with the digits typed after the point (and the point alone). */
  private formatAmount(): string {
    const [whole = '', fraction = ''] = this.value.split('.')
    const options: Intl.NumberFormatOptions = { minimumFractionDigits: fraction.length, maximumFractionDigits: fraction.length }
    let format: Intl.NumberFormat
    try {
      format = new Intl.NumberFormat(this.msg.locale, this.currency ? { ...options, style: 'currency', currency: this.currency } : options)
    } catch {
      // An unknown currency code reads as a plain number.
      format = new Intl.NumberFormat(this.msg.locale, options)
    }
    const parts = format.formatToParts(Number(`${whole || '0'}.${fraction || '0'}`))
    if (this.value.endsWith('.')) {
      const lastInteger = parts.map((part) => part.type).lastIndexOf('integer')
      parts.splice(lastInteger + 1, 0, { type: 'decimal', value: this.decimalSeparator() })
    }
    return parts.map((part) => part.value).join('')
  }

  private renderDisplay() {
    if (this.display === 'none') return nothing
    const invalid = this.field.invalid && !this.effectiveDisabled
    if (this.isPin) {
      const count = this.value.length
      return html`<div class="display display--pin ${invalid ? 'display--invalid' : ''}" part="display">
        <span class="dots" aria-hidden="true">
          ${Array.from({ length: this.pinLength }, (_, index) => html`<span class="dot ${index < count ? 'dot--filled' : ''}" part="dot"></span>`)}
        </span>
        <span class="visually-hidden" role="status">${count ? this.msg.t('entered', count, this.pinLength) : ''}</span>
      </div>`
    }
    return html`<output
      class="display display--amount ${this.value ? '' : 'display--empty'} ${invalid ? 'display--invalid' : ''}"
      part="display"
      aria-live="polite"
      >${this.formatAmount()}</output
    >`
  }

  override render() {
    const disabled = this.effectiveDisabled
    const name = this.label || this.field.label || this.msg.t(this.isPin ? 'pin' : this.display === 'none' ? 'keypad' : 'amount')
    const key = (label: string) => html`<button class="key" part="key" type="button" ?disabled=${disabled} @click=${() => this.press(label)}>${label}</button>`
    const separator = this.decimalSeparator()
    return html`<div class="keypad ${disabled ? 'keypad--disabled' : ''}">
        ${this.renderDisplay()}
        <div
          class="keys"
          part="keys"
          role="group"
          aria-label=${name}
          aria-describedby=${this.field.describedBy()}
          aria-invalid=${this.field.invalid && !disabled ? 'true' : nothing}
          @keydown=${this.handleKeydown}
        >
          ${DIGITS.map(key)}
          ${
            this.decimalPlaces
              ? html`<button class="key" part="key" type="button" aria-label=${this.msg.t('decimal')} ?disabled=${disabled} @click=${() => this.press('.')}>
                  ${separator}
                </button>`
              : html`<span class="start"><slot name="start"></slot></span>`
          }
          ${key('0')}
          <button
            class="key key--delete"
            part="key delete"
            type="button"
            aria-label=${this.msg.t('delete')}
            ?disabled=${disabled}
            @click=${() => this.press('Backspace')}
          >
            <svg
              viewBox="0 0 24 24"
              width="26"
              height="26"
              fill="none"
              stroke="currentColor"
              stroke-width="1.75"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              ${deleteIcon}
            </svg>
          </button>
        </div>
      </div>
      ${this.field.renderDescription()}`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-keypad': Keypad
  }
}
