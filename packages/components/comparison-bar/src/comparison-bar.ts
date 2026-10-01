import { LitElement, html, unsafeCSS } from 'lit'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { SlotPresenceController } from '@c2n/core/dom-helper.js'
import { classMap } from 'lit/directives/class-map.js'
import { styleMap } from 'lit/directives/style-map.js'
import styles from './comparison-bar.scss?inline'

/**
 * Two-segment ratio bar comparing two quantities, such as the bid/ask balance of an order book or the yes/no split of
 * a vote. `start-value` and `end-value` are raw amounts in any unit; the bar splits its width between them in
 * proportion and, with `show-value`, prints each side's share as a percentage at its end. The two percentages always
 * add up to 100. `start-label` and `end-label` name the sides for assistive technology, which reads the whole bar as
 * one image ("Bid 22.43%, Ask 77.57%"). Override either printed share through the `start` and `end` slots.
 *
 * @tag c2-comparison-bar
 *
 * @slot start - Replaces the start side's percentage text (e.g. "Buy 22%").
 * @slot end - Replaces the end side's percentage text.
 *
 * @csspart start-value - Text region at the start edge containing the custom `start` slot or the start percentage fallback.
 * @csspart end-value - Text region at the end edge containing the custom `end` slot or the end percentage fallback.
 * @csspart track - Row holding both segments.
 * @csspart start-segment - Segment sized by `start-value`.
 * @csspart end-segment - Segment sized by `end-value`.
 *
 * @cssproperty {pixel} [--c2-comparison-bar--width=100%] - Width of the whole component; the host is a block by default.
 * @cssproperty {pixel} [--c2-comparison-bar--height=6px] - Thickness of both segments.
 * @cssproperty {pixel} [--c2-comparison-bar--gap=12px] - Space between the percentages and the track.
 * @cssproperty {pixel} [--c2-comparison-bar__track--gap=4px] - Space between the two segments.
 * @cssproperty {border-radius} [--c2-comparison-bar--border-radius=999px] - Rounding of each segment.
 * @cssproperty {time} [--c2-comparison-bar--transition-duration=0.3s] - How long a segment takes to resize when a value changes.
 * @cssproperty {color} [--c2-comparison-bar__start-segment--background-color=#0265dc] - Colour of the start segment.
 * @cssproperty {color} [--c2-comparison-bar__end-segment--background-color=#dc2626] - Colour of the end segment.
 * @cssproperty {color} [--c2-comparison-bar__start-value--color=#0265dc] - Colour of the start percentage.
 * @cssproperty {color} [--c2-comparison-bar__end-value--color=#dc2626] - Colour of the end percentage.
 * @cssproperty {font-size} [--c2-comparison-bar__value--font-size=14px] - Size of both percentages.
 * @cssproperty {font-weight} [--c2-comparison-bar__value--font-weight=500] - Weight of both percentages.
 */
@customElement('c2-comparison-bar')
export class ComparisonBar extends LitElement {
  static override styles = unsafeCSS(styles)

  /** Amount on the start side (bids, buyers, "yes" votes). Negative values count as `0`. */
  @property({ type: Number, attribute: 'start-value' }) startValue = 0

  /** Amount on the end side (asks, sellers, "no" votes). Negative values count as `0`. */
  @property({ type: Number, attribute: 'end-value' }) endValue = 0

  /** Name of the start side, announced before its share. */
  @property({ attribute: 'start-label' }) startLabel = ''

  /** Name of the end side, announced before its share. */
  @property({ attribute: 'end-label' }) endLabel = ''

  /** Print each side's percentage at its end of the bar. Always on for a side whose slot has content. */
  @property({ type: Boolean, attribute: 'show-value', reflect: true }) showValue = false

  /** Fraction digits of the printed and announced percentages. */
  @property({ type: Number }) precision = 2

  /** BCP 47 locale used to format the percentages; the document's locale when unset. */
  @property() locale: string | undefined = undefined

  private readonly slotPresence = new SlotPresenceController(this, ['start', 'end'])

  /** Share of the start side, `0` to `100`. Both sides get `50` while neither has an amount. */
  get startPercent(): number {
    const start = this.amount(this.startValue)
    const total = start + this.amount(this.endValue)
    if (total === 0) return 50
    const factor = 10 ** this.digits
    return Math.round((start / total) * 100 * factor) / factor
  }

  /** Share of the end side; always `100 - startPercent`, so the printed shares add up. */
  get endPercent(): number {
    const factor = 10 ** this.digits
    return Math.round((100 - this.startPercent) * factor) / factor
  }

  private get digits(): number {
    return Number.isFinite(this.precision) ? Math.min(20, Math.max(0, Math.trunc(this.precision))) : 2
  }

  private amount(value: number): number {
    return Number.isFinite(value) && value > 0 ? value : 0
  }

  private format(percent: number): string {
    const digits = this.digits
    try {
      return new Intl.NumberFormat(this.locale, { style: 'percent', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(percent / 100)
    } catch {
      return `${percent.toFixed(digits)}%`
    }
  }

  override render() {
    const start = this.startPercent
    const end = this.endPercent
    const startText = this.format(start)
    const endText = this.format(end)
    const name = [this.startLabel ? `${this.startLabel} ${startText}` : startText, this.endLabel ? `${this.endLabel} ${endText}` : endText].join(', ')
    return html`
      <div class="c2-comparison-bar" role="img" aria-label=${name}>
        <span class="c2-comparison-bar-value is-start" part="start-value" aria-hidden="true" ?hidden=${!this.showValue && !this.slotPresence.has('start')}>
          <slot name="start" @slotchange=${this.slotPresence.handleSlotChange}>${startText}</slot>
        </span>
        <div class="c2-comparison-bar-track" part="track">
          <div
            class=${classMap({ 'c2-comparison-bar-segment': true, 'is-start': true, 'is-empty': start === 0 })}
            part="start-segment"
            style=${styleMap({ flexGrow: String(start) })}
          ></div>
          <div
            class=${classMap({ 'c2-comparison-bar-segment': true, 'is-end': true, 'is-empty': end === 0 })}
            part="end-segment"
            style=${styleMap({ flexGrow: String(end) })}
          ></div>
        </div>
        <span class="c2-comparison-bar-value is-end" part="end-value" aria-hidden="true" ?hidden=${!this.showValue && !this.slotPresence.has('end')}>
          <slot name="end" @slotchange=${this.slotPresence.handleSlotChange}>${endText}</slot>
        </span>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-comparison-bar': ComparisonBar
  }
}
