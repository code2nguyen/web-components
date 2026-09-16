import { LitElement, html, unsafeCSS, type PropertyValues } from 'lit'
import { property, state } from 'lit/decorators.js'
import { styleMap } from 'lit/directives/style-map.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import styles from './rate.scss?inline'

export interface RateChangeEventDetail {
  value: number
}

/** Events fired by {@link Rate}, keyed for `addEventListener`. */
export interface RateEventMap {
  'rate-change': CustomEvent<RateChangeEventDetail>
  input: Event
  change: Event
}

export interface Rate {
  addEventListener: TypedAddEventListener<Rate, RateEventMap>
  removeEventListener: TypedRemoveEventListener<Rate, RateEventMap>
}

/**
 * Accessible star rating control with pointer preview, keyboard adjustment and optional half-star values.
 *
 * @tag c2-rate
 *
 * @event {CustomEvent<RateChangeEventDetail>} rate-change - Fired after the user commits a rating. `detail.value` is the new value.
 * @event {Event} input - Fired with `rate-change` for form and framework bindings.
 * @event {Event} change - Fired with `rate-change` after the value is committed.
 *
 * @cssproperty {pixel} [--c2-rate__icon--size=24px]
 * @cssproperty {pixel} [--c2-rate__container--gap=4px]
 * @cssproperty {color} [--c2-rate__icon--color=#e4e4e7]
 * @cssproperty {color} [--c2-rate__icon__filled--color=#facc15]
 * @cssproperty {color} [--c2-rate__icon__preview--color=#fbbf24]
 * @cssproperty {number} [--c2-rate__icon__hover--scale=1.12]
 * @cssproperty {duration} [--c2-rate__icon--transition-duration=150ms]
 * @cssproperty {outline} [--c2-rate__container__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {pixel} [--c2-rate__container__focus--outline-offset=3px]
 * @cssproperty {border-radius} [--c2-rate__container--border-radius=4px]
 * @cssproperty {opacity} [--c2-rate__container__disabled--opacity=0.38]
 */
@customElement('c2-rate')
export class Rate extends LitElement {
  static formAssociated = true

  static override styles = unsafeCSS(styles)
  static override shadowRootOptions = { ...LitElement.shadowRootOptions, delegatesFocus: true }

  private readonly internals = this.attachInternals()
  private defaultValue = 0
  private defaultValueCaptured = false
  private customValidityMessage = ''
  @state() private previewValue: number | null = null
  @state() private disabledByForm = false

  /** Current rating and submitted form value. */
  @property({ type: Number, reflect: true }) value = 0

  /** Number of rating icons. */
  @property({ type: Number, reflect: true }) max = 5

  /** Allow values in half-star steps. */
  @property({ type: Boolean, attribute: 'allow-half', reflect: true }) allowHalf = false

  /** Clicking the committed rating again clears it to zero. */
  @property({ type: Boolean, reflect: true }) clearable = false

  /** Prevents changes while keeping the rating visually available. */
  @property({ type: Boolean, reflect: true }) readonly = false

  /** Disables interaction and form submission. */
  @property({ type: Boolean, reflect: true }) disabled = false

  /** Requires a rating greater than zero for native form validation. */
  @property({ type: Boolean, reflect: true }) required = false

  /** Name used when the rating participates in a form. */
  @property({ type: String }) name = ''

  /** Accessible name of the rating control. */
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

  override connectedCallback(): void {
    super.connectedCallback()
    if (!this.defaultValueCaptured) {
      this.defaultValue = this.normalizeValue(Number(this.getAttribute('value') ?? 0))
      this.defaultValueCaptured = true
    }
  }

  formResetCallback(): void {
    this.value = this.defaultValue
  }

  formDisabledCallback(disabled: boolean): void {
    this.disabledByForm = disabled && !this.hasAttribute('disabled')
  }

  formStateRestoreCallback(state: string | File | FormData | null): void {
    if (typeof state === 'string') this.value = this.normalizeValue(Number(state))
  }

  checkValidity(): boolean {
    return this.internals.checkValidity()
  }

  reportValidity(): boolean {
    return this.internals.reportValidity()
  }

  setCustomValidity(message: string): void {
    this.customValidityMessage = message
    this.syncFormState()
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('max')) {
      const max = Number.isFinite(this.max) ? Math.max(1, Math.floor(this.max)) : 5
      if (max !== this.max) this.max = max
    }
    if (changed.has('value') || changed.has('max') || changed.has('allowHalf')) {
      const value = this.normalizeValue(this.value)
      if (value !== this.value) this.value = value
    }
  }

  protected override updated(_changed: PropertyValues<this>): void {
    this.syncFormState()
  }

  private get effectiveDisabled(): boolean {
    return this.disabled || this.disabledByForm
  }

  private get step(): number {
    return this.allowHalf ? 0.5 : 1
  }

  private normalizeValue(value: number): number {
    if (!Number.isFinite(value)) return 0
    const max = Number.isFinite(this.max) ? Math.max(1, Math.floor(this.max)) : 5
    return Math.min(max, Math.max(0, Math.round(value / this.step) * this.step))
  }

  private valueFromPointer(event: PointerEvent, index: number): number {
    if (!this.allowHalf) return index + 1
    const item = event.currentTarget as HTMLElement
    const bounds = item.getBoundingClientRect()
    return index + (event.clientX - bounds.left <= bounds.width / 2 ? 0.5 : 1)
  }

  private handlePointerMove(event: PointerEvent, index: number): void {
    if (this.readonly || this.effectiveDisabled) return
    this.previewValue = this.valueFromPointer(event, index)
  }

  private handleClick(event: PointerEvent, index: number): void {
    if (this.readonly || this.effectiveDisabled) return
    const next = this.valueFromPointer(event, index)
    this.commit(this.clearable && next === this.value ? 0 : next)
  }

  private handleKeydown(event: KeyboardEvent): void {
    if (this.readonly || this.effectiveDisabled) return
    let next: number | undefined
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = this.value + this.step
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = this.value - this.step
    if (event.key === 'Home') next = 0
    if (event.key === 'End') next = this.max
    if (next === undefined) return
    event.preventDefault()
    this.commit(next)
  }

  private commit(value: number): void {
    const next = this.normalizeValue(value)
    if (next === this.value) return
    this.value = next
    this.previewValue = null
    this.dispatchEvent(new CustomEvent<RateChangeEventDetail>('rate-change', { detail: { value: next }, bubbles: true, composed: true }))
    this.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
    this.dispatchEvent(new Event('change', { bubbles: true, composed: true }))
  }

  private syncFormState(): void {
    const serialized = String(this.value)
    this.internals.setFormValue(this.effectiveDisabled ? null : serialized, serialized)
    const missing = this.required && this.value === 0
    const flags = this.customValidityMessage ? { customError: true } : missing ? { valueMissing: true } : {}
    const message = this.customValidityMessage || (missing ? 'Please choose a rating.' : '')
    this.internals.setValidity(flags, message, this.renderRoot.querySelector('.rate') as HTMLElement | undefined)
  }

  private fillFor(index: number): number {
    const value = this.previewValue ?? this.value
    return Math.max(0, Math.min(1, value - index)) * 100
  }

  private renderStar(className: string) {
    return html`<svg class=${className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="m12 2.8 2.82 5.72 6.31.92-4.57 4.45 1.08 6.29L12 17.21l-5.64 2.97 1.08-6.29-4.57-4.45 6.31-.92L12 2.8Z"></path>
    </svg>`
  }

  override render() {
    const previewing = this.previewValue !== null
    return html`
      <div
        class="rate"
        role="slider"
        tabindex=${this.readonly || this.effectiveDisabled ? -1 : 0}
        aria-label=${this.ariaLabel || 'Rating'}
        aria-valuemin="0"
        aria-valuemax=${this.max}
        aria-valuenow=${this.value}
        aria-valuetext=${`${this.value} out of ${this.max}`}
        aria-disabled=${this.effectiveDisabled ? 'true' : 'false'}
        aria-readonly=${this.readonly ? 'true' : 'false'}
        @keydown=${this.handleKeydown}
        @pointerleave=${() => (this.previewValue = null)}
      >
        ${Array.from({ length: this.max }, (_, index) => {
          const fill = this.fillFor(index)
          return html`
            <span
              class="item ${previewing ? 'item--preview' : ''}"
              data-index=${index}
              @pointermove=${(event: PointerEvent) => this.handlePointerMove(event, index)}
              @click=${(event: PointerEvent) => this.handleClick(event, index)}
            >
              ${this.renderStar('star star--empty')}
              <span class="fill" style=${styleMap({ width: `${fill}%` })}>${this.renderStar('star star--filled')}</span>
            </span>
          `
        })}
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-rate': Rate
  }
}
