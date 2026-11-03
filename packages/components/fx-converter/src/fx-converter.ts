import { LitElement, html, nothing, svg, unsafeCSS, type PropertyValues } from 'lit'
import { live } from 'lit/directives/live.js'
import { property, arrayPropertyConverter } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import '@c2n/money-input'
import '@c2n/icon-button'
import '@c2n/button'
import '@c2n/progress'
import { fxConverterMessages } from './messages'
import styles from './fx-converter.scss?inline'

export { fxConverterMessages } from './messages'

/** A field of the converter: the amount sent (`from`) or the amount received (`to`). */
export type FxSide = 'from' | 'to'

/** The converter's state, as `input` and `change` carry it. Amounts are integers in minor units, as strings. */
export interface FxConverterValue {
  from: string
  to: string
  fromAmount: string
  toAmount: string
  /** The field the reader typed in, whose amount is kept; the other one is computed. */
  fixed: FxSide
  rate: number
}

/** Events fired by {@link FxConverter}, keyed for `addEventListener`. */
export interface FxConverterEventMap {
  input: CustomEvent<FxConverterValue>
  change: CustomEvent<FxConverterValue>
  swap: CustomEvent<{ from: string; to: string }>
  'currency-change': CustomEvent<{ side: FxSide; currency: string }>
  'rate-expire': CustomEvent<void>
  'rate-refresh': CustomEvent<void>
}

export interface FxConverter {
  addEventListener: TypedAddEventListener<FxConverter, FxConverterEventMap>
  removeEventListener: TypedRemoveEventListener<FxConverter, FxConverterEventMap>
}

type MoneyField = HTMLElement & { value: string; currency: string }

const digitCache = new Map<string, number>()

/** Fraction digits of a currency's minor unit (2 for EUR, 0 for JPY, 3 for KWD). */
export function currencyDigits(currency: string): number {
  let digits = digitCache.get(currency)
  if (digits === undefined) {
    try {
      digits = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2
    } catch {
      digits = 2
    }
    digitCache.set(currency, digits)
  }
  return digits
}

/** A minor-unit string as an integer, or `undefined` for an empty or malformed one. */
const minorOf = (value: string | null | undefined): number | undefined => {
  if (value === null || value === undefined || value.trim() === '') return undefined
  const number = Number(value)
  return Number.isSafeInteger(number) ? number : undefined
}

const timeOf = (value: string | number | undefined): number | undefined => {
  if (value === undefined || value === '') return undefined
  const time = typeof value === 'number' || /^\d+$/.test(value) ? Number(value) : Date.parse(value)
  return Number.isFinite(time) ? time : undefined
}

/** How long after the last keystroke the computed amount is announced. */
const ANNOUNCE_DELAY = 700

/**
 * Two linked amount and currency fields, the way Wise and Revolut quote a transfer: the reader types what they send or
 * what the recipient gets, and the other side is computed from `rate`, after `fee`. A swap button exchanges the two
 * currencies, and a guaranteed rate (`rate-expires`) counts down beside the rate, then asks for a new one.
 *
 * It is built from two `c2-money-input`s, so typing, the locale's grouping, pasting and the currency pickers are
 * theirs, and amounts are integers in **minor units** as there (`amount="100000"` in EUR is €1,000.00): no amount
 * passes through floating point, only the rate. `fixed` says which field `amount` belongs to: `from` (the default)
 * computes the recipient's amount as `(amount − fee) × rate`; `to` computes what to send as `amount ÷ rate + fee`,
 * rounded up so the recipient gets at least that much. Each currency rounds to its own minor unit (JPY has none).
 *
 * A swap cannot know the reverse quote, so the component shows `1 ÷ rate` marked as indicative and fires `swap`: the
 * app then sets the real `rate`. When a guaranteed rate runs out, the computed amount dims, `rate-expire` fires, and a
 * "New rate" button takes the swap button's place and fires `rate-refresh`; setting `rate` or `rate-expires` again
 * clears it. A picked currency fires `currency-change`, the cue to fetch a rate for the new pair.
 *
 * `input` and `change` carry the whole state (`{ from, to, fromAmount, toAmount, fixed, rate }`) and bubble like any
 * field's; the converter is not form-associated, so read the amounts from that detail or from `fromAmount` and
 * `toAmount`. The computed amount is announced to screen readers once typing pauses.
 *
 * @tag c2-fx-converter
 *
 * @slot swap-icon - The swap button's icon. Default: two arrows.
 *
 * @event {CustomEvent<{ from: string; to: string; fromAmount: string; toAmount: string; fixed: 'from' | 'to'; rate: number }>} input - Fired on every edit, with the computed amount already updated.
 * @event {CustomEvent<{ from: string; to: string; fromAmount: string; toAmount: string; fixed: 'from' | 'to'; rate: number }>} change - Fired when an edit is committed, a currency is picked, or the currencies are swapped.
 * @event {CustomEvent<{ from: string; to: string }>} swap - Fired when the swap button exchanged the currencies; set the new `rate`. Does not bubble.
 * @event {CustomEvent<{ side: 'from' | 'to'; currency: string }>} currency-change - Fired when the reader picked a currency in either field. Does not bubble.
 * @event {CustomEvent<void>} rate-expire - Fired when the guaranteed rate runs out. Does not bubble.
 * @event {CustomEvent<void>} rate-refresh - Fired when the reader asks for a new rate after it expired. Does not bubble.
 *
 * @csspart field - Each labelled amount field.
 * @csspart lines - The fee and rate lines between the fields.
 *
 * @internalcomponent c2-money-input
 * @internalcomponent c2-icon-button
 * @internalcomponent c2-button
 * @internalcomponent c2-progress
 *
 * @cssproperty {border} [--c2-fx-converter--border=1px solid #e4e4e7]
 * @cssproperty {border-radius} [--c2-fx-converter--border-radius=14px]
 * @cssproperty {color} [--c2-fx-converter--background=#ffffff]
 * @cssproperty {color} [--c2-fx-converter--color=#18181b]
 * @cssproperty {padding} [--c2-fx-converter--padding=16px]
 * @cssproperty {pixel} [--c2-fx-converter--gap=4px] - Space between the fields and the lines.
 * @cssproperty {color} [--c2-fx-converter__label--color=#71717a]
 * @cssproperty {font-size} [--c2-fx-converter__label--font-size=12px]
 * @cssproperty {font-weight} [--c2-fx-converter__label--font-weight=500]
 * @cssproperty {font-size} [--c2-fx-converter__amount--font-size=20px] - The amounts in the two fields.
 * @cssproperty {pixel} [--c2-fx-converter__amount--line-height=28px]
 * @cssproperty {border} [--c2-fx-converter__rail--border=2px solid #e4e4e7] - The line the fee and rate lines hang from.
 * @cssproperty {font-size} [--c2-fx-converter__line--font-size=12px]
 * @cssproperty {font-weight} [--c2-fx-converter__line__value--font-weight=500]
 * @cssproperty {color} [--c2-fx-converter__line__label--color=#71717a]
 * @cssproperty {color} [--c2-fx-converter__rate--color=#0265dc]
 * @cssproperty {color} [--c2-fx-converter__expired--color=#dc2626]
 * @cssproperty {opacity} [--c2-fx-converter__stale--opacity=0.38] - The computed amount while the rate has expired.
 * @cssproperty {border} [--c2-fx-converter__swap--border=1px solid #e4e4e7]
 * @cssproperty {pixel} [--c2-fx-converter__swap-icon--size=20px] - The swap icon, slotted or default.
 */
@customElement('c2-fx-converter')
export class FxConverter extends LitElement {
  static override styles = unsafeCSS(styles)

  /** The currency sent. */
  @property() from = 'USD'

  /** The currency received. */
  @property() to = 'EUR'

  /** Currencies both pickers offer, as a `;` list. A picker shows with two or more. */
  @property({ converter: arrayPropertyConverter }) currencies: string[] = []

  /** Currencies the upper picker offers, when they differ from `currencies`. */
  @property({ attribute: 'from-currencies', converter: arrayPropertyConverter }) fromCurrencies: string[] = []

  /** Currencies the lower picker offers, when they differ from `currencies`. */
  @property({ attribute: 'to-currencies', converter: arrayPropertyConverter }) toCurrencies: string[] = []

  /** The amount typed, in minor units of its field's currency; empty for none. */
  @property() amount = ''

  /** The field `amount` belongs to; the other is computed. */
  @property() fixed: FxSide = 'from'

  /** 1 unit of `from` buys `rate` units of `to`. 0 (unknown) leaves the computed field empty. */
  @property({ type: Number }) rate = 0

  /** The fee, in minor units of `from`, taken before converting. Set, it draws the fee lines. */
  @property() fee = ''

  /** When a guaranteed rate runs out: an ISO time or epoch milliseconds. The rate line counts down to it. */
  @property({ attribute: 'rate-expires' }) rateExpires = ''

  /** The most that can be sent, in minor units of `from`: above it, the upper field shows an error. */
  @property() max = ''

  /** The label of the upper field. Default: "You send". */
  @property({ attribute: 'from-label' }) fromLabel = ''

  /** The label of the lower field. Default: "Recipient gets", or "Recipient gets exactly" once typed in. */
  @property({ attribute: 'to-label' }) toLabel = ''

  /** The locale amounts are formatted in. Without it: the nearest `lang`. */
  @property() locale = ''

  /** Turns off both fields and the swap button. */
  @property({ type: Boolean, reflect: true }) disabled = false

  /** Shows the amounts without letting them be edited or swapped. */
  @property({ type: Boolean, attribute: 'readonly' }) readOnly = false

  private readonly internals = this.attachInternals()
  private readonly msg = new LocalizeController(this, fxConverterMessages, () => this.locale)
  /** Seconds left on the guaranteed rate, or `undefined` without one. */
  private left?: number
  /** The guarantee's length when it was set, for the ring. */
  private span = 0
  private expired = false
  private indicative = false
  /** The inverted rate the swap button set, until the update that draws it. */
  private swapping: number | undefined
  private timer: ReturnType<typeof setInterval> | undefined
  private announceTimer: ReturnType<typeof setTimeout> | undefined
  private announcement = ''
  /** A currency picked in a field: the `input` that follows it is the picker's, not the reader's typing. */
  private picking: FxSide | undefined
  private formats = new Map<string, Intl.NumberFormat>()

  constructor() {
    super()
    this.internals.role = 'group'
  }

  /** The amount sent, in minor units of `from`. */
  get fromAmount(): string {
    return this.amounts().from
  }

  /** The amount received, in minor units of `to`. */
  get toAmount(): string {
    return this.amounts().to
  }

  /** The state `input` and `change` carry. */
  get value(): FxConverterValue {
    const { from, to } = this.amounts()
    return { from: this.from, to: this.to, fromAmount: from, toAmount: to, fixed: this.fixed, rate: this.rate }
  }

  override connectedCallback(): void {
    super.connectedCallback()
    if (this.hasUpdated) this.startClock()
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    clearInterval(this.timer)
    clearTimeout(this.announceTimer)
  }

  /** Both amounts: the typed one as given, the other computed. Empty strings where there is nothing to show. */
  private amounts(): { from: string; to: string } {
    const typed = minorOf(this.amount)
    if (typed === undefined) return { from: '', to: '' }
    const fromDigits = currencyDigits(this.from)
    const toDigits = currencyDigits(this.to)
    const fee = Math.max(0, minorOf(this.fee) ?? 0)
    const rate = Number.isFinite(this.rate) && this.rate > 0 ? this.rate : 0
    if (this.fixed === 'to') {
      if (!rate) return { from: '', to: String(typed) }
      const major = typed / 10 ** toDigits / rate
      // Rounded up: the recipient must get at least what was typed.
      const from = Math.ceil(Math.round(major * 10 ** fromDigits * 1e6) / 1e6) + fee
      return { from: String(from), to: String(typed) }
    }
    if (!rate) return { from: String(typed), to: '' }
    const converted = Math.max(0, typed - fee)
    const to = Math.round((converted / 10 ** fromDigits) * rate * 10 ** toDigits)
    return { from: String(typed), to: String(to) }
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('rate') || changed.has('rateExpires')) {
      // The swap's inverted rate is a guess until the app sets the real quote, which clears it; a quote the app sets
      // from its `swap` listener lands in the same update, and is not the guess.
      this.indicative = this.swapping !== undefined && this.rate === this.swapping
      this.swapping = undefined
      this.expired = false
      // A new rate after a guarantee ran out is a new quote: without a new `rate-expires`, it has no guarantee.
      const stale = timeOf(this.rateExpires)
      if (changed.has('rate') && !changed.has('rateExpires') && stale !== undefined && stale <= Date.now()) this.rateExpires = ''
      const expires = timeOf(this.rateExpires)
      this.span = expires === undefined ? 0 : Math.max(1, Math.ceil((expires - Date.now()) / 1000))
      this.tick(false)
    }
  }

  protected override firstUpdated(): void {
    this.startClock()
  }

  protected override updated(changed: PropertyValues<this>): void {
    if (changed.has('rateExpires')) this.startClock()
  }

  private startClock(): void {
    clearInterval(this.timer)
    this.timer = undefined
    if (timeOf(this.rateExpires) === undefined || this.expired) return
    this.timer = setInterval(() => this.tick(true), 1000)
  }

  /** Counts the guarantee down; at zero, marks the rate expired and fires `rate-expire` once. */
  private tick(render: boolean): void {
    const expires = timeOf(this.rateExpires)
    if (expires === undefined) {
      this.left = undefined
      return
    }
    const left = Math.max(0, Math.ceil((expires - Date.now()) / 1000))
    const changed = left !== this.left
    this.left = left
    if (left === 0 && !this.expired) {
      this.expired = true
      clearInterval(this.timer)
      this.timer = undefined
      this.announce(this.msg.t('expired'), 0)
      this.dispatchEvent(new CustomEvent('rate-expire'))
    }
    if (render && changed) this.requestUpdate()
  }

  private announce(text: string, delay = ANNOUNCE_DELAY): void {
    clearTimeout(this.announceTimer)
    this.announceTimer = setTimeout(() => {
      // Cleared first, so the same sentence twice is still a change the live region reads.
      this.announcement = ''
      this.requestUpdate()
      requestAnimationFrame(() => {
        this.announcement = text
        this.requestUpdate()
      })
    }, delay)
  }

  private handleInput(side: FxSide, event: Event): void {
    event.stopPropagation()
    if (this.picking === side && side !== this.fixed) return
    const field = event.currentTarget as MoneyField
    this.amount = field.value
    this.fixed = side
    const { from, to } = this.amounts()
    const computed = side === 'from' ? to : from
    if (computed) {
      const currency = side === 'from' ? this.to : this.from
      const text = this.formatMoney(computed, currency)
      this.announce(this.msg.t(side === 'from' ? 'announceTo' : 'announceFrom', text))
    }
    this.dispatchEvent(new CustomEvent('input', { detail: this.value, bubbles: true, composed: true }))
  }

  private handleChange(event: Event): void {
    event.stopPropagation()
    // A picked currency fires the converter's own `change`, once, whether or not the field's value moved.
    if (this.picking) return
    this.dispatchEvent(new CustomEvent('change', { detail: this.value, bubbles: true, composed: true }))
  }

  private handleCurrency(side: FxSide, event: CustomEvent<{ currency: string }>): void {
    const currency = event.detail.currency
    if (side === 'from') this.from = currency
    else this.to = currency
    this.picking = side
    this.dispatchEvent(new CustomEvent('currency-change', { detail: { side, currency } }))
    // The field fires its `input` and `change` right after this event, in the same task.
    queueMicrotask(() => {
      this.picking = undefined
      this.dispatchEvent(new CustomEvent('change', { detail: this.value, bubbles: true, composed: true }))
    })
  }

  private swap(): void {
    const { from, to } = this
    this.from = to
    this.to = from
    const fromList = this.fromCurrencies
    this.fromCurrencies = this.toCurrencies
    this.toCurrencies = fromList
    // The typed amount keeps its value in major units, as the field does when its currency changes: 1,000 USD
    // swapped to JPY is ¥1,000, so the minor units are rescaled to the field's new currency.
    const typed = minorOf(this.amount)
    if (typed !== undefined) {
      const [before, after] = this.fixed === 'from' ? [from, to] : [to, from]
      this.amount = String(Math.round(typed * 10 ** (currencyDigits(after) - currencyDigits(before))))
    }
    // The fee was in the old sending currency, and the guarantee was for the old pair.
    this.fee = ''
    this.rateExpires = ''
    if (this.rate > 0) {
      this.rate = 1 / this.rate
      this.swapping = this.rate
    }
    this.dispatchEvent(new CustomEvent('swap', { detail: { from: this.from, to: this.to } }))
    this.dispatchEvent(new CustomEvent('change', { detail: this.value, bubbles: true, composed: true }))
  }

  private refresh(): void {
    this.dispatchEvent(new CustomEvent('rate-refresh'))
  }

  /** The field enrols in a `c2-form-field` and fires `input`/`change` of its own: the converter speaks for both. */
  private stopInner(event: Event): void {
    event.stopPropagation()
  }

  private formatNumber(value: number, options: Intl.NumberFormatOptions): string {
    const key = `${this.msg.locale}|${JSON.stringify(options)}`
    let format = this.formats.get(key)
    if (!format) {
      try {
        format = new Intl.NumberFormat(this.msg.locale, options)
      } catch {
        format = new Intl.NumberFormat('en', options)
      }
      this.formats.set(key, format)
    }
    return format.format(value)
  }

  /** An amount in minor units as "1,079.72 USD". */
  private formatMoney(minor: string | number, currency: string): string {
    const digits = currencyDigits(currency)
    return `${this.formatNumber(Number(minor) / 10 ** digits, { minimumFractionDigits: digits, maximumFractionDigits: digits })} ${currency}`
  }

  private formatLeft(seconds: number): string {
    const minutes = seconds >= 60
    return this.formatNumber(minutes ? Math.ceil(seconds / 60) : seconds, { style: 'unit', unit: minutes ? 'minute' : 'second', unitDisplay: 'narrow' })
  }

  private listFor(side: FxSide): string[] {
    const own = side === 'from' ? this.fromCurrencies : this.toCurrencies
    const list = own.length ? own : this.currencies
    const current = side === 'from' ? this.from : this.to
    // The current currency is always offered, or the picker could not show it.
    return list.length && !list.includes(current) ? [current, ...list] : list
  }

  private renderField(side: FxSide, value: string, label: string, error: string) {
    const stale = this.expired && side !== this.fixed
    return html`<label class="field field--${side} ${stale ? 'field--stale' : ''}" part="field">
      <span class="label">${label}</span>
      <c2-money-input
        aria-label=${label}
        currency-label=${this.msg.t('currencyOf', label)}
        .value=${live(value)}
        currency=${side === 'from' ? this.from : this.to}
        .currencies=${this.listFor(side)}
        locale=${this.locale || nothing}
        ?disabled=${this.disabled}
        ?readonly=${this.readOnly}
        ?error=${!!error}
        error-text=${error || nothing}
        @input=${(event: Event) => this.handleInput(side, event)}
        @change=${this.handleChange}
        @currency-change=${(event: CustomEvent<{ currency: string }>) => this.handleCurrency(side, event)}
      ></c2-money-input>
    </label>`
  }

  private renderRate() {
    const rate = Number.isFinite(this.rate) && this.rate > 0 ? this.rate : 0
    if (!rate) return nothing
    const rateText = this.formatNumber(rate, { maximumSignificantDigits: 6 })
    let status
    if (this.expired) status = html`<span class="line__label expired">${this.msg.t('expired')}</span>`
    else if (this.indicative) status = html`<span class="line__label">${this.msg.t('indicative')}</span>`
    else if (this.left !== undefined && this.span) {
      status = html`<span class="line__label lock"
        ><c2-progress class="lock__ring" variant="circular" aria-hidden="true" value=${Math.round((this.left / this.span) * 100)}></c2-progress>${this.msg.t(
          'guaranteed',
          this.formatLeft(this.left),
        )}</span
      >`
    } else status = html`<span class="line__label">${this.msg.t('rate')}</span>`
    const value = this.fee !== '' ? `× ${rateText}` : this.msg.t('rateLine', this.from, rateText, this.to)
    return html`<li class="line line--rate"><span class="line__value">${value}</span>${status}</li>`
  }

  private renderFee(from: string) {
    const fee = minorOf(this.fee)
    if (fee === undefined) return nothing
    const typed = minorOf(from)
    const converted = typed === undefined ? undefined : Math.max(0, typed - fee)
    return html`<li class="line">
        <span class="line__value">− ${this.formatMoney(fee, this.from)}</span><span class="line__label">${this.msg.t('fee')}</span>
      </li>
      ${
        converted !== undefined
          ? html`<li class="line">
              <span class="line__value">= ${this.formatMoney(converted, this.from)}</span><span class="line__label">${this.msg.t('converted')}</span>
            </li>`
          : nothing
      }`
  }

  override render() {
    const { from, to } = this.amounts()
    const max = minorOf(this.max)
    const fromMinor = minorOf(from)
    const error = max !== undefined && fromMinor !== undefined && fromMinor > max ? this.msg.t('overMax', this.formatMoney(max, this.from)) : ''
    const lines = [this.renderFee(from), this.renderRate()].filter((line) => line !== nothing)
    const toLabel = this.toLabel || this.msg.t(this.fixed === 'to' ? 'toExactLabel' : 'toLabel')
    const action = this.expired
      ? html`<c2-button class="refresh" ?disabled=${this.disabled} @click=${this.refresh}>
          <svg slot="prefix-icon" viewBox="0 0 24 24" aria-hidden="true">
            ${svg`<path d="M21 12a9 9 0 1 1-2.64-6.36L21 8"></path><path d="M21 3v5h-5"></path>`}
          </svg>
          ${this.msg.t('newRate')}
        </c2-button>`
      : html`<c2-icon-button class="swap" aria-label=${this.msg.t('swap')} ?disabled=${this.disabled || this.readOnly} @click=${this.swap}>
          <slot name="swap-icon">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              ${svg`<path d="M7 4v16"></path><path d="m3 8 4-4 4 4"></path><path d="M17 20V4"></path><path d="m21 16-4 4-4-4"></path>`}
            </svg>
          </slot>
        </c2-icon-button>`
    return html`<div class="converter" @c2-field-connect=${this.stopInner}>
      ${this.renderField('from', from, this.fromLabel || this.msg.t('fromLabel'), error)}
      <div class="middle">
        ${
          lines.length
            ? html`<ul class="lines" part="lines">
                ${lines}
              </ul>`
            : html`<span></span>`
        }
        ${action}
      </div>
      ${this.renderField('to', to, toLabel, '')}
      <span class="visually-hidden" aria-live="polite">${this.announcement}</span>
    </div>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-fx-converter': FxConverter
  }
}
