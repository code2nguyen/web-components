import { LitElement, html, nothing, unsafeCSS } from 'lit'
import { state } from 'lit/decorators.js'
import { live } from 'lit/directives/live.js'
import { property, arrayPropertyConverter } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import { FieldContextConsumer } from '@c2n/core/contexts/field.js'
import { redispatchEvent } from '@c2n/core/dom-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { cardBrands, detectBrand, expiryState, formatExpiry, formatNumber, normalizeExpiry, numberState, unknownBrand, type CardBrandId } from './brands'
import { cardInputMessages } from './messages'
import styles from './card-input.scss?inline'

export { cardInputMessages } from './messages'
export { cardBrands, detectBrand, luhn, type CardBrand, type CardBrandId } from './brands'

/** What `getCardDetails()` returns: everything a payment provider's tokenize call needs. */
export interface CardDetails {
  number: string
  expMonth: number
  expYear: number
  cvc: string
  brand: CardBrandId | ''
}

/** What `card-change` carries: never the number. */
export interface CardChangeDetail {
  brand: CardBrandId | ''
  complete: boolean
  /** The message of the first problem, or `''`. */
  error: string
  /** The last four digits once the number is complete, else `''`. */
  last4: string
}

/** Events fired by {@link CardInput}, keyed for `addEventListener`. */
export interface CardInputEventMap {
  input: InputEvent
  change: Event
  'card-change': CustomEvent<CardChangeDetail>
}

export interface CardInput {
  addEventListener: TypedAddEventListener<CardInput, CardInputEventMap>
  removeEventListener: TypedRemoveEventListener<CardInput, CardInputEventMap>
}

type Segment = 'number' | 'expiry' | 'cvc'

const digitsOf = (text: string) => text.replace(/\D/g, '')

/**
 * A payment card field, like Stripe Elements' card element: the card number, the expiry date and the security code
 * in one box. The number is spaced as its brand prints it (Amex 4-6-5, most others 4-4-4-4), the brand shows as a
 * badge, and focus moves on to the expiry once the number is complete and passes the Luhn check, then to the code.
 * Backspace in an empty part goes back to the one before. Each part has its `autocomplete` token, so browsers and
 * password managers fill it.
 *
 * The number never leaves the element unless the app asks: nothing is reflected to an attribute, and no event carries
 * it. `card-change` reports the brand, whether the card is complete, the first problem and the last four digits;
 * `getCardDetails()` returns everything for the payment provider's tokenize call. Under a `name` the form receives
 * `name[number]`, `name[expiry]` (`YYYY-MM`) and `name[cvc]`, for an app that posts to its own PCI-scoped server.
 *
 * Problems show when a part loses focus, never while it is typed: an incomplete or invalid number, a brand outside
 * `brands`, an invalid or past expiry date, an incomplete code. The form does not submit while there is one. It takes
 * part in `c2-form-field`, which then shows the message.
 *
 * The badge is the brand's name in text: no trademarked logo is drawn. An app with licensed artwork puts it in the
 * brand's slot (`<img slot="brand-visa" …>`).
 *
 * @tag c2-card-input
 *
 * @slot brand - The mark shown while no brand is detected. Defaults to a card outline.
 * @slot brand-visa - The mark of a Visa card, in place of its text badge. Likewise `brand-mastercard`, `brand-amex`, `brand-discover`, `brand-diners`, `brand-jcb`, `brand-unionpay` and `brand-maestro`.
 *
 * @event {InputEvent} input - Fired as any part is typed in.
 * @event {Event} change - Fired when a part that was changed loses focus.
 * @event {CustomEvent<CardChangeDetail>} card-change - Fired after every edit, with `{ brand, complete, error, last4 }` and never the number.
 *
 * @csspart field - The box around the three parts.
 * @csspart brand - The brand mark.
 * @csspart badge - The text badge of a detected brand.
 * @csspart number - The card number input.
 * @csspart expiry - The expiry date input.
 * @csspart cvc - The security code input.
 * @csspart error - The line with the problem, hidden inside a `c2-form-field`, which shows it instead.
 *
 * @cssproperty {font-size} [--c2-card-input--font-size=14px]
 * @cssproperty {color} [--c2-card-input--color=#18181b]
 * @cssproperty {pixel} [--c2-card-input--height=40px]
 * @cssproperty {padding} [--c2-card-input--padding=0 12px]
 * @cssproperty {border} [--c2-card-input--border=1px solid #d4d4d8]
 * @cssproperty {border-radius} [--c2-card-input--border-radius=6px]
 * @cssproperty {color} [--c2-card-input--background=#ffffff]
 * @cssproperty {pixel} [--c2-card-input--gap=12px] - Space between the parts.
 * @cssproperty {border} [--c2-card-input__focus--border=1px solid #0265dc]
 * @cssproperty {outline} [--c2-card-input__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {border} [--c2-card-input__error--border=1px solid #dc2626]
 * @cssproperty {color} [--c2-card-input__error--color=#dc2626] - The problem line and the part at fault.
 * @cssproperty {font-size} [--c2-card-input__error--font-size=12px]
 * @cssproperty {color} [--c2-card-input__placeholder--color=#71717a]
 * @cssproperty {opacity} [--c2-card-input__disabled--opacity=0.38]
 * @cssproperty {width} [--c2-card-input__expiry--width=7ch]
 * @cssproperty {width} [--c2-card-input__cvc--width=5ch]
 * @cssproperty {color} [--c2-card-input__brand--color=#71717a] - The card outline shown while no brand is detected.
 * @cssproperty {color} [--c2-card-input__badge--background=#f4f4f5]
 * @cssproperty {color} [--c2-card-input__badge--color=#18181b]
 * @cssproperty {font-size} [--c2-card-input__badge--font-size=10px]
 * @cssproperty {font-weight} [--c2-card-input__badge--font-weight=600]
 * @cssproperty {border-radius} [--c2-card-input__badge--border-radius=4px]
 */
@customElement('c2-card-input')
export class CardInput extends LitElement {
  static formAssociated = true

  static override styles = unsafeCSS(styles)

  /** The brands accepted, by id (`visa`, `mastercard`, `amex`, `discover`, `diners`, `jcb`, `unionpay`, `maestro`). Empty accepts all. As an attribute, a `;`-separated list. */
  @property({ converter: arrayPropertyConverter }) brands: string[] = []

  /** Form field name: the form receives `name[number]`, `name[expiry]` and `name[cvc]`. With none, the card is not submitted. */
  @property({ reflect: true }) name = ''

  /** Asks for a card before the form submits. */
  @property({ type: Boolean, reflect: true }) required = false

  /** Turns the field off; as for a disabled form control, nothing is submitted. */
  @property({ type: Boolean, reflect: true }) disabled = false

  /** Shows the card without letting it be edited. */
  @property({ type: Boolean, reflect: true }) readonly = false

  /** The accessible name of the group. Inside a `c2-form-field`, the field's label names it. */
  @property() label = ''

  @state() private numberDigits = ''
  @state() private expiryDigits = ''
  @state() private cvcDigits = ''
  /** Parts that lost focus once: only their problems show. */
  @state() private touched = new Set<Segment>()
  @state() private disabledByForm = false
  /** The detected brand's name, in a polite live region: announced once per change. */
  @state() private brandAnnouncement = ''

  private readonly internals = this.attachInternals()
  private readonly msg = new LocalizeController(this, cardInputMessages)
  private readonly field = new FieldContextConsumer(this, { kind: 'text' })
  private customValidityMessage = ''

  constructor() {
    super()
    this.internals.role = 'group'
    // A failed submit shows every problem, as if each part had been left.
    this.addEventListener('invalid', () => (this.touched = new Set<Segment>(['number', 'expiry', 'cvc'])))
  }

  /** A page kept in the back/forward cache must not keep the card: it is cleared as the page is stored. */
  private readonly handlePageHide = (event: PageTransitionEvent) => {
    if (event.persisted) this.clear()
  }

  override connectedCallback(): void {
    super.connectedCallback()
    window.addEventListener('pagehide', this.handlePageHide)
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    window.removeEventListener('pagehide', this.handlePageHide)
  }

  /** The brand detected from the digits typed so far, or `''`. */
  get brand(): CardBrandId | '' {
    return detectBrand(this.numberDigits)?.id ?? ''
  }

  /** Whether all three parts are filled in and valid. */
  get complete(): boolean {
    return this.firstError(true) === null && !!this.numberDigits
  }

  /** The card, for the payment provider's tokenize call. Read it on submit; do not keep it. */
  getCardDetails(): CardDetails {
    return {
      number: this.numberDigits,
      expMonth: Number(this.expiryDigits.slice(0, 2)) || 0,
      expYear: this.expiryDigits.length === 4 ? 2000 + Number(this.expiryDigits.slice(2)) : 0,
      cvc: this.cvcDigits,
      brand: this.brand,
    }
  }

  /** Empties the three parts. */
  clear(): void {
    this.numberDigits = ''
    this.expiryDigits = ''
    this.cvcDigits = ''
    this.touched = new Set()
    this.brandAnnouncement = ''
    this.emitCardChange()
  }

  override focus(options?: FocusOptions): void {
    this.input('number')?.focus(options)
  }

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
    this.clear()
  }

  formDisabledCallback(disabled: boolean) {
    this.disabledByForm = disabled && !this.hasAttribute('disabled')
  }

  private get effectiveDisabled(): boolean {
    return this.disabled || this.disabledByForm
  }

  private get cvcLength(): number {
    return (detectBrand(this.numberDigits) ?? unknownBrand).cvcLength
  }

  protected override willUpdate(): void {
    this.internals.ariaLabel = this.label || this.field.label || this.msg.t('label')
  }

  protected override updated(): void {
    this.syncFormState()
  }

  /** The first problem, by part: `{ segment, message }`, or `null`. With `all`, untouched parts count too. */
  private firstError(all = false): { segment: Segment; message: string } | null {
    const shown = (segment: Segment) => all || this.touched.has(segment)
    const brand = detectBrand(this.numberDigits)
    const accepted = this.brands.length === 0 || (brand !== undefined && this.brands.includes(brand.id))
    if (shown('number')) {
      const number = numberState(this.numberDigits)
      if (brand && !accepted) return { segment: 'number', message: this.msg.t('unsupported', brand.name) }
      // A complete number of a network the component does not know is refused too when the brands are limited.
      if (!brand && !accepted && number === 'complete') return { segment: 'number', message: this.msg.t('unsupportedUnknown') }
      if (number === 'invalid') return { segment: 'number', message: this.msg.t('numberInvalid') }
      if (number === 'incomplete' || (number === 'empty' && all && this.anyFilled())) return { segment: 'number', message: this.msg.t('numberIncomplete') }
    }
    if (shown('expiry')) {
      const expiry = expiryState(this.expiryDigits)
      if (expiry === 'invalid') return { segment: 'expiry', message: this.msg.t('expiryInvalid') }
      if (expiry === 'past') return { segment: 'expiry', message: this.msg.t('expiryPast') }
      if (expiry === 'incomplete' || (expiry === 'empty' && all && this.anyFilled())) return { segment: 'expiry', message: this.msg.t('expiryIncomplete') }
    }
    if (shown('cvc')) {
      const short = this.cvcDigits.length !== this.cvcLength
      if ((this.cvcDigits && short) || (!this.cvcDigits && all && this.anyFilled())) return { segment: 'cvc', message: this.msg.t('cvcIncomplete') }
    }
    return null
  }

  private anyFilled(): boolean {
    return !!(this.numberDigits || this.expiryDigits || this.cvcDigits)
  }

  private syncFormState(): void {
    const filled = this.anyFilled()
    if (this.effectiveDisabled || !this.name || !filled) this.internals.setFormValue(null)
    else {
      const data = new FormData()
      data.append(`${this.name}[number]`, this.numberDigits)
      data.append(`${this.name}[expiry]`, this.expiryDigits.length === 4 ? `20${this.expiryDigits.slice(2)}-${this.expiryDigits.slice(0, 2)}` : '')
      data.append(`${this.name}[cvc]`, this.cvcDigits)
      // No restore state: a card number is not something to bring back from the session history.
      this.internals.setFormValue(data, '')
    }
    const error = filled ? this.firstError(true) : null
    const missing = this.required && !filled
    const message = this.customValidityMessage || error?.message || (missing ? this.msg.t('valueMissing') : '')
    const flags = this.customValidityMessage || error ? { customError: true } : missing ? { valueMissing: true } : {}
    const anchor = this.input(error?.segment ?? 'number') ?? undefined
    this.internals.setValidity(flags, message, anchor)
  }

  private input(segment: Segment): HTMLInputElement | null {
    return this.renderRoot?.querySelector<HTMLInputElement>(`input[data-segment="${segment}"]`) ?? null
  }

  private emitCardChange(): void {
    const error = this.firstError()
    const complete = this.complete
    this.dispatchEvent(
      new CustomEvent<CardChangeDetail>('card-change', {
        detail: { brand: this.brand, complete, error: error?.message ?? '', last4: complete ? this.numberDigits.slice(-4) : '' },
        bubbles: true,
        composed: true,
      }),
    )
  }

  /** Digits after an edit, with a deleted separator taking the digit before it with it. */
  private editedDigits(input: HTMLInputElement, event: InputEvent, previous: string): { digits: string; caretDigits: number } {
    const caret = input.selectionStart ?? input.value.length
    let digits = digitsOf(input.value)
    let caretDigits = digitsOf(input.value.slice(0, caret)).length
    if (event.inputType === 'deleteContentBackward' && digits === previous && caretDigits > 0) {
      digits = digits.slice(0, caretDigits - 1) + digits.slice(caretDigits)
      caretDigits -= 1
    } else if (event.inputType === 'deleteContentForward' && digits === previous && caretDigits < digits.length) {
      digits = digits.slice(0, caretDigits) + digits.slice(caretDigits + 1)
    }
    return { digits, caretDigits }
  }

  /** The caret position after `count` digits in formatted text. */
  private static caretAfter(text: string, count: number): number {
    if (count === 0) return 0
    let seen = 0
    for (let at = 0; at < text.length; at++) {
      if (/\d/.test(text[at])) seen++
      if (seen === count) return at + 1
    }
    return text.length
  }

  private async place(input: HTMLInputElement, text: string, caretDigits: number): Promise<void> {
    await this.updateComplete
    if (this.renderRoot instanceof ShadowRoot && this.renderRoot.activeElement !== input) return
    const at = CardInput.caretAfter(text, caretDigits)
    input.setSelectionRange(at, at)
  }

  private handleNumberInput(event: InputEvent): void {
    const input = event.target as HTMLInputElement
    const { digits, caretDigits } = this.editedDigits(input, event, this.numberDigits)
    const rules = detectBrand(digits) ?? unknownBrand
    const next = digits.slice(0, Math.max(...rules.lengths))
    this.numberDigits = next
    // A code typed for a 4-digit brand is cut to the new brand's length.
    if (this.cvcDigits.length > rules.cvcLength) this.cvcDigits = this.cvcDigits.slice(0, rules.cvcLength)
    const text = formatNumber(next, rules.gaps)
    input.value = text
    void this.place(input, text, Math.min(caretDigits, next.length))
    this.announceBrand()
    this.emitCardChange()
    // Complete at the usual length (or the longest), and valid: on to the expiry.
    const typedAtEnd = caretDigits >= next.length
    if (typedAtEnd && numberState(next) === 'complete' && next.length >= rules.lengths[0] && (event.inputType ?? '').startsWith('insert'))
      this.input('expiry')?.focus()
  }

  private handleExpiryInput(event: InputEvent): void {
    const input = event.target as HTMLInputElement
    const edited = this.editedDigits(input, event, this.expiryDigits)
    // Autofill and pastes may carry a four-digit year ("12/2027").
    const full = /^\D*(\d{1,2})\D+(\d{4})\D*$/.exec(input.value)
    if (full) {
      edited.digits = full[1].padStart(2, '0') + full[2].slice(2)
      edited.caretDigits = 4
    }
    const next = normalizeExpiry(edited.digits)
    const caretDigits = edited.caretDigits + (next.length > edited.digits.length ? 1 : 0)
    this.expiryDigits = next
    const text = formatExpiry(next)
    input.value = text
    void this.place(input, text, Math.min(caretDigits, next.length))
    this.emitCardChange()
    if (next.length === 4 && caretDigits >= 4 && (event.inputType ?? '').startsWith('insert') && expiryState(next) === 'complete') this.input('cvc')?.focus()
  }

  private handleCvcInput(event: InputEvent): void {
    const input = event.target as HTMLInputElement
    const next = digitsOf(input.value).slice(0, this.cvcLength)
    this.cvcDigits = next
    input.value = next
    this.emitCardChange()
  }

  private handleKeydown(segment: Segment, event: KeyboardEvent): void {
    const input = event.target as HTMLInputElement
    if (event.key !== 'Backspace' || segment === 'number' || input.selectionStart !== 0 || input.selectionEnd !== 0) return
    // Backspace at the start of a part goes back to the end of the one before.
    event.preventDefault()
    const previous = this.input(segment === 'cvc' ? 'expiry' : 'number')
    if (!previous) return
    previous.focus()
    previous.setSelectionRange(previous.value.length, previous.value.length)
  }

  private handleBlur(segment: Segment): void {
    if (this.touched.has(segment)) return
    const filled = segment === 'number' ? this.numberDigits : segment === 'expiry' ? this.expiryDigits : this.cvcDigits
    if (!filled) return
    this.touched = new Set([...this.touched, segment])
    this.emitCardChange()
  }

  private announceBrand(): void {
    const brand = detectBrand(this.numberDigits)
    const name = brand?.name ?? ''
    if (name !== this.brandAnnouncement) this.brandAnnouncement = name
  }

  private renderBrand() {
    const brand = detectBrand(this.numberDigits)
    const accepted = !brand || this.brands.length === 0 || this.brands.includes(brand.id)
    if (!brand) {
      return html`<slot name="brand"
        ><svg class="card-outline" viewBox="0 0 24 16" aria-hidden="true">
          <rect x="0.75" y="0.75" width="22.5" height="14.5" rx="2.25" />
          <path d="M0.75 5h22.5M4 11h5" /></svg
      ></slot>`
    }
    const badge = brand.id === 'amex' ? 'Amex' : brand.id === 'diners' ? 'Diners' : brand.name
    return html`<slot name="brand-${brand.id}"><span class="badge ${accepted ? '' : 'badge--rejected'}" part="badge">${badge}</span></slot>`
  }

  override render() {
    const disabled = this.effectiveDisabled
    const error = this.firstError()
    const invalid = (!!error || this.field.invalid) && !disabled
    const errorId = 'card-error'
    const describedBy = this.field.describedBy(...(error && !this.field.managed ? [errorId] : []))
    const segmentInvalid = (segment: Segment) => (error?.segment === segment || (this.field.invalid && !error) ? 'true' : nothing)
    const rules = detectBrand(this.numberDigits) ?? unknownBrand
    return html`<div class="field ${invalid ? 'field--invalid' : ''} ${disabled ? 'field--disabled' : ''}" part="field">
        <span class="brand" part="brand">${this.renderBrand()}</span>
        <input
          class="number ${error?.segment === 'number' ? 'part--invalid' : ''}"
          part="number"
          data-segment="number"
          type="text"
          inputmode="numeric"
          autocomplete="cc-number"
          spellcheck="false"
          aria-label=${this.msg.t('number')}
          aria-describedby=${describedBy}
          aria-invalid=${segmentInvalid('number')}
          aria-required=${this.required ? 'true' : nothing}
          placeholder=${this.msg.t('numberPlaceholder')}
          .value=${live(formatNumber(this.numberDigits, rules.gaps))}
          ?disabled=${disabled}
          ?readonly=${this.readonly}
          @input=${this.handleNumberInput}
          @change=${(event: Event) => redispatchEvent(this, event)}
          @blur=${() => this.handleBlur('number')}
        />
        <span class="dates">
          <input
            class="expiry ${error?.segment === 'expiry' ? 'part--invalid' : ''}"
            part="expiry"
            data-segment="expiry"
            type="text"
            inputmode="numeric"
            autocomplete="cc-exp"
            spellcheck="false"
            aria-label=${this.msg.t('expiry')}
            aria-describedby=${describedBy}
            aria-invalid=${segmentInvalid('expiry')}
            aria-required=${this.required ? 'true' : nothing}
            placeholder=${this.msg.t('expiryPlaceholder')}
            .value=${live(formatExpiry(this.expiryDigits))}
            ?disabled=${disabled}
            ?readonly=${this.readonly}
            @input=${this.handleExpiryInput}
            @change=${(event: Event) => redispatchEvent(this, event)}
            @keydown=${(event: KeyboardEvent) => this.handleKeydown('expiry', event)}
            @blur=${() => this.handleBlur('expiry')}
          />
          <input
            class="cvc ${error?.segment === 'cvc' ? 'part--invalid' : ''}"
            part="cvc"
            data-segment="cvc"
            type="text"
            inputmode="numeric"
            autocomplete="cc-csc"
            spellcheck="false"
            maxlength=${this.cvcLength}
            aria-label=${this.msg.t('cvc')}
            aria-describedby=${describedBy}
            aria-invalid=${segmentInvalid('cvc')}
            aria-required=${this.required ? 'true' : nothing}
            placeholder=${this.cvcLength === 4 ? '1234' : this.msg.t('cvcPlaceholder')}
            .value=${live(this.cvcDigits)}
            ?disabled=${disabled}
            ?readonly=${this.readonly}
            @input=${this.handleCvcInput}
            @change=${(event: Event) => redispatchEvent(this, event)}
            @keydown=${(event: KeyboardEvent) => this.handleKeydown('cvc', event)}
            @blur=${() => this.handleBlur('cvc')}
          />
        </span>
      </div>
      ${error && !this.field.managed ? html`<div class="error" part="error" id=${errorId}>${error.message}</div>` : nothing}
      <div class="visually-hidden" role="status">${this.brandAnnouncement}</div>
      ${this.field.renderDescription()}`
  }
}

/** Every brand id, for apps building a `brands` list or their own badge row. */
export const cardBrandIds: CardBrandId[] = cardBrands.map((brand) => brand.id)

declare global {
  interface HTMLElementTagNameMap {
    'c2-card-input': CardInput
  }
}
