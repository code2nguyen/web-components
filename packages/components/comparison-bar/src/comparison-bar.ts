import { LitElement, html, unsafeCSS } from 'lit'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { SlotPresenceController } from '@c2n/core/dom-helper.js'
import { classMap } from 'lit/directives/class-map.js'
import { styleMap } from 'lit/directives/style-map.js'
import styles from './comparison-bar.scss?inline'

/** One segment's share, in percent, as computed from the raw amounts. */
export interface ComparisonBarShares {
  start: number
  middle: number | undefined
  end: number
}

/**
 * Segmented ratio bar comparing two or three quantities, such as the bid/ask balance of an order book or the
 * win/draw/loss split of a record. `start-value` and `end-value` are raw amounts in any unit, and an optional
 * `middle-value` adds a third segment between them; the bar splits its width in proportion and, with `show-value`,
 * prints each share as a percentage: the start and end shares at their edges of the bar, the middle share centred
 * under its segment. The printed percentages always add up to 100. `start-label`, `middle-label` and `end-label` name
 * the segments for assistive technology, which reads the whole bar as one image ("Bid 22.43%, Ask 77.57%"). Override
 * any printed share through the `start`, `middle` and `end` slots.
 *
 * @tag c2-comparison-bar
 *
 * @slot start - Replaces the start segment's percentage text (e.g. "Buy 22%").
 * @slot middle - Replaces the middle segment's percentage text. Only rendered when `middle-value` is set.
 * @slot end - Replaces the end segment's percentage text.
 *
 * @csspart start-value - Text region at the start edge containing the custom `start` slot or the start percentage fallback.
 * @csspart middle-value - Text region under the middle segment containing the custom `middle` slot or the middle percentage fallback.
 * @csspart end-value - Text region at the end edge containing the custom `end` slot or the end percentage fallback.
 * @csspart track - Row holding the segments.
 * @csspart start-segment - Segment sized by `start-value`.
 * @csspart middle-segment - Segment sized by `middle-value`.
 * @csspart end-segment - Segment sized by `end-value`.
 *
 * @cssproperty {pixel} [--c2-comparison-bar--width=100%] - Width of the whole component; the host is a block by default.
 * @cssproperty {pixel} [--c2-comparison-bar--height=6px] - Thickness of the segments.
 * @cssproperty {pixel} [--c2-comparison-bar--gap=12px] - Space between the edge percentages and the track.
 * @cssproperty {pixel} [--c2-comparison-bar__track--gap=4px] - Space between two segments.
 * @cssproperty {pixel} [--c2-comparison-bar__middle-value--margin-top=4px] - Space between the track and the middle percentage.
 * @cssproperty {border-radius} [--c2-comparison-bar--border-radius=999px] - Rounding of each segment.
 * @cssproperty {time} [--c2-comparison-bar--transition-duration=0.3s] - How long a segment takes to resize when a value changes.
 * @cssproperty {color} [--c2-comparison-bar__start-segment--background-color=#0265dc] - Colour of the start segment.
 * @cssproperty {color} [--c2-comparison-bar__middle-segment--background-color=#a1a1aa] - Colour of the middle segment.
 * @cssproperty {color} [--c2-comparison-bar__end-segment--background-color=#dc2626] - Colour of the end segment.
 * @cssproperty {color} [--c2-comparison-bar__start-value--color=#0265dc] - Colour of the start percentage.
 * @cssproperty {color} [--c2-comparison-bar__middle-value--color=#71717a] - Colour of the middle percentage.
 * @cssproperty {color} [--c2-comparison-bar__end-value--color=#dc2626] - Colour of the end percentage.
 * @cssproperty {font-size} [--c2-comparison-bar__value--font-size=14px] - Size of the percentages.
 * @cssproperty {font-weight} [--c2-comparison-bar__value--font-weight=500] - Weight of the percentages.
 */
@customElement('c2-comparison-bar')
export class ComparisonBar extends LitElement {
  static override styles = unsafeCSS(styles)

  /** Amount of the start segment (bids, buyers, wins). Negative values count as `0`. */
  @property({ type: Number, attribute: 'start-value' }) startValue = 0

  /** Amount of the optional middle segment (draws, abstentions). Leave unset for a two-segment bar. */
  @property({ type: Number, attribute: 'middle-value' }) middleValue: number | undefined = undefined

  /** Amount of the end segment (asks, sellers, losses). Negative values count as `0`. */
  @property({ type: Number, attribute: 'end-value' }) endValue = 0

  /** Name of the start segment, announced before its share. */
  @property({ attribute: 'start-label' }) startLabel = ''

  /** Name of the middle segment, announced before its share. */
  @property({ attribute: 'middle-label' }) middleLabel = ''

  /** Name of the end segment, announced before its share. */
  @property({ attribute: 'end-label' }) endLabel = ''

  /** Print each segment's percentage. Always on for a segment whose slot has content. */
  @property({ type: Boolean, attribute: 'show-value', reflect: true }) showValue = false

  /** Fraction digits of the printed and announced percentages. */
  @property({ type: Number }) precision = 2

  /** BCP 47 locale used to format the percentages; the document's locale when unset. */
  @property() locale: string | undefined = undefined

  private readonly slotPresence = new SlotPresenceController(this, ['start', 'middle', 'end'])

  /** Whether the bar has a middle segment. */
  get hasMiddle(): boolean {
    return this.middleValue !== undefined && this.middleValue !== null && !Number.isNaN(this.middleValue)
  }

  /**
   * Each segment's share in percent, rounded to `precision` so that they add up to exactly 100 (largest remainder).
   * The segments split evenly while none has an amount.
   */
  get shares(): ComparisonBarShares {
    const amounts = [this.startValue, ...(this.hasMiddle ? [this.middleValue as number] : []), this.endValue].map((value) =>
      Number.isFinite(value) && value > 0 ? value : 0,
    )
    const total = amounts.reduce((sum, value) => sum + value, 0)
    const factor = 10 ** this.digits
    // Work in integer units of the last printed digit so rounding never leaves a remainder of 0.01%.
    const units = 100 * factor
    const exact = amounts.map((value) => (total === 0 ? units / amounts.length : (value / total) * units))
    const floored = exact.map(Math.floor)
    let left = units - floored.reduce((sum, value) => sum + value, 0)
    const order = exact.map((value, index) => ({ index, remainder: value - floored[index] })).sort((a, b) => b.remainder - a.remainder)
    for (const { index } of order) {
      if (left <= 0) break
      floored[index] += 1
      left -= 1
    }
    const percent = floored.map((value) => value / factor)
    return this.hasMiddle ? { start: percent[0], middle: percent[1], end: percent[2] } : { start: percent[0], middle: undefined, end: percent[1] }
  }

  /** Share of the start segment, `0` to `100`. */
  get startPercent(): number {
    return this.shares.start
  }

  /** Share of the middle segment; `undefined` without a `middle-value`. */
  get middlePercent(): number | undefined {
    return this.shares.middle
  }

  /** Share of the end segment, `0` to `100`. */
  get endPercent(): number {
    return this.shares.end
  }

  private get digits(): number {
    return Number.isFinite(this.precision) ? Math.min(6, Math.max(0, Math.trunc(this.precision))) : 2
  }

  private format(percent: number): string {
    const digits = this.digits
    try {
      return new Intl.NumberFormat(this.locale, { style: 'percent', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(percent / 100)
    } catch {
      return `${percent.toFixed(digits)}%`
    }
  }

  private segment(side: 'start' | 'middle' | 'end', percent: number) {
    return html`<div
      class=${classMap({ 'c2-comparison-bar-segment': true, [`is-${side}`]: true, 'is-empty': percent === 0 })}
      part="${side}-segment"
      style=${styleMap({ flexGrow: String(percent) })}
    ></div>`
  }

  override render() {
    const { start, middle, end } = this.shares
    const texts = { start: this.format(start), middle: middle === undefined ? '' : this.format(middle), end: this.format(end) }
    const name = [[this.startLabel, texts.start], ...(middle === undefined ? [] : [[this.middleLabel, texts.middle]]), [this.endLabel, texts.end]]
      .map(([label, text]) => (label ? `${label} ${text}` : text))
      .join(', ')
    const shows = (side: 'start' | 'middle' | 'end') => this.showValue || this.slotPresence.has(side)
    const showMiddle = middle !== undefined && shows('middle')
    return html`
      <div class="c2-comparison-bar" role="img" aria-label=${name}>
        <span class="c2-comparison-bar-value is-start" part="start-value" aria-hidden="true" ?hidden=${!shows('start')}>
          <slot name="start" @slotchange=${this.slotPresence.handleSlotChange}>${texts.start}</slot>
        </span>
        <div class="c2-comparison-bar-track" part="track">
          ${this.segment('start', start)} ${middle === undefined ? '' : this.segment('middle', middle)} ${this.segment('end', end)}
        </div>
        ${
          middle === undefined
            ? ''
            : html`<div class="c2-comparison-bar-track c2-comparison-bar-legend" aria-hidden="true" ?hidden=${!showMiddle}>
                <div class=${classMap({ 'c2-comparison-bar-cell': true, 'is-empty': start === 0 })} style=${styleMap({ flexGrow: String(start) })}></div>
                <span class="c2-comparison-bar-value is-middle" part="middle-value" style=${styleMap({ flexGrow: String(middle) })}>
                  <slot name="middle" @slotchange=${this.slotPresence.handleSlotChange}>${texts.middle}</slot>
                </span>
                <div class=${classMap({ 'c2-comparison-bar-cell': true, 'is-empty': end === 0 })} style=${styleMap({ flexGrow: String(end) })}></div>
              </div>`
        }
        <span class="c2-comparison-bar-value is-end" part="end-value" aria-hidden="true" ?hidden=${!shows('end')}>
          <slot name="end" @slotchange=${this.slotPresence.handleSlotChange}>${texts.end}</slot>
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
