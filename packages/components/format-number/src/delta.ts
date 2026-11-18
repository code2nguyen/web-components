import { html, nothing, unsafeCSS } from 'lit'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import { FormatNumber, formatNumberToParts, toNumber, type FormatNumberOptions, type FormatNumberSignDisplay } from './format-number'
import { formatNumberMessages } from './messages'
import styles from './delta.scss?inline'

export { formatNumberMessages } from './messages'

/** Which direction of change is good: a rise in revenue (`higher`), a fall in cost, latency or churn (`lower`). */
export type DeltaBetter = 'higher' | 'lower'

/**
 * A change, the delta chip of a dashboard: `c2-format-number` with an arrow up or down and the good or bad colour by
 * its sign. `better="lower"` inverts the colours for a cost or a latency, where a fall is good. The arrow's accessible
 * name says both ("Increase, worse"), so the colour is never the only sign of it. A value that shows as zero once
 * rounded ("0.0%") is flat: no arrow, the flat colour. The `comparison` slot says what the change is measured against
 * ("vs last month"), after the number in a quieter colour, and stays beside the default slot's fallback while `value`
 * is not a number. Every attribute of `c2-format-number` works here, and the sign shows by default
 * (`sign-display="exceptZero"`). The good, bad and flat colours replace `c2-format-number`'s negative and positive ones.
 *
 * @tag c2-delta
 *
 * @slot - Fallback content shown while `value` is unset or not a number.
 * @slot comparison - What the change is measured against, after the number: "vs last month".
 * @slot increase-icon - The arrow before a value above zero; an up arrow by default.
 * @slot decrease-icon - The arrow before a value below zero; a down arrow by default.
 *
 * @csspart number - The `<data>` element holding the formatted change and its arrow, with the raw value as its `value`.
 * @csspart unit - Each currency symbol, unit name, percent sign or compact suffix inside the number.
 * @csspart arrow - The arrow's accessible name, wrapping the `increase-icon` or `decrease-icon` slot. Hide the arrow with `--c2-delta__arrow--display`, not by hiding this part, which would also remove that name.
 * @csspart comparison - The wrapper of the `comparison` slot, placed after the number: the label text it projects inherits its colour and size.
 *
 * @cssproperty {color} [--c2-delta__good--color=#15803d] - Colour of a good change: a rise, or a fall with `better="lower"`.
 * @cssproperty {color} [--c2-delta__bad--color=#b91c1c] - Colour of a bad change: a fall, or a rise with `better="lower"`.
 * @cssproperty {color} [--c2-delta__flat--color=#71717a] - Colour of a change that shows as zero.
 * @cssproperty {length} [--c2-delta__arrow--size=0.75em] - Width and height of the default arrow.
 * @cssproperty {length} [--c2-delta__arrow--margin-inline-end=0.2em] - Space between the arrow and the digits.
 * @cssproperty {string} [--c2-delta__arrow--display=inline] - `none` hides the arrow and its gap where the sign and colour already say the direction; its name ("Increase, better") stays in the accessibility tree.
 * @cssproperty {color} [--c2-delta__comparison--color=#71717a] - Colour of the comparison label.
 * @cssproperty {font-size} [--c2-delta__comparison--font-size=inherit] - Size of the comparison label.
 * @cssproperty {length} [--c2-delta__comparison--margin-inline-start=0.35em] - Space between the number and the comparison label.
 * @cssproperty {string} [--c2-delta__comparison--white-space=normal] - Whether the comparison label may wrap; the number itself never does.
 */
@customElement('c2-delta')
export class Delta extends FormatNumber {
  static override styles = [FormatNumber.styles, unsafeCSS(styles)]

  /** Which direction is good: `higher` (the default: revenue, sign-ups) or `lower` (cost, latency, churn). */
  @property() better: DeltaBetter = 'higher'

  /** When to show the sign: `exceptZero` (the default here: "+12.4%", "-3.1%", "0%"), `always`, `auto`, `negative` or `never`. */
  @property({ attribute: 'sign-display' }) override signDisplay: FormatNumberSignDisplay = 'exceptZero'

  readonly #msg = new LocalizeController(this, formatNumberMessages, () => this.locale)

  override render() {
    const value = toNumber(this.value)
    const comparison = html`<span part="comparison"><slot name="comparison"></slot></span>`
    if (value === undefined) return html`<slot></slot>${comparison}`
    const options = this.formatOptions
    const parts = formatNumberToParts(value, options)
    // Flat when it shows as zero ("0.0%"), whatever the sign of the raw value.
    const direction = isZero(parts, options) ? 0 : Math.sign(value)
    const good = this.better === 'lower' ? direction < 0 : direction > 0
    const name = direction > 0 ? 'increase' : 'decrease'
    const arrow = direction
      ? html`<span part="arrow" role="img" aria-label=${this.#msg.t(`${name}${good ? 'Better' : 'Worse'}`)}
          ><span class="glyph"
            ><slot name="${name}-icon"
              ><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2l6 7h-4v5H6V9H2z"></path></svg></slot></span
        ></span>`
      : nothing
    return html`${this.renderNumber(value, options, parts, { good, bad: !!direction && !good, flat: !direction }, arrow)}${comparison}`
  }
}

/** Whether `parts` show the digits of zero in the same options. */
function isZero(parts: Intl.NumberFormatPart[], options: FormatNumberOptions): boolean {
  const digits = (list: Intl.NumberFormatPart[]) => list.map((part) => (part.type === 'integer' || part.type === 'fraction' ? part.value : '')).join()
  return digits(parts) === digits(formatNumberToParts(0, options))
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-delta': Delta
  }
}
