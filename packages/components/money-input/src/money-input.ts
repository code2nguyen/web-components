import { LitElement, html, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { query, state } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { ifDefined } from 'lit/directives/if-defined.js'
import { live } from 'lit/directives/live.js'
import { arrayPropertyConverter, property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { redispatchEvent, SlotPresenceController } from '@c2n/core/dom-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import { FieldContextConsumer } from '@c2n/core/contexts/field.js'
import {
  amountOfMinorUnits,
  caretAfter,
  caretCount,
  compareMinorUnits,
  currencyName,
  decimalCharOf,
  formatMinorUnits,
  formatParsed,
  minorUnitsOf,
  moneyFormat,
  normalizeCurrency,
  normalizeMinorUnits,
  parseAmount,
  type CurrencyDisplay,
  type MoneyFormat,
} from './money-format.js'
import { moneyInputMessages } from './messages.js'
import styles from './money-input.scss?inline'

export type { CurrencyDisplay }

export interface MoneyInputCurrencyChangeDetail {
  /** ISO 4217 code of the currency now selected (`EUR`). */
  currency: string
}

/** Events fired by {@link MoneyInput}, keyed for `addEventListener`. */
export interface MoneyInputEventMap {
  input: InputEvent
  change: Event
  'currency-change': CustomEvent<MoneyInputCurrencyChangeDetail>
}

export interface MoneyInput {
  addEventListener: TypedAddEventListener<MoneyInput, MoneyInputEventMap>
  removeEventListener: TypedRemoveEventListener<MoneyInput, MoneyInputEventMap>
}

/** Splits a currency list written with semicolons, commas or spaces into unique upper-case ISO codes. */
function currencyList(list: readonly string[] | string | null | undefined): string[] {
  const items = typeof list === 'string' ? [list] : Array.isArray(list) ? list : []
  const codes = items
    .flatMap((item) => String(item).split(/[\s,;]+/))
    .map((item) => item.trim().toUpperCase())
    .filter((item) => /^[A-Z]{3}$/.test(item))
  return [...new Set(codes)]
}

/**
 * A form-associated amount field, the money input of the Stripe dashboard and Shopify admin. The value is an
 * **integer count of minor units** (`value="1050"` is $10.50, `value="1050" currency="JPY"` is ¥1,050), so amounts
 * never pass through floating point; `amount` reads and writes the same value in major units.
 *
 * The field groups digits as the user types and shows the currency symbol on the side the locale puts it (`$12.50`,
 * `12,50 €`). It accepts the locale's decimal separator, and `.` or `,` wherever the locale does not use it for
 * grouping; a pasted `1,234.56` or `1.234,56` reads as 1234.56 whatever the locale. Typing stops at the currency's
 * minor-unit digits (2 for USD, 0 for JPY, 3 for KWD), and the fraction is padded when the field loses focus.
 * Amounts are positive unless `min` is negative. The locale is `locale`, else the nearest `lang`, else the browser's.
 *
 * `currencies` lists the currencies the user may pick from: with two or more, a currency picker follows the amount.
 * Picking another currency keeps the amount in major units (10.50 USD becomes 10.50 EUR) and fires `currency-change`.
 *
 * The value is submitted under `name`; with `currency-name`, the currency code is submitted too. `required`, `min`
 * and `max` (both in minor units) report `valueMissing`, `rangeUnderflow` and `rangeOverflow`.
 *
 * @tag c2-money-input
 *
 * @slot symbol - Replaces the currency symbol drawn next to the amount.
 * @slot chevron-icon - Replaces the chevron of the currency picker.
 * @slot supporting-text - Rich helper content below the field. `help` and `error-text` are plain-text shortcuts.
 *
 * @event {InputEvent} input - Re-dispatched from the amount field on every edit; also fired when a picked currency changes the value.
 * @event {Event} change - The value was committed: the field lost focus or Enter was pressed after an edit, or a picked currency changed the value.
 * @event {CustomEvent<MoneyInputCurrencyChangeDetail>} currency-change - The user picked another currency. Does not bubble; listen on the element.
 *
 * @cssproperty {pixel} [--c2-money-input--min-height=36px]
 * @cssproperty {border} [--c2-money-input--border=1px solid #bcbcc6]
 * @cssproperty {border-radius} [--c2-money-input--border-radius=6px]
 * @cssproperty {color} [--c2-money-input--color=#18181b]
 * @cssproperty {color} [--c2-money-input--background=#ffffff]
 * @cssproperty {font-size} [--c2-money-input--font-size=14px]
 * @cssproperty {font-family} [--c2-money-input--font-family=inherit]
 * @cssproperty {pixel} [--c2-money-input--line-height=20px]
 * @cssproperty {padding} [--c2-money-input__value--padding=6px 12px] - Space around the symbol and the amount.
 * @cssproperty {pixel} [--c2-money-input__value--gap=6px] - Space between the symbol and the amount.
 * @cssproperty {text-align} [--c2-money-input__input--text-align=left] - `right` lines amounts up in a column of fields.
 * @cssproperty {font-variant-numeric} [--c2-money-input__input--font-variant-numeric=tabular-nums]
 * @cssproperty {font-weight} [--c2-money-input__input--font-weight=400]
 * @cssproperty {color} [--c2-money-input__placeholder--color=#71717a]
 * @cssproperty {border} [--c2-money-input__hover--border=1px solid #a1a1aa]
 * @cssproperty {border} [--c2-money-input__focus--border=1px solid rgb(2, 101, 220)]
 * @cssproperty {outline} [--c2-money-input__focus--outline=none]
 * @cssproperty {pixel} [--c2-money-input__focus--outline-offset=0px]
 * @cssproperty {border} [--c2-money-input__error--border=1px solid #dc2626]
 * @cssproperty {outline} [--c2-money-input__error__focus--outline=none]
 * @cssproperty {color} [--c2-money-input__read-only--background=#fafafa]
 * @cssproperty {opacity} [--c2-money-input__disabled--opacity=0.38]
 * @cssproperty {display} [--c2-money-input__symbol--display=inline] - `none` hides the currency symbol.
 * @cssproperty {color} [--c2-money-input__symbol--color=#71717a]
 * @cssproperty {font-size} [--c2-money-input__symbol--font-size=14px]
 * @cssproperty {font-weight} [--c2-money-input__symbol--font-weight=400]
 * @cssproperty {padding} [--c2-money-input__picker--padding=0 30px 0 10px] - Space around the code in the currency picker; the right side holds the chevron.
 * @cssproperty {color} [--c2-money-input__picker--color=#18181b]
 * @cssproperty {color} [--c2-money-input__picker--background=transparent]
 * @cssproperty {color} [--c2-money-input__picker__hover--background=#f4f4f5]
 * @cssproperty {font-size} [--c2-money-input__picker--font-size=14px]
 * @cssproperty {font-weight} [--c2-money-input__picker--font-weight=500]
 * @cssproperty {border} [--c2-money-input__picker--border-left=1px solid #e4e4e7] - Line between the amount and the currency picker.
 * @cssproperty {outline} [--c2-money-input__picker__focus--outline=2px solid rgba(2, 101, 220, 0.4)] - Keyboard focus ring of the currency picker.
 * @cssproperty {pixel} [--c2-money-input__icon--size=16px]
 * @cssproperty {color} [--c2-money-input__icon--color=#71717a]
 * @cssproperty {pixel} [--c2-money-input__supporting-text--gap=4px]
 * @cssproperty {font-size} [--c2-money-input__supporting-text--font-size=12px]
 * @cssproperty {pixel} [--c2-money-input__supporting-text--line-height=16px]
 * @cssproperty {color} [--c2-money-input__supporting-text--color=#71717a]
 * @cssproperty {color} [--c2-money-input__supporting-text__error--color=#dc2626]
 */
@customElement('c2-money-input')
export class MoneyInput extends LitElement {
  static formAssociated = true
  static override styles = unsafeCSS(styles)

  private readonly internals = this.attachInternals()
  private readonly msg = new LocalizeController(this, moneyInputMessages, () => this.locale)
  private readonly slotPresence = new SlotPresenceController(this, ['supporting-text'])
  /** Label and description handed down by an enclosing `c2-form-field`, which then draws the supporting line. */
  private readonly field = new FieldContextConsumer(this, { kind: 'text' })
  private customValidityMessage = ''
  private defaultValue = ''
  private defaultCurrency = 'USD'
  private defaultCaptured = false
  /** The value when the field last committed (gained focus or fired `change`). */
  private committedValue = ''
  /** The minor units the text in the field stands for, so a value written back from typing leaves the text alone. */
  private textValue = ''
  private format: MoneyFormat = moneyFormat('en-US', 'USD')
  @state() private text = ''
  @state() private disabledByForm = false
  @state() private focused = false
  @query('input') private readonly input?: HTMLInputElement

  /** The amount as an integer count of minor units (`'1050'` for 10.50 USD), or an empty string. */
  @property({ type: String }) value = ''
  /** ISO 4217 code of the currency (`USD`, `EUR`, `JPY`). Decides the symbol and the minor-unit digits. */
  @property({ type: String }) currency = 'USD'
  /** Currencies the user may pick from, as ISO codes. With two or more a picker is shown. As an attribute, separated by semicolons. */
  @property({ attribute: 'currencies', converter: arrayPropertyConverter }) currencies: string[] = []
  /** How the currency is written next to the amount: `symbol` (`CA$`), `narrowSymbol` (`$`) or `code` (`CAD`). */
  @property({ attribute: 'currency-display' }) currencyDisplay: CurrencyDisplay = 'symbol'
  /** BCP 47 locale for separators and the symbol position. Empty uses the nearest `lang`, then the browser's language. */
  @property({ type: String }) locale = ''
  /** Smallest valid value, in minor units. A negative `min` lets the user type a minus sign. */
  @property({ type: String }) min = ''
  /** Largest valid value, in minor units. */
  @property({ type: String }) max = ''
  /** Form field name of the value. */
  @property({ type: String, reflect: true }) name = ''
  /** Form field name of the currency code. Empty submits the value only. */
  @property({ attribute: 'currency-name' }) currencyName = ''
  /** Accessible name of the currency picker, when two fields with pickers sit together ("You send currency"). Default: "Currency". */
  @property({ attribute: 'currency-label' }) currencyLabel = ''
  /** Browser autocomplete hint, such as `transaction-amount`. */
  @property({ type: String }) autocomplete = ''
  /** Text shown while the field is empty. Empty shows zero in the currency's format (`0.00`). */
  @property({ type: String }) placeholder = ''
  /** Requires an amount before the form can be submitted. */
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
  /** Accessible name forwarded to the amount field. */
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
  /** Digits after the decimal separator in the current currency: 2 for USD, 0 for JPY, 3 for KWD. */
  get fractionDigits() {
    return this.currentFormat().fractionDigits
  }
  /** The value in major units (`10.5` for `value="1050"` in USD), or `NaN` when empty. Setting it rounds to the minor unit. */
  get amount(): number {
    return this.value === '' ? Number.NaN : Number(this.value) / 10 ** this.fractionDigits
  }
  set amount(amount: number) {
    this.value = Number.isFinite(amount) ? String(Math.round(amount * 10 ** this.fractionDigits)) : ''
  }

  override connectedCallback() {
    super.connectedCallback()
    if (!this.defaultCaptured) {
      this.defaultValue = normalizeMinorUnits(this.getAttribute('value'))
      this.defaultCurrency = normalizeCurrency(this.getAttribute('currency') ?? 'USD')
      this.defaultCaptured = true
    }
  }

  override focus(options?: FocusOptions) {
    this.input?.focus(options)
  }
  /** Selects the amount text. */
  select() {
    this.input?.select()
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
    this.currency = this.defaultCurrency
    this.value = this.defaultValue
    this.error = false
  }
  formDisabledCallback(disabled: boolean) {
    this.disabledByForm = disabled && !this.hasAttribute('disabled')
  }
  formStateRestoreCallback(state: string | File | FormData | null) {
    if (typeof state === 'string') this.value = state
    else if (state instanceof FormData) {
      const value = this.name ? state.get(this.name) : null
      const currency = this.currencyName ? state.get(this.currencyName) : null
      if (typeof currency === 'string') this.currency = currency
      if (typeof value === 'string') this.value = value
    }
  }

  private get effectiveDisabled() {
    return this.disabled || this.disabledByForm
  }
  private get allowNegative() {
    const min = normalizeMinorUnits(this.min)
    return min !== '' && min.startsWith('-')
  }
  private get pickerCurrencies() {
    const list = currencyList(this.currencies)
    const current = normalizeCurrency(this.currency)
    return list.includes(current) || list.length < 2 ? list : [current, ...list]
  }

  private currentFormat(): MoneyFormat {
    return moneyFormat(this.msg.resolve(), normalizeCurrency(this.currency), this.currencyDisplay)
  }

  /** The value written as the currency formats it, for validation messages (`$5.00`). */
  private displayAmount(minorUnits: string) {
    const amount = Number(minorUnits) / 10 ** this.format.fractionDigits
    try {
      return new Intl.NumberFormat(this.msg.resolve(), { style: 'currency', currency: normalizeCurrency(this.currency) }).format(amount)
    } catch {
      return formatMinorUnits(minorUnits, this.format)
    }
  }

  private showValue(value: string) {
    this.text = formatMinorUnits(value, this.format)
    this.textValue = value
  }

  protected override willUpdate(changed: PropertyValues<this>) {
    const previous = this.format
    this.format = this.currentFormat()
    const normalized = normalizeMinorUnits(this.value)
    if (normalized !== this.value) this.value = normalized

    if (!this.hasUpdated) {
      this.committedValue = this.value
      this.showValue(this.value)
      return
    }
    if (changed.has('currency') && !changed.has('value') && this.value && previous.fractionDigits !== this.format.fractionDigits) {
      // Keep the amount in major units: 10.50 USD becomes 10.50 EUR, and ¥1,050 becomes 1,050.00 in a two-digit currency.
      const amount = amountOfMinorUnits(this.value, previous)
      this.value = minorUnitsOf({ ...amount, fraction: amount.fraction.slice(0, this.format.fractionDigits) }, this.format)
      this.showValue(this.value)
    } else if (this.value !== this.textValue || previous !== this.format) {
      this.showValue(this.value)
    }
  }

  protected override updated() {
    this.syncFormState()
  }

  private handleInput(event: InputEvent) {
    const input = event.target as HTMLInputElement
    const raw = input.value
    const caret = input.selectionStart ?? raw.length
    const decimalChar = decimalCharOf(raw, this.format)
    const whole = parseAmount(raw, this.format, this.allowNegative, decimalChar)
    const prefix = parseAmount(raw.slice(0, caret), this.format, this.allowNegative, decimalChar)
    const text = formatParsed(whole, this.format)
    if (text !== raw) {
      input.value = text
      const position = caretAfter(text, caretCount(prefix, whole.negative), this.format.decimal)
      input.setSelectionRange(position, position)
    }
    this.text = text
    this.textValue = minorUnitsOf(whole, this.format)
    this.value = this.textValue
    redispatchEvent(this, event)
  }

  private handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') this.commit()
  }

  private handleFocusIn(event: FocusEvent) {
    if ((event.target as HTMLElement).localName === 'input') {
      this.focused = true
      this.committedValue = this.value
    }
    redispatchEvent(this, event)
  }

  private handleFocusOut(event: FocusEvent) {
    if ((event.target as HTMLElement).localName === 'input') {
      this.focused = false
      this.commit()
    }
    redispatchEvent(this, event)
  }

  /** Pads the fraction and fires `change` when the value moved since the last commit. */
  private commit() {
    this.showValue(this.value)
    if (this.input && this.input.value !== this.text) this.input.value = this.text
    if (this.value === this.committedValue) return
    this.committedValue = this.value
    this.dispatchEvent(new Event('change', { bubbles: true, composed: true }))
  }

  private async handleCurrencyChange(event: Event) {
    event.stopPropagation()
    const currency = (event.target as HTMLSelectElement).value
    const before = this.value
    this.currency = currency
    await this.updateComplete
    this.dispatchEvent(new CustomEvent<MoneyInputCurrencyChangeDetail>('currency-change', { detail: { currency: this.currency } }))
    if (this.value !== before) {
      this.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertReplacementText' }))
      this.committedValue = this.value
      this.dispatchEvent(new Event('change', { bubbles: true, composed: true }))
    }
  }

  private forwardFocus(event: Event) {
    if (!(event.target as HTMLElement).closest('.picker')) this.input?.focus()
  }

  private syncFormState() {
    if (!this.input) return
    if (this.effectiveDisabled) {
      this.internals.setFormValue(null)
      this.internals.setValidity({})
      return
    }
    if (this.currencyName) {
      const data = new FormData()
      if (this.name) data.append(this.name, this.value)
      data.append(this.currencyName, normalizeCurrency(this.currency))
      this.internals.setFormValue(data)
    } else {
      this.internals.setFormValue(this.value)
    }

    const min = normalizeMinorUnits(this.min)
    const max = normalizeMinorUnits(this.max)
    if (this.customValidityMessage) {
      this.internals.setValidity({ customError: true }, this.customValidityMessage, this.input)
    } else if (this.required && this.value === '') {
      this.internals.setValidity({ valueMissing: true }, this.msg.t('valueMissing'), this.input)
    } else if (this.value !== '' && min !== '' && compareMinorUnits(this.value, min) < 0) {
      this.internals.setValidity({ rangeUnderflow: true }, this.msg.t('rangeUnderflow', this.displayAmount(min)), this.input)
    } else if (this.value !== '' && max !== '' && compareMinorUnits(this.value, max) > 0) {
      this.internals.setValidity({ rangeOverflow: true }, this.msg.t('rangeOverflow', this.displayAmount(max)), this.input)
    } else {
      this.internals.setValidity({})
    }
  }

  private renderSymbol() {
    return html`<span class="symbol" aria-hidden="true"><slot name="symbol">${this.format.symbol}</slot></span>`
  }

  private renderPicker(currencies: string[], locale: string) {
    const current = normalizeCurrency(this.currency)
    // The picker's own `input` is composed and would leave the field as an amount edit; the field fires its own
    // `input` only when the pick changes the value.
    return html`<span class="picker">
      <select
        aria-label=${this.currencyLabel || this.msg.t('currency')}
        ?disabled=${this.effectiveDisabled || this.readOnly}
        @change=${this.handleCurrencyChange}
        @input=${(event: Event) => event.stopPropagation()}
      >
        ${currencies.map((code) => html`<option value=${code} title=${currencyName(locale, code)} .selected=${code === current}>${code}</option>`)}
      </select>
      <span class="chevron" aria-hidden="true">
        <slot name="chevron-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m6 9 6 6 6-6"></path>
          </svg>
        </slot>
      </span>
    </span>`
  }

  override render() {
    const locale = this.msg.locale
    const currency = normalizeCurrency(this.currency)
    const showError = this.error && !this.effectiveDisabled
    // An enclosing field asks for the invalid look without setting `error`, and then draws the supporting line itself.
    const invalid = (this.error || this.field.invalid) && !this.effectiveDisabled
    const message = showError ? this.errorText : this.help
    const showSupporting = !this.field.managed && (!!message || this.slotPresence.has('supporting-text'))
    const currencies = this.pickerCurrencies
    const describedBy = this.field.describedBy('currency-name', showSupporting && 'supporting-text')
    return html`
      <div
        class="field ${classMap({ focused: this.focused, error: invalid, 'read-only': this.readOnly, disabled: this.effectiveDisabled })}"
        @click=${this.forwardFocus}
      >
        <div class="value-area">
          ${this.format.symbolFirst ? this.renderSymbol() : nothing}
          <input
            type="text"
            inputmode=${this.format.fractionDigits > 0 ? 'decimal' : 'numeric'}
            spellcheck="false"
            aria-label=${ifDefined(this.ariaLabel || this.field.label || undefined)}
            aria-invalid=${invalid ? 'true' : nothing}
            aria-describedby=${describedBy}
            name=${ifDefined(this.name || undefined)}
            autocomplete=${ifDefined(this.autocomplete || undefined)}
            placeholder=${this.placeholder || formatMinorUnits('0', this.format)}
            ?required=${this.required}
            ?readonly=${this.readOnly}
            ?disabled=${this.effectiveDisabled}
            .value=${live(this.text)}
            @input=${this.handleInput}
            @change=${(event: Event) => event.stopPropagation()}
            @keydown=${this.handleKeydown}
            @focusin=${this.handleFocusIn}
            @focusout=${this.handleFocusOut}
          />
          ${this.format.symbolFirst ? nothing : this.renderSymbol()}
          <span id="currency-name" hidden>${currencyName(locale, currency)}</span>
        </div>
        ${currencies.length > 1 ? this.renderPicker(currencies, locale) : nothing}
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
    'c2-money-input': MoneyInput
  }
}
