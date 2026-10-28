import { LitElement, html, nothing, svg, unsafeCSS, type PropertyValues } from 'lit'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import { quantityPickerMessages } from './messages'
import styles from './quantity.scss?inline'

/** The private event a counter sends its picker when the reader changed it. */
export const QUANTITY_CHANGE = 'c2-quantity-change'
/** The private event a counter sends its picker when its value changed by any means, so the summary follows. */
export const QUANTITY_SYNC = 'c2-quantity-sync'

/**
 * One counter of a `c2-quantity-picker`: a label, an optional hint and a stepper. The reader steps it with the − and
 * + buttons, or with ↑ ↓ Home End on its value, which is a spinbutton (the one tab stop of the counter).
 *
 * `one` and `other` are the singular and plural nouns the picker's summary uses ("2 adults, 1 child"); a counter
 * without them is summed into the summary as its label. `name` is its key in the picker's `values`.
 *
 * @tag c2-quantity
 *
 * @slot - The counter's label ("Adults").
 * @slot hint - A line under the label ("Ages 13 or above").
 * @slot decrement-icon - The − button's icon.
 * @slot increment-icon - The + button's icon.
 *
 * @csspart stepper - The − value + group.
 *
 * @cssproperty {padding} [--c2-quantity--padding=12px 0]
 * @cssproperty {pixel} [--c2-quantity--gap=12px]
 * @cssproperty {font-weight} [--c2-quantity__label--font-weight=500]
 * @cssproperty {color} [--c2-quantity__hint--color=#71717a]
 * @cssproperty {font-size} [--c2-quantity__hint--font-size=12px]
 * @cssproperty {pixel} [--c2-quantity__button--size=32px]
 * @cssproperty {border} [--c2-quantity__button--border=1px solid #bcbcc6]
 * @cssproperty {border} [--c2-quantity__button__hover--border=1px solid #a1a1aa]
 * @cssproperty {border-radius} [--c2-quantity__button--border-radius=999px]
 * @cssproperty {color} [--c2-quantity__button--color=#18181b]
 * @cssproperty {color} [--c2-quantity__button--background=transparent]
 * @cssproperty {opacity} [--c2-quantity__button__disabled--opacity=0.38]
 * @cssproperty {outline} [--c2-quantity__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {pixel} [--c2-quantity__value--min-width=24px]
 */
@customElement('c2-quantity')
export class Quantity extends LitElement {
  static override styles = unsafeCSS(styles)

  /** The count. */
  @property({ type: Number }) value = 0

  @property({ type: Number }) min = 0

  /** The most this counter allows; the picker's `max-total` may stop it sooner. */
  @property({ type: Number }) max = Number.POSITIVE_INFINITY

  @property({ type: Number }) step = 1

  /** The counter's key in the picker's `values`. Default: its label in lower case. */
  @property() name = ''

  /** The singular noun of the summary ("adult"). */
  @property() one = ''

  /** The plural noun of the summary ("adults"). */
  @property() other = ''

  @property({ type: Boolean, reflect: true }) disabled = false

  /** How much the picker's total limit still allows this counter to grow; set by the picker. */
  @property({ attribute: false }) room = Number.POSITIVE_INFINITY

  /** Set by a disabled picker: the counter is off without an attribute written on it. */
  @property({ attribute: false }) locked = false

  private get inactive(): boolean {
    return this.disabled || this.locked
  }

  private readonly msg = new LocalizeController(this, quantityPickerMessages)

  /** The label's text, from the default slot. */
  get label(): string {
    return [...this.childNodes]
      .filter((node) => !(node instanceof Element && node.hasAttribute('slot')))
      .map((node) => node.textContent ?? '')
      .join('')
      .trim()
  }

  /** The key of this counter in the picker's values. */
  get key(): string {
    return this.name || this.label.toLowerCase()
  }

  private get upper(): number {
    const max = Number.isFinite(this.max) ? this.max : Number.POSITIVE_INFINITY
    return Math.min(max, this.value + Math.max(0, this.room))
  }

  private get stepSize(): number {
    return Number.isFinite(this.step) && this.step > 0 ? this.step : 1
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('value') && !Number.isFinite(this.value)) this.value = this.min
  }

  protected override updated(changed: PropertyValues<this>): void {
    if (changed.has('value') && changed.get('value') !== undefined) this.dispatchEvent(new CustomEvent(QUANTITY_SYNC, { bubbles: true }))
  }

  /** Sets the count within the limits and tells the picker. */
  private set(next: number): void {
    const clamped = Math.max(this.min, Math.min(this.upper, next))
    if (clamped === this.value || this.inactive) return
    this.value = clamped
    this.dispatchEvent(new CustomEvent(QUANTITY_CHANGE, { bubbles: true }))
  }

  private handleKeydown(event: KeyboardEvent): void {
    const keys: Record<string, () => number> = {
      ArrowUp: () => this.value + this.stepSize,
      ArrowRight: () => this.value + this.stepSize,
      ArrowDown: () => this.value - this.stepSize,
      ArrowLeft: () => this.value - this.stepSize,
      Home: () => this.min,
      End: () => this.upper,
    }
    const target = keys[event.key]
    if (!target) return
    event.preventDefault()
    this.set(target())
  }

  override render() {
    const label = this.label
    const atMin = this.value <= this.min
    const atMax = this.value >= this.upper
    const max = Number.isFinite(this.upper) ? this.upper : undefined
    return html`<div class="quantity">
      <div class="text">
        <span class="label" id="label"><slot></slot></span>
        <span class="hint" id="hint"><slot name="hint"></slot></span>
      </div>
      <div class="stepper" part="stepper">
        <button
          class="step"
          type="button"
          tabindex="-1"
          aria-label=${this.msg.t('decrease', label)}
          ?disabled=${this.inactive || atMin}
          @click=${() => this.set(this.value - this.stepSize)}
        >
          <slot name="decrement-icon"><svg viewBox="0 0 24 24" aria-hidden="true">${svg`<path d="M5 12h14"></path>`}</svg></slot>
        </button>
        <span
          class="value"
          role="spinbutton"
          tabindex=${this.inactive ? -1 : 0}
          aria-labelledby="label"
          aria-describedby="hint"
          aria-valuenow=${this.value}
          aria-valuemin=${this.min}
          aria-valuemax=${max ?? nothing}
          aria-disabled=${this.inactive ? 'true' : 'false'}
          @keydown=${this.handleKeydown}
          >${this.value}</span
        >
        <button
          class="step"
          type="button"
          tabindex="-1"
          aria-label=${this.msg.t('increase', label)}
          ?disabled=${this.inactive || atMax}
          @click=${() => this.set(this.value + this.stepSize)}
        >
          <slot name="increment-icon"><svg viewBox="0 0 24 24" aria-hidden="true">${svg`<path d="M12 5v14M5 12h14"></path>`}</svg></slot>
        </button>
      </div>
    </div>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-quantity': Quantity
  }
}
